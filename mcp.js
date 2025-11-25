/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const BATCHER = "batcher.js";
    const HACK = "hack.js";
    const GROW = "grow.js";
    const WEAK = "weaken.js";

    const desiredHackFraction = ns.args[0] ?? 0.1; // 10% default

    // 1) Find all servers
    const allServers = scanAllServers(ns, "home");

    // 2) Auto-root everything we reasonably can
    const rooted = autoRootAll(ns, allServers);

    // 3) Pick best target
    const target = pickBestTarget(ns, rooted);
    if (!target) {
        ns.tprint("MCP: No suitable target found.");
        return;
    }

    ns.tprint(`MCP: Best target is ${target}`);

    // 4) Kill current hacking/batching scripts (optional)
    killExisting(ns, ["batcher.js", HACK, GROW, WEAK]);

    // 5) Start the batcher on home
    if (!ns.fileExists(BATCHER, "home")) {
        ns.tprint(`MCP: Missing ${BATCHER} on home.`);
        return;
    }

    ns.tprint(`MCP: Starting ${BATCHER} on home against ${target}`);
    ns.run(BATCHER, 1, target, desiredHackFraction);

    // 6) Start *your* other automation scripts here.
    // Fill in with real names of your scripts.
    const extraScripts = [
        // ["hacknet-manager.js", []],
        // ["purchase-servers.js", []],
        // ["faction-worker.js", []],
    ];

    for (const [script, args] of extraScripts) {
        if (ns.fileExists(script, "home") && !ns.isRunning(script, "home", ...args)) {
            ns.run(script, 1, ...args);
            ns.print(`MCP: Started ${script} ${JSON.stringify(args)}`);
        }
    }

    ns.tprint("MCP: Launch complete.");
}

/**
 * Depth-first search to list all servers reachable from 'start'.
 */
function scanAllServers(ns, start = "home") {
    const seen = new Set([start]);
    const stack = [start];
    const result = [start];

    while (stack.length > 0) {
        const host = stack.pop();
        for (const neighbor of ns.scan(host)) {
            if (!seen.has(neighbor)) {
                seen.add(neighbor);
                result.push(neighbor);
                stack.push(neighbor);
            }
        }
    }
    return result;
}

/**
 * Automatically run port-opening programs and NUKE servers where possible.
 */
function autoRootAll(ns, servers) {
    const rooted = [];
    const home = "home";

    const programs = [
        ["BruteSSH.exe", (host) => ns.brutessh(host)],
        ["FTPCrack.exe", (host) => ns.ftpcrack(host)],
        ["relaySMTP.exe", (host) => ns.relaysmtp(host)],
        ["HTTPWorm.exe", (host) => ns.httpworm(host)],
        ["SQLInject.exe", (host) => ns.sqlinject(host)],
    ];

    const availableOpeners = programs.filter(([file]) => ns.fileExists(file, home)).length;

    for (const host of servers) {
        if (host === home || host === "darkweb") continue;

        try {
            if (!ns.hasRootAccess(host)) {
                const requiredPorts = ns.getServerNumPortsRequired(host);
                if (requiredPorts <= availableOpeners) {
                    for (const [file, fn] of programs) {
                        if (ns.fileExists(file, home)) {
                            fn(host);
                        }
                    }
                    ns.nuke(host);
                }
            }
            if (ns.hasRootAccess(host)) {
                rooted.push(host);
            }
        } catch (e) {
            ns.print(`autoRootAll: error on ${host}: ${String(e)}`);
        }
    }

    return rooted;
}

/**
 * Choose a target that you can hack & is likely to be profitable.
 * Scoring: (maxMoney * hackChance) / hackTime
 */
function pickBestTarget(ns, servers) {
    const player = ns.getPlayer();

    let best = null;
    let bestScore = 0;

    for (const host of servers) {
        if (host === "home" || host === "darkweb") continue;

        const maxMoney = ns.getServerMaxMoney(host);
        if (maxMoney <= 0) continue;

        const reqLevel = ns.getServerRequiredHackingLevel(host);
        if (reqLevel > player.hacking) continue;

        const chance = ns.hackAnalyzeChance(host);
        if (chance < 0.1) continue; // skip horrible chance targets

        const time = ns.getHackTime(host);
        const score = (maxMoney * chance) / time;

        if (score > bestScore) {
            bestScore = score;
            best = host;
        }
    }

    return best;
}

/**
 * Kill existing hacking-related scripts so MCP has a clean slate.
 */
function killExisting(ns, names) {
    for (const server of scanAllServers(ns)) {
        for (const script of names) {
            if (ns.scriptRunning(script, server)) {
                ns.kill(script, server);
            }
        }
    }
}
