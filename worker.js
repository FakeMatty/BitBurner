/**
 * Basic hack/grow/weaken loop to stabilize a target server.
 *
 * Usage: run worker.js <target>
 * - target: server name to hack.
 *
 * The script maintains money at ~75% of max and security close to minimum.
 * It rotates between weaken, grow, and hack depending on current conditions.
 *
 * This is intentionally light-weight for early game; once more advanced
 * tools are unlocked you can swap it out for smarter batching.
 *
 * @param {NS} ns
 */
export async function main(ns) {
    const target = ns.args[0];
    if (!target) {
        ns.tprint("ERROR: worker.js requires a target server name as the first argument.");
        return;
    }

    const moneyThreshold = 0.75; // grow until at least 75% of max
    const securityBuffer = 5;    // weaken if security is 5 above minimum

    while (true) {
        const minSec = ns.getServerMinSecurityLevel(target);
        const security = ns.getServerSecurityLevel(target);
        const money = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);

        if (security > minSec + securityBuffer) {
            await ns.weaken(target);
        } else if (money < maxMoney * moneyThreshold) {
            await ns.grow(target);
        } else {
            await ns.hack(target);
        }
    }
}
