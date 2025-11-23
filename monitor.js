/**
 * Live server monitor showing money, security, timings, and prep needs.
 *
 * Usage: run monitor.js [refreshMs] [limit]
 * - refreshMs: optional update interval in milliseconds (default: 2000)
 * - limit: optional count of servers to show (default: 20, smallest max-money servers)
 *
 * Shows rooted and purchased servers with:
 * - current/max money and percent
 * - security vs minimum
 * - hack/grow/weaken durations
 * - threads to weaken to min security and grow to max money
 * - rough prep ETA based on current grow/weaken durations
 *
 * @param {NS} ns
 */
export async function main(ns) {
    const refresh = Number(ns.args[0] ?? 2000);
    const limit = Number(ns.args[1] ?? 20);
    ns.disableLog("sleep");
    ns.clearLog();
    ns.tail();

    while (true) {
        const servers = scanAll(ns);
        const rows = servers
            .filter((host) => host !== "home" && ns.getServerMaxMoney(host) > 0)
            .map((host) => describe(ns, host))
            .sort((a, b) => a.maxMoney - b.maxMoney)
            .slice(0, Math.max(0, limit));

        ns.clearLog();
        ns.print(header());
        for (const row of rows) {
            ns.print(formatRow(row));
        }
        ns.print("\nLegend: gThr=threads to max money, wThr=threads to min sec, ETA assumes a full grow/weaken cycle with those threads.");
        await ns.sleep(refresh);
    }
}

function describe(ns, host) {
    const rooted = ns.hasRootAccess(host);
    const money = ns.getServerMoneyAvailable(host);
    const maxMoney = ns.getServerMaxMoney(host);
    const sec = ns.getServerSecurityLevel(host);
    const minSec = ns.getServerMinSecurityLevel(host);
    const growTime = ns.getGrowTime(host);
    const weakenTime = ns.getWeakenTime(host);
    const hackTime = ns.getHackTime(host);
    const growThreads = maxMoney > 0 && money < maxMoney
        ? Math.max(0, Math.ceil(ns.growthAnalyze(host, maxMoney / Math.max(1, money))))
        : 0;
    const weakenThreads = Math.max(0, Math.ceil(Math.max(0, sec - minSec) / ns.weakenAnalyze(1)));
    const eta = growThreads > 0 || weakenThreads > 0 ? Math.max(growTime, weakenTime) : 0;

    return {
        host,
        rooted,
        money,
        maxMoney,
        sec,
        minSec,
        growTime,
        weakenTime,
        hackTime,
        growThreads,
        weakenThreads,
        eta,
    };
}

function header() {
    return [
        pad("Host", 18),
        pad("Root", 5),
        pad("Money (curr/max)", 26),
        pad("$%", 6),
        pad("Sec (cur/min)", 20),
        pad("Hack", 8),
        pad("Grow", 8),
        pad("Weak", 8),
        pad("gThr", 6),
        pad("wThr", 6),
        pad("ETA", 8),
    ].join(" ");
}

function formatRow(row) {
    const moneyPct = row.maxMoney > 0 ? (row.money / row.maxMoney) * 100 : 0;
    const etaStr = row.eta > 0 ? fmtTime(row.eta) : "-";
    return [
        pad(row.host, 18),
        pad(row.rooted ? "yes" : "no", 5),
        pad(`${fmtMoney(row.money)}/${fmtMoney(row.maxMoney)}`, 26),
        pad(`${moneyPct.toFixed(1)}%`, 6),
        pad(`${row.sec.toFixed(2)}/${row.minSec.toFixed(2)}`, 20),
        pad(fmtTime(row.hackTime), 8),
        pad(fmtTime(row.growTime), 8),
        pad(fmtTime(row.weakenTime), 8),
        pad(String(row.growThreads), 6),
        pad(String(row.weakenThreads), 6),
        pad(etaStr, 8),
    ].join(" ");
}

function fmtMoney(n) {
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}b`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}m`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(2)}k`;
    return n.toFixed(0);
}

function fmtTime(ms) {
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = seconds / 60;
    return `${minutes.toFixed(1)}m`;
}

function pad(str, length) {
    return String(str).padEnd(length, " ");
}

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

    for (const pserv of ns.getPurchasedServers()) {
        seen.add(pserv);
    }

    return Array.from(seen);
}
