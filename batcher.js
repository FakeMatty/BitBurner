/**
 * Home-managed batcher that schedules hack -> weaken -> grow -> weaken cycles
 * with small gaps so completions land a couple hundred milliseconds apart.
 *
 * Goals
 * - Keep the target near max money and min security.
 * - Limit grow steps to at most 5 threads to stay RAM-friendly for new saves.
 * - Use all rooted servers for capacity, but coordinate timing from home.
 *
 * Usage: run batcher.js [target] [homeReserveRam] [maxGrowThreads] [gapMs]
 *   target: server to hack (default: foodnstuff)
 *   homeReserveRam: GB to leave free on home (default: 16)
 *   maxGrowThreads: cap on grow threads per step (default: 5)
 *   gapMs: spacing between batch completions (default: 200ms, min 100ms)
 *
 * Requires action.js on every host that will run actions.
 * @param {NS} ns
 */
export async function main(ns) {
    const target = String(ns.args[0] || "foodnstuff");
    const homeReserve = Math.max(0, Number(ns.args[1]) || 16);
    const maxGrowThreads = clamp(Math.floor(Number(ns.args[2]) || 5), 1, 5);
    const gapMs = Math.max(100, Number(ns.args[3]) || 200);

    const actionScript = "action.js";
    const actionRam = Math.max(1.75, ns.getScriptRam(actionScript, "home") || 0);

    ns.tprint(`Batching ${target} with grow capped at ${maxGrowThreads} threads and ${gapMs}ms gaps (home reserve ${homeReserve}GB).`);

    while (true) {
        const hosts = getRootedHosts(ns).filter((h) => ns.getServerMaxRam(h) > 0);
        if (!hosts.includes("home")) hosts.push("home");

        await ensurePrepped(ns, target, hosts, actionRam, homeReserve, maxGrowThreads);

        const plan = planBatch(ns, target, maxGrowThreads);
        if (!plan) {
            ns.print("Waiting for server to have money before batching...");
            await ns.sleep(500);
            continue;
        }

        const threadsPerBatch = plan.hack + plan.grow + plan.weakenHack + plan.weakenGrow;
        const available = availableThreads(ns, hosts, actionRam, homeReserve);
        if (available < threadsPerBatch) {
            ns.print(`Need ${threadsPerBatch} threads worth (${(threadsPerBatch * actionRam).toFixed(2)}GB), have ${available}. Waiting for RAM...`);
            await ns.sleep(500);
            continue;
        }

        const schedule = buildSchedule(ns, target, plan, gapMs);
        const ok = dispatchSchedule(ns, hosts, target, schedule, actionScript, actionRam, homeReserve, maxGrowThreads);
        if (!ok) {
            ns.print("Could not place full batch; retrying after a short pause.");
            await ns.sleep(500);
            continue;
        }

        const lastFinish = Math.max(...schedule.map((s) => s.finish));
        const timeUntilDone = Math.max(0, lastFinish - Date.now());
        ns.print(`Batch launched. Last step finishes at ${new Date(lastFinish).toISOString()} GMT (~${Math.ceil(timeUntilDone / 1000)}s).`);

        // Sleep a bit before planning the next batch; this is shorter than the batch itself
        // so overlapping batches can happen if RAM allows.
        await ns.sleep(Math.max(gapMs, timeUntilDone / 4));
    }
}

function planBatch(ns, target, maxGrowThreads) {
    const maxMoney = ns.getServerMaxMoney(target);
    if (maxMoney <= 0) return null;

    const money = Math.max(1, ns.getServerMoneyAvailable(target));
    const hackPctPerThread = ns.hackAnalyze(target);
    if (hackPctPerThread <= 0) return null;

    const desiredHackFraction = 0.05; // Steal ~5% each batch for stability
    let hackThreads = Math.max(1, Math.floor(desiredHackFraction / hackPctPerThread));
    const hackAmount = Math.min(money, money * hackPctPerThread * hackThreads);

    const moneyAfterHack = Math.max(1, money - hackAmount);
    const desiredMoney = maxMoney * 0.99;
    const growFactor = Math.max(1.01, desiredMoney / moneyAfterHack);
    const growThreads = clamp(Math.ceil(ns.growthAnalyze(target, growFactor)), 1, maxGrowThreads);

    const weakenEffect = ns.weakenAnalyze(1) || 0.05;
    const weakenHack = Math.max(1, Math.ceil(ns.hackAnalyzeSecurity(hackThreads, target) / weakenEffect));
    const weakenGrow = Math.max(1, Math.ceil(ns.growthAnalyzeSecurity(growThreads, target) / weakenEffect));

    return {
        hack: hackThreads,
        grow: growThreads,
        weakenHack,
        weakenGrow,
    };
}

