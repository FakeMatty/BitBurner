/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const host = ns.getHostname();
    const hackScript = "hack.js";
    const hackThreads = 5;
    const interval = 10_000;
    const ramBuffer = 2; // keep a little room for the manager itself

    while (true) {
        const targets = getRootedMoneyServers(ns)
            .filter((t) => ns.getServerSecurityLevel(t) <= ns.getServerMinSecurityLevel(t) + 1)
            .filter((t) => ns.getServerMoneyAvailable(t) >= ns.getServerMaxMoney(t) * 0.9);

        const scriptRam = ns.getScriptRam(hackScript, host);
        for (const target of targets) {
            const freeRam = Math.max(0, ns.getServerMaxRam(host) - ns.getServerUsedRam(host) - ramBuffer);
            const possibleThreads = Math.min(hackThreads, Math.floor(freeRam / scriptRam));
            if (possibleThreads > 0) {
                ns.exec(hackScript, host, possibleThreads, target, 0, `hack-${Date.now()}`);
            }
        }

        await ns.sleep(interval);
    }
}

function getRootedMoneyServers(ns) {
    const seen = new Set(["home"]);
    const stack = ["home"];
    const result = [];

    while (stack.length > 0) {
        const host = stack.pop();
        for (const neighbor of ns.scan(host)) {
            if (!seen.has(neighbor)) {
                seen.add(neighbor);
                stack.push(neighbor);
            }
        }
    }

    for (const server of seen) {
        if (server === "home" || server === "darkweb" || server.startsWith("pserv")) continue;
        if (!ns.hasRootAccess(server)) continue;
        if (ns.getServerMaxMoney(server) <= 0) continue;
        result.push(server);
    }

    return result;
}
