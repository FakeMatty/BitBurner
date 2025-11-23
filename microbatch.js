/**
 * Micro-batcher that repeatedly fires tight hack -> grow -> weaken cycles with
 * single-thread hacks, sized grows to restore ~99% money, and enough weaken
 * threads to return to minimum security. Capped at 10 threads per exec and will
 * wait for network RAM before launching a cycle.
 *
 * Usage: run microbatch.js [target] [maxThreadsPerExec=10] [homeReserveRam=0] [gapMs=100]
 *
 * - target: server to batch against (default: foodnstuff)
 * - maxThreadsPerExec: upper bound on threads per action.js exec (hard capped at 10)
 * - homeReserveRam: RAM in GB to leave free on home
 * - gapMs: spacing in milliseconds between batch steps (defaults to 100ms)
 *
 * Requires action.js to be present on hosts that execute it.
 * @param {NS} ns
 */
export async function main(ns) {
    const target = String(ns.args[0] || "foodnstuff");
    const maxThreadsPerExec = clamp(Number(ns.args[1]) || 10, 1, 10);
    const homeReserve = Math.max(0, Number(ns.args[2]) || 0);
    const gapMs = Math.max(50, Number(ns.args[3]) || 100);

    const actionScript = "action.js";
    const actionRam = Math.max(1.75, ns.getScriptRam(actionScript, "home") || 0);

    ns.print(`Starting micro-batcher on ${target} with <=${maxThreadsPerExec} threads per action and gap ${gapMs}ms`);

    while (true) {
        const hosts = getRootedHosts(ns).filter(h => ns.getServerMaxRam(h) > 0);
        const totalThreads = availableThreads(ns, hosts, actionRam, homeReserve);

        const hackThreads = 1;
        const hackPct = Math.max(0, ns.hackAnalyze(target));
        const growthFactor = Math.max(1.01, 0.99 / Math.max(0.01, 1 - hackPct));
        const growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(target, growthFactor)));
        const weakenEffect = ns.weakenAnalyze(1) || 0.05;
        const securityDelta = ns.hackAnalyzeSecurity(hackThreads, target) + ns.growthAnalyzeSecurity(growThreads, target);
        const weakenThreads = Math.max(1, Math.ceil(securityDelta / weakenEffect));

        const threadsNeeded = hackThreads + growThreads + weakenThreads;
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
            { action: "grow", delay: gapMs, duration: growTime, threads: growThreads },
            { action: "weaken", delay: gapMs * 2, duration: weakenTime, threads: weakenThreads },
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

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}
