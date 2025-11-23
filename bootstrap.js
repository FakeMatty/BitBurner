/**
 * Early-game bootstrapper to root servers, deploy batching helpers, and buy starter servers.
 *
 * Usage: run bootstrap.js
 *
 * Behavior:
 * - Scans the network, attempts to gain root using any port crackers you own.
 * - Copies worker/action scripts to rooted servers and runs worker.js on home as a batch coordinator.
 * - Purchases a few small servers when you can easily afford them, reusing them as action runners.
 *
 * Assumptions:
 * - worker.js and action.js exist on your home computer.
 * - You start with NUKE.exe; other port crackers are used automatically if present.
 * - Designed for a fresh Bitburner save; swap out once you move into mid-game batching.
 *
 * @param {NS} ns
 */
export async function main(ns) {
    const worker = "worker.js";
    const actionScript = "action.js";
    const desiredPurchased = 5;    // buy up to 5 small servers early on
    const purchaseRam = 8;         // preferred RAM for purchased servers; will downscale if unaffordable
    const minPurchaseRam = 4;      // never buy smaller than this to avoid useless nodes
    const purchaseBuffer = 5_000;  // keep this much money before buying servers
    const rescanDelay = 10_000;    // 10s between management loops
    const target = "n00dles";     // focus exclusively on n00dles for early-game batching

    ns.disableLog("scan");
    ns.disableLog("sleep");
    ns.disableLog("getServerMoneyAvailable");

    while (true) {
        const rooted = rootAccessibleServers(ns);
        if (!ns.hasRootAccess(target)) {
            ns.tprint(`Waiting to root ${target} before starting batches...`);
        } else {
            killWorkersEverywhere(ns, worker, rooted);
            deployCoordinator(ns, rooted, worker, actionScript, target);
            buyStarterServers(ns, worker, actionScript, target, desiredPurchased, purchaseRam, minPurchaseRam, purchaseBuffer);
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

    let opened = 0;
    for (const opener of portOpeners) {
        if (!ns.fileExists(opener.file, "home")) continue;

        try {
            opener.fn(host);
            opened += 1;
        } catch {
            // Skip unavailable helpers; the next loop will try again once you buy the program.
        }
    }

    const requiredPorts = ns.getServerNumPortsRequired(host);
    const requiredLevel = ns.getServerRequiredHackingLevel(host);
    const canHack = requiredLevel <= ns.getHackingLevel();
    if (opened >= requiredPorts && canHack) {
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
 * Stop any existing worker instances across rooted hosts and home so we restart with fresh code/targets.
 * @param {NS} ns
 * @param {string} worker
 * @param {string[]} rooted
 */
function killWorkersEverywhere(ns, worker, rooted) {
    const hosts = new Set([...rooted, "home", ...ns.getPurchasedServers()]);
    for (const host of hosts) {
        if (!ns.serverExists(host)) continue;
        ns.scriptKill(worker, host);
    }
}

/**
 * Push worker/action helpers to rooted hosts and start the coordinator on home.
 * @param {NS} ns
 * @param {string[]} rooted
 * @param {string} worker
 * @param {string} actionScript
 * @param {string} target
 */
function deployCoordinator(ns, rooted, worker, actionScript, target) {
    const helpers = [worker, actionScript];
    for (const host of [...rooted, ...ns.getPurchasedServers()]) {
        ns.scp(helpers, host);
    }

    // Always ensure home has the helpers too.
    ns.scp(helpers, "home");

    const homeRam = ns.getServerMaxRam("home");
    const reserved = homeRam * 0.2;
    const availableThreads = Math.floor((homeRam - ns.getServerUsedRam("home") - reserved) / ns.getScriptRam(worker));
    if (availableThreads > 0) {
        ns.scriptKill(worker, "home");
        ns.exec(worker, "home", availableThreads, target, actionScript);
    } else {
        ns.tprint("Not enough home RAM to start worker.js. Free some memory and rerun bootstrap.");
    }
}

/**
 * Buy a handful of starter servers when money is plentiful.
 * @param {NS} ns
 * @param {string} worker
 * @param {string} actionScript
 * @param {string} target
 * @param {number} desired
 * @param {number} ram
 * @param {number} buffer
 */
function buyStarterServers(ns, worker, actionScript, target, desired, targetRam, minRam, buffer) {
    const owned = ns.getPurchasedServers();
    if (owned.length >= desired) return;

    const money = ns.getServerMoneyAvailable("home");
    const budget = money - buffer;
    if (budget <= 0) return;

    const ram = pickAffordableRam(ns, targetRam, minRam, budget);
    if (ram === 0) return;

    const name = `pserv-${owned.length}`;
    const host = ns.purchaseServer(name, ram);
    if (!host) return;

    ns.scp([worker, actionScript], host);
    ns.tprint(`Purchased ${host} (${ram}GB); the home coordinator will use it for batching ${target}.`);
}

/**
 * Pick the largest power-of-two RAM we can afford without dropping below the buffer.
 * @param {NS} ns
 * @param {number} preferredRam
 * @param {number} minRam
 * @param {number} budget
 */
function pickAffordableRam(ns, preferredRam, minRam, budget) {
    const maxRam = ns.getPurchasedServerMaxRam();
    let ram = Math.min(preferredRam, maxRam);

    // Step down until the server cost fits inside the budget.
    while (ram > minRam && ns.getPurchasedServerCost(ram) > budget) {
        ram /= 2;
    }

    // Ensure we don't propose a RAM size we still can't afford.
    if (ram < minRam || ns.getPurchasedServerCost(ram) > budget) return 0;
    return ram;
}
