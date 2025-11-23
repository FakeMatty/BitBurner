/**
 * Early-game bootstrapper to root servers, deploy workers, and buy starter servers.
 *
 * Usage: run bootstrap.js
 *
 * Behavior:
 * - Scans the network, attempts to gain root using any port crackers you own.
 * - Picks the best rooted target based on money and hack level constraints.
 * - Spreads worker.js to all rooted servers and runs it with maximum threads.
 * - Purchases a few small servers when you can easily afford them, reusing them as workers.
 *
 * Assumptions:
 * - worker.js exists on your home computer.
 * - You start with NUKE.exe; other port crackers are used automatically if present.
 * - Designed for a fresh Bitburner save; swap out once you move into mid-game batching.
 *
 * @param {NS} ns
 */
export async function main(ns) {
    const worker = "worker.js";
    const desiredPurchased = 5;    // buy up to 5 small servers early on
    const purchaseRam = 8;         // RAM for purchased servers; adjust as funds allow
    const purchaseBuffer = 5_000;  // keep this much money before buying servers
    const rescanDelay = 10_000;    // 10s between management loops

    ns.disableLog("scan");
    ns.disableLog("sleep");
    ns.disableLog("getServerMoneyAvailable");

    while (true) {
        const rooted = rootAccessibleServers(ns);
        const target = pickBestTarget(ns, rooted);

        if (!target) {
            ns.tprint("No valid targets yet. Waiting...");
        } else {
            deployToRooted(ns, rooted, worker, target);
            buyStarterServers(ns, worker, target, desiredPurchased, purchaseRam, purchaseBuffer);
        }

        await ns.sleep(rescanDelay);
    }
}

/**
 * Attempt to gain root on all discovered servers and return the list of rooted servers.
 * @param {NS} ns
 */
function rootAccessibleServers(ns) {
    const servers = scanAll(ns);
    const rooted = [];
    for (const host of servers) {
        if (host === "home") continue;
        tryRoot(ns, host);
        if (ns.hasRootAccess(host)) rooted.push(host);
    }
    return rooted;
}

/**
 * Try to gain root on a single host using any available port crackers.
 * @param {NS} ns
 * @param {string} host
 */
function tryRoot(ns, host) {
    if (ns.hasRootAccess(host)) return;

    const portOpeners = [
        { file: "BruteSSH.exe", fn: ns.brutessh },
        { file: "FTPCrack.exe", fn: ns.ftpcrack },
        { file: "relaySMTP.exe", fn: ns.relaysmtp },
        { file: "HTTPWorm.exe", fn: ns.httpworm },
        { file: "SQLInject.exe", fn: ns.sqlinject },
    ];

    for (const opener of portOpeners) {
        if (ns.fileExists(opener.file, "home")) {
            try { opener.fn(host); } catch { /* ignore missing API when file absent */ }
        }
    }

    const requiredPorts = ns.getServerNumPortsRequired(host);
    const openedPorts = ns.getServer(host).openPortCount;
    if (openedPorts >= requiredPorts && ns.getServerRequiredHackingLevel(host) <= ns.getHackingLevel()) {
        ns.nuke(host);
    }
}

/**
 * Scan the entire network graph from home.
 * @param {NS} ns
 */
function scanAll(ns) {
    const seen = new Set(["home"]);
    const queue = ["home"];
    while (queue.length) {
        const host = queue.shift();
        for (const neighbor of ns.scan(host)) {
            if (!seen.has(neighbor)) {
                seen.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return Array.from(seen);
}

/**
 * Choose the best rooted target based on money and hacking level.
 * @param {NS} ns
 * @param {string[]} rooted
 */
function pickBestTarget(ns, rooted) {
    const playerLevel = ns.getHackingLevel();
    let best = null;
    let bestScore = 0;

    for (const host of rooted) {
        if (ns.getServerRequiredHackingLevel(host) > playerLevel) continue;
        const maxMoney = ns.getServerMaxMoney(host);
        if (maxMoney <= 0) continue;

        const minSec = ns.getServerMinSecurityLevel(host);
        const score = maxMoney / (minSec + 1);
        if (score > bestScore) {
            bestScore = score;
            best = host;
        }
    }
    return best;
}

/**
 * Push worker.js to rooted hosts and start it with max threads.
 * @param {NS} ns
 * @param {string[]} rooted
 * @param {string} worker
 * @param {string} target
 */
function deployToRooted(ns, rooted, worker, target) {
    for (const host of rooted) {
        const ram = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
        const threads = Math.floor(ram / ns.getScriptRam(worker));
        if (threads <= 0) continue;

        ns.scp(worker, host);
        ns.scriptKill(worker, host);
        ns.exec(worker, host, threads, target);
    }

    // Always ensure home is running too, but leave 20% RAM buffer for manual tasks.
    const homeRam = ns.getServerMaxRam("home");
    const reserved = homeRam * 0.2;
    const homeThreads = Math.floor((homeRam - ns.getServerUsedRam("home") - reserved) / ns.getScriptRam(worker));
    if (homeThreads > 0) {
        ns.scriptKill(worker, "home");
        ns.exec(worker, "home", homeThreads, target);
    }
}

/**
 * Buy a handful of starter servers when money is plentiful.
 * @param {NS} ns
 * @param {string} worker
 * @param {string} target
 * @param {number} desired
 * @param {number} ram
 * @param {number} buffer
 */
function buyStarterServers(ns, worker, target, desired, ram, buffer) {
    const owned = ns.getPurchasedServers();
    if (owned.length >= desired) return;

    const cost = ns.getPurchasedServerCost(ram);
    const money = ns.getServerMoneyAvailable("home");
    if (money < cost + buffer) return;

    const name = `pserv-${owned.length}`;
    const host = ns.purchaseServer(name, ram);
    if (!host) return;

    ns.scp(worker, host);
    const threads = Math.floor((ram - ns.getServerUsedRam(host)) / ns.getScriptRam(worker));
    if (threads > 0) {
        ns.exec(worker, host, threads, target);
    }
    ns.tprint(`Purchased ${host} (${ram}GB) and started hacking ${target}`);
}
