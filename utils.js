/** @param {NS} ns */
// Network scanning and server management utilities

export function scanNetwork(ns) {
    const servers = new Set(['home']);
    const queue = ['home'];

    while (queue.length > 0) {
        const current = queue.shift();
        const neighbors = ns.scan(current);

        for (const neighbor of neighbors) {
            if (!servers.has(neighbor)) {
                servers.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    return Array.from(servers);
}

export function getRootAccess(ns, server) {
    if (ns.hasRootAccess(server)) return true;

    try {
        const portsNeeded = ns.getServerNumPortsRequired(server);
        let portsOpened = 0;

        if (ns.fileExists('BruteSSH.exe', 'home')) {
            ns.brutessh(server);
            portsOpened++;
        }
        if (ns.fileExists('FTPCrack.exe', 'home')) {
            ns.ftpcrack(server);
            portsOpened++;
        }
        if (ns.fileExists('relaySMTP.exe', 'home')) {
            ns.relaysmtp(server);
            portsOpened++;
        }
        if (ns.fileExists('HTTPWorm.exe', 'home')) {
            ns.httpworm(server);
            portsOpened++;
        }
        if (ns.fileExists('SQLInject.exe', 'home')) {
            ns.sqlinject(server);
            portsOpened++;
        }

        if (portsOpened >= portsNeeded) {
            ns.nuke(server);
            return true;
        }
    } catch (e) {
        return false;
    }

    return false;
}

export function getAllRootedServers(ns) {
    const allServers = scanNetwork(ns);
    const rooted = [];

    for (const server of allServers) {
        if (server === 'home') continue;
        if (ns.getPurchasedServers().includes(server)) continue;

        getRootAccess(ns, server);
        if (ns.hasRootAccess(server)) {
            rooted.push(server);
        }
    }

    return rooted;
}

export function getAvailableServers(ns) {
    const servers = [];

    // Add home
    const homeRam = ns.getServerMaxRam('home') - ns.getServerUsedRam('home');
    if (homeRam > 0) {
        servers.push({
            hostname: 'home',
            maxRam: ns.getServerMaxRam('home'),
            usedRam: ns.getServerUsedRam('home'),
            availableRam: homeRam
        });
    }

    // Add purchased servers
    for (const server of ns.getPurchasedServers()) {
        const maxRam = ns.getServerMaxRam(server);
        const usedRam = ns.getServerUsedRam(server);
        servers.push({
            hostname: server,
            maxRam: maxRam,
            usedRam: usedRam,
            availableRam: maxRam - usedRam
        });
    }

    // Add rooted servers
    for (const server of getAllRootedServers(ns)) {
        const maxRam = ns.getServerMaxRam(server);
        const usedRam = ns.getServerUsedRam(server);
        if (maxRam > 0) {
            servers.push({
                hostname: server,
                maxRam: maxRam,
                usedRam: usedRam,
                availableRam: maxRam - usedRam
            });
        }
    }

    return servers.filter(s => s.availableRam > 0);
}

export function selectBestTarget(ns) {
    const servers = getAllRootedServers(ns);
    const hackLevel = ns.getHackingLevel();

    let bestServer = null;
    let bestScore = 0;

    for (const server of servers) {
        if (ns.getServerRequiredHackingLevel(server) > hackLevel) continue;
        if (ns.getServerMaxMoney(server) === 0) continue;

        const maxMoney = ns.getServerMaxMoney(server);
        const hackChance = ns.hackAnalyzeChance(server);
        const hackTime = ns.getHackTime(server);
        const growTime = ns.getGrowTime(server);
        const weakenTime = ns.getWeakenTime(server);

        // Score based on money/time and success chance
        const score = (maxMoney * hackChance) / (weakenTime / 1000);

        if (score > bestScore) {
            bestScore = score;
            bestServer = server;
        }
    }

    return bestServer || 'n00dles';
}

export function getTotalAvailableRam(ns) {
    const servers = getAvailableServers(ns);
    return servers.reduce((total, server) => total + server.availableRam, 0);
}

export async function copyWorkerScripts(ns, targetServers) {
    const scripts = ['hack.js', 'grow.js', 'weaken.js'];
    for (const server of targetServers) {
        if (server === 'home') continue;
        await ns.scp(scripts, server, 'home');
    }
}
