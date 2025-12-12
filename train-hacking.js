/** @param {NS} ns */
import { getAvailableServers, getAllRootedServers, copyWorkerScripts } from './utils.js';

export async function main(ns) {
    ns.disableLog('ALL');
    ns.tail();

    // Target for training - n00dles is always available and gives decent exp
    const target = ns.args[0] || 'n00dles';

    ns.print(`Starting hacking training on ${target}`);
    ns.print('Using ALL available RAM across network...\n');

    const workerScript = 'weaken.js';
    const scriptRam = ns.getScriptRam(workerScript);

    // Kill all running scripts to free up RAM
    const allServers = [
        'home',
        ...ns.getPurchasedServers(),
        ...getAllRootedServers(ns)
    ];

    for (const server of allServers) {
        ns.killall(server);
    }

    // Copy worker scripts to all servers
    await copyWorkerScripts(ns, allServers);

    let totalThreads = 0;
    let serversUsed = 0;

    while (true) {
        const servers = getAvailableServers(ns);

        for (const server of servers) {
            const availableRam = server.availableRam;

            // Reserve 64GB on home for running this script and other tasks
            const reservedRam = server.hostname === 'home' ? 64 : 0;
            const usableRam = Math.max(0, availableRam - reservedRam);

            if (usableRam < scriptRam) continue;

            const threads = Math.floor(usableRam / scriptRam);

            if (threads > 0) {
                const pid = ns.exec(workerScript, server.hostname, threads, target);

                if (pid > 0) {
                    totalThreads += threads;
                    serversUsed++;
                    ns.print(`${server.hostname}: Started ${threads} threads (${ns.formatRam(threads * scriptRam)})`);
                }
            }
        }

        ns.print(`\n========================================`);
        ns.print(`Total servers used: ${serversUsed}`);
        ns.print(`Total threads running: ${totalThreads}`);
        ns.print(`Current hacking level: ${ns.getHackingLevel()}`);
        ns.print(`========================================\n`);

        // Wait for all weaken operations to complete
        await ns.sleep(ns.getWeakenTime(target) + 1000);

        // Reset counters for next batch
        totalThreads = 0;
        serversUsed = 0;
    }
}
