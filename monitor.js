/** @param {NS} ns */
import { getAllRootedServers, getAvailableServers } from './utils.js';

export async function main(ns) {
    ns.disableLog('ALL');
    ns.tail();

    const target = ns.args[0] || 'n00dles';

    while (true) {
        ns.clearLog();

        // Target stats
        ns.print('=== TARGET STATS ===');
        ns.print(`Server: ${target}`);

        const currentMoney = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);
        const moneyPercent = (currentMoney / maxMoney * 100).toFixed(1);

        const currentSec = ns.getServerSecurityLevel(target);
        const minSec = ns.getServerMinSecurityLevel(target);
        const secDiff = (currentSec - minSec).toFixed(2);

        ns.print(`Money: $${ns.formatNumber(currentMoney)} / $${ns.formatNumber(maxMoney)} (${moneyPercent}%)`);
        ns.print(`Security: ${currentSec.toFixed(2)} / ${minSec.toFixed(2)} (+${secDiff})`);
        ns.print(`Hack chance: ${(ns.hackAnalyzeChance(target) * 100).toFixed(1)}%`);

        const hackTime = ns.getHackTime(target);
        const growTime = ns.getGrowTime(target);
        const weakenTime = ns.getWeakenTime(target);

        ns.print(`Times: H:${ns.tFormat(hackTime)} G:${ns.tFormat(growTime)} W:${ns.tFormat(weakenTime)}`);

        // RAM stats
        ns.print('\n=== RAM STATS ===');
        const servers = getAvailableServers(ns);
        const totalMax = servers.reduce((sum, s) => sum + s.maxRam, 0);
        const totalUsed = servers.reduce((sum, s) => sum + s.usedRam, 0);
        const totalAvailable = servers.reduce((sum, s) => sum + s.availableRam, 0);
        const usagePercent = (totalUsed / totalMax * 100).toFixed(1);

        ns.print(`Total RAM: ${ns.formatRam(totalUsed)} / ${ns.formatRam(totalMax)} (${usagePercent}%)`);
        ns.print(`Available: ${ns.formatRam(totalAvailable)}`);
        ns.print(`Servers: ${servers.length}`);

        // Income stats
        ns.print('\n=== INCOME ===');
        const income = ns.getScriptIncome()[0];
        ns.print(`$/sec: ${ns.formatNumber(income)}`);
        ns.print(`$/min: ${ns.formatNumber(income * 60)}`);
        ns.print(`$/hour: ${ns.formatNumber(income * 3600)}`);

        await ns.sleep(1000);
    }
}
