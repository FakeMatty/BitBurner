/** @param {NS} ns */
import { scanNetwork, getRootAccess, copyWorkerScripts } from './utils.js';

/**
 * Ultra-aggressive training script that uses EVERY byte of available RAM
 * to maximize hacking skill gains. Continuously spawns weaken threads
 * across all available servers without waiting.
 */
export async function main(ns) {
    ns.disableLog('ALL');
    ns.tail();

    const target = ns.args[0] || 'n00dles';
    const workerScript = 'weaken.js';
    const scriptRam = ns.getScriptRam(workerScript);

    ns.print(`MAXIMUM TRAINING MODE`);
    ns.print(`Target: ${target}\n`);

    // Get all servers
    const allServers = scanNetwork(ns);

    // Get root access on everything
    for (const server of allServers) {
        getRootAccess(ns, server);
    }

    // Kill everything to start fresh
    for (const server of allServers) {
        if (ns.hasRootAccess(server)) {
            ns.killall(server);
        }
    }

    // Copy scripts
    await copyWorkerScripts(ns, allServers);

    ns.print('Starting infinite training loop...\n');

    let iteration = 0;
    const startTime = Date.now();
    const startLevel = ns.getHackingLevel();

    while (true) {
        iteration++;
        let totalThreads = 0;
        let totalRamUsed = 0;

        // Get all servers we can use
        const usableServers = allServers.filter(server =>
            ns.hasRootAccess(server) && ns.getServerMaxRam(server) > 0
        );

        for (const server of usableServers) {
            const maxRam = ns.getServerMaxRam(server);
            const usedRam = ns.getServerUsedRam(server);
            const availableRam = maxRam - usedRam;

            // On home, reserve some RAM for this script
            const reservedRam = server === 'home' ? 32 : 0;
            const usableRam = Math.max(0, availableRam - reservedRam);

            if (usableRam < scriptRam) continue;

            const threads = Math.floor(usableRam / scriptRam);

            if (threads > 0) {
                ns.exec(workerScript, server, threads, target, Date.now());
                totalThreads += threads;
                totalRamUsed += threads * scriptRam;
            }
        }

        // Update display every 10 iterations
        if (iteration % 10 === 0) {
            const runtime = (Date.now() - startTime) / 1000 / 60; // minutes
            const currentLevel = ns.getHackingLevel();
            const levelsGained = currentLevel - startLevel;
            const levelsPerMin = runtime > 0 ? (levelsGained / runtime).toFixed(2) : 0;

            ns.clearLog();
            ns.print(`═══════════════════════════════════════`);
            ns.print(`        MAXIMUM TRAINING MODE          `);
            ns.print(`═══════════════════════════════════════`);
            ns.print(`Target: ${target}`);
            ns.print(`Servers: ${usableServers.length}`);
            ns.print(`Threads: ${totalThreads.toLocaleString()}`);
            ns.print(`RAM Used: ${ns.formatRam(totalRamUsed)}`);
            ns.print(`───────────────────────────────────────`);
            ns.print(`Current Level: ${currentLevel}`);
            ns.print(`Levels Gained: ${levelsGained}`);
            ns.print(`Levels/Min: ${levelsPerMin}`);
            ns.print(`Runtime: ${runtime.toFixed(1)} minutes`);
            ns.print(`═══════════════════════════════════════`);
        }

        // Very short sleep to avoid blocking, then immediately spawn more
        await ns.sleep(200);
    }
}
