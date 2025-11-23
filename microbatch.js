/**
 * Micro-batcher that repeatedly fires small hack -> weaken -> grow -> weaken batches
 * with tight spacing, capping each exec call to 10 threads and waiting for free
 * RAM across rooted servers before launching a batch.
 *
 * Usage: run microbatch.js [target] [maxThreadsPerExec=10] [homeReserveRam=0] [gapMs=250]
 *
 * - target: server to batch against (default: foodnstuff)
 * - maxThreadsPerExec: upper bound on threads per action.js exec (hard capped at 10)
 * - homeReserveRam: RAM in GB to leave free on home
 * - gapMs: spacing in milliseconds between batch steps and between batches
 *
 * Requires action.js to be present on hosts that execute it.
 * @param {NS} ns
 */
export async function main(ns) {
    const target = String(ns.args[0] || "foodnstuff");
    const maxThreadsPerExec = clamp(Number(ns.args[1]) || 10, 1, 10);
    const homeReserve = Math.max(0, Number(ns.args[2]) || 0);
    const gapMs = Math.max(10, Number(ns.args[3]) || 250);

    const actionScript = "action.js";
    const actionRam = Math.max(1.75, ns.getScriptRam(actionScript, "home") || 0);

    ns.print(`Starting micro-batcher on ${target} with <=${maxThreadsPerExec} threads per action and gap ${gapMs}ms`);

    while (true) {
        const hosts = getRootedHosts(ns).filter(h => ns.getServerMaxRam(h) > 0);
        const totalThreads = availableThreads(ns, hosts, actionRam, homeReserve);

        const growThreads = 1;
        const growMultiplier = estimateGrowthMultiplierForOneThread(ns, target);
        const hackPctPerThread = Math.max(0, ns.hackAnalyze(target));
        const weakenEffect = ns.weakenAnalyze(1);
        const hackTargetFraction = 1 - 0.99 / growMultiplier;
        const hackThreads = Math.max(1, Math.floor(hackTargetFraction / (hackPctPerThread || Number.EPSILON)));
        const weakenHack = Math.max(1, Math.ceil(ns.hackAnalyzeSecurity(hackThreads, target) / (weakenEffect || 0.05)));
        const weakenGrow = Math.max(1, Math.ceil(ns.growthAnalyzeSecurity(growThreads, target) / (weakenEffect || 0.05)));

        const threadsNeeded = hackThreads + weakenHack + growThreads + weakenGrow;
        if (totalThreads < threadsNeeded) {
            ns.print(`Waiting for RAM: need ${threadsNeeded} threads worth (${(threadsNeeded * actionRam).toFixed(2)}GB), have ${totalThreads}`);
            await ns.sleep(500);
            continue;
        }

        const hackTime = ns.getHackTime(target);
        const weakenTime = ns.getWeakenTime(target);
        const growTime = ns.getGrowTime(target);

        const now = Date.now();
        const steps = [
            { action: "hack", delay: 0, duration: hackTime, threads: hackThreads },
            { action: "weaken", delay: gapMs, duration: weakenTime, threads: weakenHack },
            { action: "grow", delay: gapMs * 2, duration: growTime, threads: growThreads },
            { action: "weaken", delay: gapMs * 3, duration: weakenTime, threads: weakenGrow },
        ];

        let ok = true;
        for (const step of steps) {
            const finish = now + step.delay + step.duration;
            ns.print(`Scheduling ${step.action} x${step.threads} start=${new Date(now + step.delay).toISOString()} finish=${new Date(finish).toISOString()} GMT`);
            const placed = scheduleAction(ns, hosts, target, step.action, actionScript, step.delay, step.threads, actionRam, homeReserve, maxThreadsPerExec);
            if (!placed) {
                ns.print(`Insufficient RAM to place ${step.action}. Waiting for space...`);
                ok = false;
                break;
            }
        }

        if (!ok) {
            await ns.sleep(500);
            continue;
        }

        await ns.sleep(gapMs);
    }
}

function scheduleAction(ns, hosts, target, action, script, delay, threadsNeeded, actionRam, homeReserve, maxThreadsPerExec) {
    let remaining = threadsNeeded;
    const sorted = hosts.slice().sort((a, b) => freeRam(ns, b, homeReserve) - freeRam(ns, a, homeReserve));

    for (const host of sorted) {
        let hostFree = freeRam(ns, host, homeReserve);
        if (hostFree < actionRam) continue;

        let hostThreads = Math.min(Math.floor(hostFree / actionRam), maxThreadsPerExec);
        while (hostThreads > 0 && remaining > 0) {
            const use = Math.min(remaining, hostThreads, maxThreadsPerExec);
            const pid = ns.exec(script, host, use, target, action, delay);
            if (pid === 0) {
                // Could not start; break to re-evaluate host state later.
                hostThreads = 0;
                break;
            }
            remaining -= use;
            hostFree -= use * actionRam;
            hostThreads = Math.min(Math.floor(hostFree / actionRam), maxThreadsPerExec);
        }

        if (remaining <= 0) break;
    }

    return remaining <= 0;
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

function estimateGrowthMultiplierForOneThread(ns, target) {
    let low = 1;
    let high = 2;

    while (ns.growthAnalyze(target, high) < 1 && high < 1e6) {
        low = high;
        high *= 2;
    }

    for (let i = 0; i < 25; i++) {
        const mid = (low + high) / 2;
        const threads = ns.growthAnalyze(target, mid);
        if (threads > 1) {
            high = mid;
        } else {
            low = mid;
        }
    }

    return Math.max(1, high);
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}
