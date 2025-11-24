/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const target = ns.args[0] || "n00dles";
    // Roughly what fraction of money to try to steal per batch (will be scaled down if RAM is low)
    const desiredHackFraction = ns.args[1] ?? 0.1; // 0.1 = 10%
    const host = ns.getHostname();
    const batchSpacing = 200;   // ms gap between H, W1, G, W2 landings
    const safetyGap   = 100;    // extra ms to wait after W2 finishes before next batch

    if (!ns.fileExists("/shared/hack.js", host) ||
        !ns.fileExists("/shared/grow.js", host) ||
        !ns.fileExists("/shared/weaken.js", host)) {
        ns.tprint("batcher.js: missing /shared/{hack,grow,weaken}.js on " + host);
        return;
    }

    const hackRam = ns.getScriptRam("/shared/hack.js", host);
    const growRam = ns.getScriptRam("/shared/grow.js", host);
    const weakRam = ns.getScriptRam("/shared/weaken.js", host);

    ns.tprint(`batcher.js starting on ${host} → target ${target}`);

    await prepServer(ns, target, host, growRam, weakRam);
    ns.tprint(`batcher.js: target ${target} prepped.`);

    let batchId = 1;
    while (true) {
        // Re-prep if the server drifted away from ideal state
        if (!isPrepped(ns, target)) {
            ns.print("Server drifted, re-prepping...");
            await prepServer(ns, target, host, growRam, weakRam);
        }

        const cfg = computeBatchThreads(ns, target, desiredHackFraction, host,
                                        hackRam, growRam, weakRam);
        if (!cfg) {
            ns.print("Not enough free RAM to run even a tiny batch. Sleeping...");
            await ns.sleep(5000);
            continue;
        }

        const ok = await scheduleSingleBatch(ns, target, host, batchId, cfg,
                                             batchSpacing, safetyGap);
        if (!ok) {
            ns.print("Failed to launch batch (likely due to sudden RAM usage). Retrying...");
            await ns.sleep(5000);
            continue;
        }
        batchId++;
    }
}

/**
 * Check if the server is "prepped": near min security and near max money.
 */
function isPrepped(ns, target) {
    const minSec = ns.getServerMinSecurityLevel(target);
    const maxMoney = ns.getServerMaxMoney(target);
    const sec = ns.getServerSecurityLevel(target);
    const money = ns.getServerMoneyAvailable(target);

    return sec <= minSec + 0.1 && money >= maxMoney * 0.95;
}

/**
 * Prepare the target server by growing to ~max money and weakening to ~min security,
 * using /shared/grow.js and /shared/weaken.js on the given host.
 */
async function prepServer(ns, target, host, growRam, weakRam) {
    const minSec = ns.getServerMinSecurityLevel(target);
    const maxMoney = ns.getServerMaxMoney(target);

    ns.print(`Prepping ${target}...`);

    while (true) {
        const sec = ns.getServerSecurityLevel(target);
        const money = ns.getServerMoneyAvailable(target);

        if (sec <= minSec + 0.1 && money >= maxMoney * 0.95) break;

        const maxRam = ns.getServerMaxRam(host);
        const usedRam = ns.getServerUsedRam(host);
        let freeRam = Math.max(0, maxRam - usedRam - 2); // keep a tiny buffer

        let weakenThreads = 0;
        let growThreads = 0;

        if (sec > minSec + 0.1 && freeRam >= weakRam) {
            // dedicate roughly half RAM to weaken if needed
            weakenThreads = Math.floor((freeRam / weakRam) * (money < maxMoney * 0.95 ? 0.5 : 1.0));
            weakenThreads = Math.max(1, weakenThreads);
            freeRam -= weakenThreads * weakRam;
        }

        if (money < maxMoney * 0.95 && freeRam >= growRam) {
            growThreads = Math.floor(freeRam / growRam);
            growThreads = Math.max(1, growThreads);
        }

        if (weakenThreads === 0 && growThreads === 0) {
            ns.print("prepServer: no RAM, sleeping...");
            await ns.sleep(5000);
            continue;
        }

        if (weakenThreads > 0) {
            ns.exec("/shared/weaken.js", host, weakenThreads, target, 0, "prepW");
        }
        if (growThreads > 0) {
            ns.exec("/shared/grow.js", host, growThreads, target, 0, "prepG");
        }

        const waitTime = Math.max(
            weakenThreads > 0 ? ns.getWeakenTime(target) : 0,
            growThreads > 0 ? ns.getGrowTime(target) : 0
        ) + 200;

        await ns.sleep(waitTime);
    }

    ns.print(`prepServer: ${target} ready.`);
}