async function ensurePrepped(ns, target, hosts, actionRam, homeReserve, maxGrowThreads) {
    while (true) {
        const money = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);
        const sec = ns.getServerSecurityLevel(target);
        const minSec = ns.getServerMinSecurityLevel(target);

        const moneyReady = money >= maxMoney * 0.99;
        const secReady = sec <= minSec + 0.05;
        if (moneyReady && secReady) return;

        const growNeeded = moneyReady ? 0 : clamp(Math.ceil(ns.growthAnalyze(target, maxMoney / Math.max(1, money))), 1, maxGrowThreads);
        const growSec = growNeeded > 0 ? ns.growthAnalyzeSecurity(growNeeded, target) : 0;
        const secDelta = Math.max(0, sec - minSec) + growSec;
        const weakenEffect = ns.weakenAnalyze(1) || 0.05;
        const weakenNeeded = Math.max(1, Math.ceil(secDelta / weakenEffect));

        const prepSchedule = buildPrepSchedule(ns, target, growNeeded, weakenNeeded);
        const placed = dispatchSchedule(ns, hosts, target, prepSchedule, "action.js", actionRam, homeReserve, maxGrowThreads);
        if (!placed) {
            ns.print("Prep waiting for RAM...");
            await ns.sleep(500);
            continue;
        }

        const lastFinish = Math.max(...prepSchedule.map((s) => s.finish));
        ns.print(`Prep cycle launched; finishes at ${new Date(lastFinish).toISOString()} GMT.`);
        await ns.sleep(Math.max(200, lastFinish - Date.now()));
    }
}

function buildSchedule(ns, target, plan, gapMs) {
    const now = Date.now();
    const hackTime = ns.getHackTime(target);
    const growTime = ns.getGrowTime(target);
    const weakenTime = ns.getWeakenTime(target);

    let finishHack = now + gapMs;
    let finishWeakenHack = finishHack + gapMs;
    let finishGrow = finishWeakenHack + gapMs;
    let finishWeakenGrow = finishGrow + gapMs;

    let startHack = finishHack - hackTime;
    let startWeakenHack = finishWeakenHack - weakenTime;
    let startGrow = finishGrow - growTime;
    let startWeakenGrow = finishWeakenGrow - weakenTime;

    const earliestStart = Math.min(startHack, startWeakenHack, startGrow, startWeakenGrow);
    if (earliestStart < now) {
        const shift = now - earliestStart + 50;
        finishHack += shift;
        finishWeakenHack += shift;
        finishGrow += shift;
        finishWeakenGrow += shift;
        startHack += shift;
        startWeakenHack += shift;
        startGrow += shift;
        startWeakenGrow += shift;
    }

    return [
        { action: "hack", threads: plan.hack, delay: startHack - Date.now(), finish: finishHack },
        { action: "weaken", threads: plan.weakenHack, delay: startWeakenHack - Date.now(), finish: finishWeakenHack },
        { action: "grow", threads: plan.grow, delay: startGrow - Date.now(), finish: finishGrow },
        { action: "weaken", threads: plan.weakenGrow, delay: startWeakenGrow - Date.now(), finish: finishWeakenGrow },
    ];
}

function buildPrepSchedule(ns, target, growThreads, weakenThreads) {
    const now = Date.now();
    const growTime = ns.getGrowTime(target);
    const weakenTime = ns.getWeakenTime(target);
    const gapMs = 200;

    let finishGrow = now + gapMs;
    let finishWeaken = finishGrow + gapMs;

    let startGrow = finishGrow - growTime;
    let startWeaken = finishWeaken - weakenTime;

    const earliest = Math.min(startGrow, startWeaken);
    if (earliest < now) {
        const shift = now - earliest + 50;
        finishGrow += shift;
        finishWeaken += shift;
        startGrow += shift;
        startWeaken += shift;
    }

    const steps = [];
    if (growThreads > 0) {
        steps.push({ action: "grow", threads: growThreads, delay: startGrow - Date.now(), finish: finishGrow });
    }
    steps.push({ action: "weaken", threads: weakenThreads, delay: startWeaken - Date.now(), finish: finishWeaken });
    return steps;
}

function dispatchSchedule(ns, hosts, target, steps, script, actionRam, homeReserve, maxGrowThreads) {
    const sortedHosts = hosts.slice().sort((a, b) => freeRam(ns, b, homeReserve) - freeRam(ns, a, homeReserve));
    for (const step of steps) {
        let remaining = step.threads;
        for (const host of sortedHosts) {
            const free = freeRam(ns, host, homeReserve);
            if (free < actionRam) continue;
            const maxThreadsHere = Math.floor(free / actionRam);
            if (maxThreadsHere <= 0) continue;
            // Grow steps are capped globally at maxGrowThreads per exec; other actions can use larger splits.
            const splitCap = step.action === "grow" ? maxGrowThreads : maxThreadsHere;
            const use = Math.min(remaining, splitCap);
            if (use <= 0) continue;

            const pid = ns.exec(script, host, use, target, step.action, Math.max(0, Math.floor(step.delay)));
            if (pid !== 0) {
                remaining -= use;
            }
            if (remaining <= 0) break;
        }

        if (remaining > 0) {
            ns.print(`Failed to place ${step.action} x${step.threads}. Missing ${remaining} threads.`);
            return false;
        }
    }
    return true;
}

function getRootedHosts(ns) {
    const seen = new Set(["home"]);
    const queue = ["home"];
    const rooted = [];

    while (queue.length > 0) {
        const host = queue.shift();
        if (ns.hasRootAccess(host)) rooted.push(host);
        for (const neighbor of ns.scan(host)) {
            if (!seen.has(neighbor)) {
                seen.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    return rooted;
}

function availableThreads(ns, hosts, actionRam, homeReserve) {
    return hosts.reduce((acc, host) => {
        const free = freeRam(ns, host, homeReserve);
        return acc + Math.max(0, Math.floor(free / actionRam));
    }, 0);
}

function freeRam(ns, host, homeReserve) {
    const maxRam = ns.getServerMaxRam(host);
    const usedRam = ns.getServerUsedRam(host);
    const reserve = host === "home" ? homeReserve : 0;
    return Math.max(0, maxRam - usedRam - reserve);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
