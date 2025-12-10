/** @param {NS} ns */
import { getAllRootedServers, selectBestTarget, getRootAccess, scanNetwork } from './utils.js';

export async function main(ns) {
    ns.disableLog('ALL');
    ns.tail();

    const stealPercent = ns.args[0] || 0.10;

    ns.print('=== Master Control Program Started ===');
    ns.print(`Steal percent: ${(stealPercent * 100).toFixed(1)}%`);

    // Step 1: Root all servers
    ns.print('\n--- Phase 1: Rooting Servers ---');
    const allServers = scanNetwork(ns);
    let rootedCount = 0;

    for (const server of allServers) {
        if (server === 'home') continue;
        if (!ns.hasRootAccess(server)) {
            if (getRootAccess(ns, server)) {
                rootedCount++;
                ns.print(`Rooted: ${server}`);
            }
        }
    }

    ns.print(`Total rooted servers: ${rootedCount}`);

    // Step 2: Select best target
    ns.print('\n--- Phase 2: Target Selection ---');
    const target = selectBestTarget(ns);
    ns.print(`Best target selected: ${target}`);
    ns.print(`  Max money: $${ns.formatNumber(ns.getServerMaxMoney(target))}`);
    ns.print(`  Min security: ${ns.getServerMinSecurityLevel(target)}`);
    ns.print(`  Required hack level: ${ns.getServerRequiredHackingLevel(target)}`);
    ns.print(`  Hack chance: ${(ns.hackAnalyzeChance(target) * 100).toFixed(1)}%`);

    // Step 3: Kill old scripts
    ns.print('\n--- Phase 3: Cleaning Up Old Scripts ---');
    const scripts = ['hack.js', 'grow.js', 'weaken.js', 'batcher.js'];
    for (const server of allServers) {
        for (const script of scripts) {
            if (ns.scriptRunning(script, server)) {
                ns.scriptKill(script, server);
            }
        }
    }
    ns.print('Old scripts killed');

    // Step 4: Launch batcher
    ns.print('\n--- Phase 4: Launching Batcher ---');

    const batcherRam = ns.getScriptRam('batcher.js');
    const homeRam = ns.getServerMaxRam('home') - ns.getServerUsedRam('home');

    if (homeRam < batcherRam) {
        ns.print('ERROR: Not enough RAM on home to run batcher!');
        return;
    }

    const pid = ns.run('batcher.js', 1, stealPercent, target);

    if (pid > 0) {
        ns.print(`Batcher launched successfully (PID: ${pid})`);
        ns.print('\n=== MCP Complete - Batcher is now running ===');
        ns.print(`Monitor the batcher output for batch statistics`);
        ns.print(`Your network is now optimized for maximum profit!`);
    } else {
        ns.print('ERROR: Failed to launch batcher');
    }
}