/**
 * Decide how many threads of H / G / W1 / W2 to use,
 * constrained by available RAM and desired hack fraction.
 */
function computeBatchThreads(ns, target, desiredHackFraction, host,
                             hackRam, growRam, weakRam) {
    const maxRam = ns.getServerMaxRam(host);
    const usedRam = ns.getServerUsedRam(host);
    const freeRam = Math.max(0, maxRam - usedRam - 2);

    if (freeRam < hackRam + growRam + 2 * weakRam) {
        return null; // Can't even run 1 thread of each
    }

    const weakenEffectPerThread = ns.weakenAnalyze(1);
    let hackFractionTarget = desiredHackFraction;

    let best = null;

    while (hackFractionTarget > 0.001) {
        const perThreadHack = ns.hackAnalyze(target);
        if (perThreadHack <= 0) return null;

        let hackThreads = Math.floor(hackFractionTarget / perThreadHack);
        if (hackThreads < 1) hackThreads = 1;

        const actualHackFraction = perThreadHack * hackThreads;
        if (actualHackFraction >= 0.99) {
            hackFractionTarget /= 2;
            continue;
        }

        const growFactor = 1 / (1 - actualHackFraction);
        const growThreads = Math.ceil(ns.growthAnalyze(target, growFactor));

        const hackSecInc = ns.hackAnalyzeSecurity(hackThreads, target);
        const growSecInc = ns.growthAnalyzeSecurity(growThreads, target);

        const w1Threads = Math.ceil(hackSecInc / weakenEffectPerThread);
        const w2Threads = Math.ceil(growSecInc / weakenEffectPerThread);

        const totalRamNeeded =
            hackThreads * hackRam +
            growThreads * growRam +
            (w1Threads + w2Threads) * weakRam;

        if (totalRamNeeded <= freeRam) {
            best = {
                hackThreads,
                growThreads,
                w1Threads,
                w2Threads,
                hackFraction: actualHackFraction,
                totalRamNeeded
            };
            break;
        }

        hackFractionTarget /= 2;
    }

    if (!best) return null;

    ns.print(`Batch config: H=${best.hackThreads}, W1=${best.w1Threads}, ` +
             `G=${best.growThreads}, W2=${best.w2Threads}, ` +
             `steal≈${(best.hackFraction * 100).toFixed(2)}%, ` +
             `RAM≈${best.totalRamNeeded.toFixed(2)}GB`);
    return best;
}

/**
 * Schedule a single HWGW batch so that the actions FINISH in this order:
 *   Hack → Weaken1 → Grow → Weaken2
 * with 'batchSpacing' ms between each.
 */
async function scheduleSingleBatch(ns, target, host, batchId, cfg,
                                   batchSpacing, safetyGap) {
    const tHack = ns.getHackTime(target);
    const tGrow = ns.getGrowTime(target);
    const tWeaken = ns.getWeakenTime(target);

    const now = Date.now();

    // We anchor around the END of the second weaken, which is the longest op.
    const w2End = now + tWeaken + 3 * batchSpacing;
    const growEnd = w2End - batchSpacing;
    const w1End = growEnd - batchSpacing;
    const hackEnd = w1End - batchSpacing;

    const hackDelay = Math.max(0, hackEnd - tHack - now);
    const w1Delay  = Math.max(0, w1End  - tWeaken - now);
    const growDelay = Math.max(0, growEnd - tGrow - now);
    const w2Delay  = Math.max(0, w2End  - tWeaken - now);

    ns.print(`Launching batch ${batchId} on ${target} in HWGW finish order.`);

    const pids = [];

    // The order we exec() doesn't matter; the delays control finish order.
    if (cfg.w1Threads > 0) {
        const pid = ns.exec("/shared/weaken.js", host, cfg.w1Threads,
                            target, w1Delay, batchId, "W1");
        if (pid === 0) return false;
        pids.push(pid);
    }

    if (cfg.w2Threads > 0) {
        const pid = ns.exec("/shared/weaken.js", host, cfg.w2Threads,
                            target, w2Delay, batchId, "W2");
        if (pid === 0) return false;
        pids.push(pid);
    }

    if (cfg.growThreads > 0) {
        const pid = ns.exec("/shared/grow.js", host, cfg.growThreads,
                            target, growDelay, batchId, "G");
        if (pid === 0) return false;
        pids.push(pid);
    }

    if (cfg.hackThreads > 0) {
        const pid = ns.exec("/shared/hack.js", host, cfg.hackThreads,
                            target, hackDelay, batchId, "H");
        if (pid === 0) return false;
        pids.push(pid);
    }

    const totalDuration = (w2End - now) + safetyGap;
    await ns.sleep(totalDuration);

    return true;
}
