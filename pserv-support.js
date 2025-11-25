/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const host = ns.getHostname();
    const slot = ns.args[0] ?? 0;
    const ramBuffer = 1;
    const maxThreadsPerAction = 10;
    const growScript = "grow.js";
    const weakenScript = "weaken.js";

    while (true) {
        const targets = getBottomMoneyServers(ns, 5);
        if (targets.length === 0) {
            await ns.sleep(5000);
            continue;
        }

        const target = targets[slot % targets.length];
        const maxRam = ns.getServerMaxRam(host);
        let freeRam = Math.max(0, maxRam - ns.getServerUsedRam(host) - ramBuffer);

        const weakRam = ns.getScriptRam(weakenScript, host);
        const growRam = ns.getScriptRam(growScript, host);

        const sec = ns.getServerSecurityLevel(target);
        const minSec = ns.getServerMinSecurityLevel(target);
        const money = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);

        if (sec > minSec + 1 && freeRam >= weakRam) {
            const threads = Math.min(maxThreadsPerAction, Math.floor(freeRam / weakRam));
            if (threads > 0) {
                ns.exec(weakenScript, host, threads, target, 0, `psw-${Date.now()}`);
                freeRam -= threads * weakRam;
            }
        }

        if (money < maxMoney * 0.9 && freeRam >= growRam) {
            const threads = Math.min(maxThreadsPerAction, Math.floor(freeRam / growRam));
            if (threads > 0) {
                ns.exec(growScript, host, threads, target, 0, `psg-${Date.now()}`);
            }
        }

        await ns.sleep(5000);
    }
}

function getBottomMoneyServers(ns, count) {
    const seen = new Set(["home"]);
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        for (const neighbor of ns.scan(host)) {
            if (!seen.has(neighbor)) {
                seen.add(neighbor);
                stack.push(neighbor);
            }
        }
    }

    const candidates = [];
    for (const server of seen) {
        if (server === "home" || server === "darkweb" || server.startsWith("pserv")) continue;
        if (!ns.hasRootAccess(server)) continue;
        const maxMoney = ns.getServerMaxMoney(server);
        if (maxMoney <= 0) continue;
        candidates.push({ server, maxMoney });
    }

    candidates.sort((a, b) => a.maxMoney - b.maxMoney);
    return candidates.slice(0, count).map((c) => c.server);
}
