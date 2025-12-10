/** @param {NS} ns */
import { getAvailableServers, selectBestTarget, copyWorkerScripts } from './utils.js';

const BATCH_GAP = 100; // ms between operations in a batch
const BATCH_SPACING = 1000; // ms between batches starting

export async function main(ns) {
    ns.disableLog('ALL');
    ns.tail();

    const stealPercent = ns.args[0] || 0.10; // Default 10% steal per batch
    const target = ns.args[1] || selectBestTarget(ns);

    ns.print(`Starting advanced batcher targeting: ${target}`);
    ns.print(`Steal percent per batch: ${(stealPercent * 100).toFixed(1)}%`);

    // Prep target first
    await prepServer(ns, target);
    ns.print(`Server ${target} is prepped and ready`);

    // Copy worker scripts to all servers
    const servers = getAvailableServers(ns);
    await copyWorkerScripts(ns, servers.map(s => s.hostname));

    let batchId = 0;

    while (true) {
        // Check if we need to re-prep
        if (needsPrep(ns, target)) {
            ns.print('WARN: Target drifted, re-prepping...');
            await prepServer(ns, target);
        }

        // Try to launch a new batch
        const launched = await launchBatch(ns, target, stealPercent, batchId);

        if (launched) {
            batchId++;
            await ns.sleep(BATCH_SPACING);
        } else {
            // Not enough RAM, wait a bit
            await ns.sleep(500);
        }
    }
}

async function prepServer(ns, target) {
    const moneyThresh = ns.getServerMaxMoney(target);
    const securityThresh = ns.getServerMinSecurityLevel(target);

    while (true) {
        const currentMoney = ns.getServerMoneyAvailable(target);
        const currentSec = ns.getServerSecurityLevel(target);

        if (currentMoney >= moneyThresh && currentSec <= securityThresh) {
            break;
        }

        const servers = getAvailableServers(ns);

        if (currentSec > securityThresh) {
            // Weaken
            const threadsNeeded = Math.ceil((currentSec - securityThresh) / 0.05);
            await distributeThreads(ns, servers, 'weaken.js', target, threadsNeeded, 0);
            ns.print(`Prepping: Weakening ${target} (sec: ${currentSec.toFixed(2)}/${securityThresh.toFixed(2)})`);
            await ns.sleep(ns.getWeakenTime(target) + 100);
        } else if (currentMoney < moneyThresh) {
            // Grow
            const growthNeeded = moneyThresh / Math.max(currentMoney, 1);
            const threadsNeeded = Math.ceil(ns.growthAnalyze(target, growthNeeded));
            await distributeThreads(ns, servers, 'grow.js', target, threadsNeeded, 0);
            ns.print(`Prepping: Growing ${target} (money: $${ns.formatNumber(currentMoney)}/$${ns.formatNumber(moneyThresh)})`);
            await ns.sleep(ns.getGrowTime(target) + 100);
        }
    }
}

function needsPrep(ns, target) {
    const currentMoney = ns.getServerMoneyAvailable(target);
    const maxMoney = ns.getServerMaxMoney(target);
    const currentSec = ns.getServerSecurityLevel(target);
    const minSec = ns.getServerMinSecurityLevel(target);

    return currentMoney < maxMoney * 0.90 || currentSec > minSec + 1;
}

async function launchBatch(ns, target, stealPercent, batchId) {
    const servers = getAvailableServers(ns);

    // Calculate timings
    const hackTime = ns.getHackTime(target);
    const growTime = ns.getGrowTime(target);
    const weakenTime = ns.getWeakenTime(target);

    // Calculate threads needed
    const hackThreads = Math.max(1, Math.floor(ns.hackAnalyzeThreads(target, ns.getServerMaxMoney(target) * stealPercent)));
    const hackSecIncrease = ns.hackAnalyzeSecurity(hackThreads, target);
    const weaken1Threads = Math.ceil(hackSecIncrease / 0.05);

    // Calculate grow threads needed to recover stolen money
    const moneyAfterHack = ns.getServerMaxMoney(target) * (1 - stealPercent);
    const growthNeeded = ns.getServerMaxMoney(target) / moneyAfterHack;
    const growThreads = Math.ceil(ns.growthAnalyze(target, growthNeeded));
    const growSecIncrease = growThreads * 0.004; // Each grow thread adds 0.004 security
    const weaken2Threads = Math.ceil(growSecIncrease / 0.05);

    const totalThreads = hackThreads + weaken1Threads + growThreads + weaken2Threads;
    const ramPerThread = 1.75; // All our scripts use 1.75 GB
    const totalRamNeeded = totalThreads * ramPerThread;
    const availableRam = servers.reduce((sum, s) => sum + s.availableRam, 0);

    if (availableRam < totalRamNeeded) {
        return false; // Not enough RAM
    }

    // Calculate delays so all operations land in the right order
    // Order: Hack -> Weaken1 -> Grow -> Weaken2
    const landTime = Date.now() + weakenTime;

    const hackDelay = landTime - Date.now() - hackTime;
    const weaken1Delay = landTime + BATCH_GAP - Date.now() - weakenTime;
    const growDelay = landTime + BATCH_GAP * 2 - Date.now() - growTime;
    const weaken2Delay = landTime + BATCH_GAP * 3 - Date.now() - weakenTime;

    // Launch operations
    let success = true;
    success = success && await distributeThreads(ns, servers, 'hack.js', target, hackThreads, hackDelay);
    success = success && await distributeThreads(ns, servers, 'weaken.js', target, weaken1Threads, weaken1Delay);
    success = success && await distributeThreads(ns, servers, 'grow.js', target, growThreads, growDelay);
    success = success && await distributeThreads(ns, servers, 'weaken.js', target, weaken2Threads, weaken2Delay);

    if (success) {
        const batchDuration = weakenTime + BATCH_GAP * 3;
        ns.print(`Batch ${batchId} launched: H${hackThreads} W${weaken1Threads} G${growThreads} W${weaken2Threads} | Duration: ${ns.tFormat(batchDuration)}`);
        ns.print(`  RAM used: ${ns.formatRam(totalRamNeeded)} / ${ns.formatRam(availableRam)} available`);
    }

    return success;
}

async function distributeThreads(ns, servers, script, target, threadsNeeded, delay) {
    const scriptRam = ns.getScriptRam(script);
    let threadsRemaining = threadsNeeded;

    // Sort servers by available RAM (descending)
    const sortedServers = [...servers].sort((a, b) => b.availableRam - a.availableRam);

    for (const server of sortedServers) {
        if (threadsRemaining <= 0) break;

        const maxThreads = Math.floor(server.availableRam / scriptRam);
        const threadsToRun = Math.min(maxThreads, threadsRemaining);

        if (threadsToRun > 0) {
            const pid = ns.exec(script, server.hostname, threadsToRun, target, delay);
            if (pid > 0) {
                threadsRemaining -= threadsToRun;
                server.availableRam -= threadsToRun * scriptRam;
            }
        }
    }

    return threadsRemaining <= 0;
}
