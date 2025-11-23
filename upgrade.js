/**
 * Purchased-server upgrader: every interval, pick your smallest purchased server
 * and upgrade it to the largest power-of-two RAM you can afford (up to the
 * BitNode cap), consuming your available cash. Defaults to checking once per
 * minute.
 *
 * Usage: run upgrade.js [intervalMs]
 *  - intervalMs: optional; milliseconds between upgrade passes (default 60_000)
 *
 * Assumptions:
 *  - You already have purchased servers. If none exist, the script waits for
 *    the next interval.
 *  - Purchased servers were created at 16GB or higher. Upgrades will skip hosts
 *    smaller than that floor.
 *
 * @param {NS} ns
 */
export async function main(ns) {
    const interval = Number(ns.args[0] ?? 60_000);
    const minRam = 16;

    ns.disableLog("sleep");
    ns.disableLog("getServerMoneyAvailable");

    while (true) {
        const upgraded = upgradeSmallestServer(ns, minRam);
        if (!upgraded) {
            const smallest = findSmallestServer(ns);
            if (!smallest) {
                ns.print("No purchased servers to upgrade yet.");
            } else {
                ns.print(`No affordable upgrade for ${smallest.host} at this time.`);
            }
        }

        await ns.sleep(interval);
    }
}

/**
 * Return info about the smallest purchased server, or null if none exist.
 * @param {NS} ns
 */
function findSmallestServer(ns) {
    const servers = ns.getPurchasedServers();
    if (servers.length === 0) return null;

    let smallest = servers[0];
    let smallestRam = ns.getServerMaxRam(smallest);
    for (const host of servers) {
        const ram = ns.getServerMaxRam(host);
        if (ram < smallestRam) {
            smallest = host;
            smallestRam = ram;
        }
    }

    return { host: smallest, ram: smallestRam };
}

/**
 * Upgrade the smallest purchased server to the largest power-of-two RAM tier
 * you can afford, up to the BitNode cap.
 * @param {NS} ns
 * @param {number} minRam
 * @returns {boolean} true if an upgrade occurred
 */
function upgradeSmallestServer(ns, minRam) {
    const info = findSmallestServer(ns);
    if (!info) return false;

    const { host, ram: currentRam } = info;
    const allowedMax = ns.getPurchasedServerMaxRam();
    if (currentRam < minRam || currentRam >= allowedMax) return false;

    const budget = ns.getServerMoneyAvailable("home");
    if (budget <= 0) return false;

    let bestRam = currentRam;
    for (let ram = currentRam * 2; ram <= allowedMax; ram *= 2) {
        const cost = ns.getPurchasedServerUpgradeCost(host, ram);
        if (cost <= budget) {
            bestRam = ram;
        } else {
            break;
        }
    }

    if (bestRam > currentRam) {
        const cost = ns.getPurchasedServerUpgradeCost(host, bestRam);
        if (ns.upgradePurchasedServer(host, bestRam)) {
            ns.tprint(`Upgraded ${host} from ${currentRam}GB to ${bestRam}GB for ${ns.formatNumber(cost, 0)}.`);
            return true;
        }
    }

    return false;
}
