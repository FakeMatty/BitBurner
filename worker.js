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
    const preferredTarget = ns.args[0];
    if (!preferredTarget) {
        ns.tprint("ERROR: worker.js requires a target server name as the first argument.");
        return;
    }

    const moneyThreshold = 0.75; // grow until at least 75% of max
    const securityBuffer = 5;    // weaken if security is 5 above minimum
    const maxActionTime = 15_000; // keep individual actions under 15 seconds

    let target = pickFastTarget(ns, preferredTarget, maxActionTime);
    if (target !== preferredTarget) {
        ns.tprint(`Switching to faster early-game target: ${target}`);
    }

    while (true) {
        // Re-evaluate occasionally in case the preferred target becomes faster later.
        const newTarget = pickFastTarget(ns, preferredTarget, maxActionTime, target);
        if (newTarget !== target) {
            ns.print(`Target adjusted from ${target} to ${newTarget} to keep actions under ${maxActionTime / 1000}s.`);
            target = newTarget;
        }

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

/**
 * Choose a target that keeps action times below a threshold, falling back to quick early servers.
 * @param {NS} ns
 * @param {string} preferred
 * @param {number} maxActionTime
 * @param {string=} current
 */
function pickFastTarget(ns, preferred, maxActionTime, current) {
    // If the preferred target is already fast enough, keep it.
    if (isFastEnough(ns, preferred, maxActionTime)) return preferred;

    // If the current target still qualifies, stay on it to avoid thrashing.
    if (current && isFastEnough(ns, current, maxActionTime)) return current;

    const fallbacks = [
        "n00dles",
        "foodnstuff",
        "sigma-cosmetics",
        "joesguns",
        "hong-fang-tea",
        "harakiri-sushi",
    ];

    for (const host of fallbacks) {
        if (!ns.serverExists(host)) continue;
        if (!ns.hasRootAccess(host)) continue;
        if (!isFastEnough(ns, host, maxActionTime)) continue;
        return host;
    }

    // As a last resort, stick with the preferred target even if it's slow.
    return preferred;
}

/**
 * Determine whether hack/grow/weaken stay under the allowed time for a host.
 * @param {NS} ns
 * @param {string} host
 * @param {number} maxActionTime
 */
function isFastEnough(ns, host, maxActionTime) {
    const weakenTime = ns.getWeakenTime(host);
    const growTime = ns.getGrowTime(host);
    const hackTime = ns.getHackTime(host);
    return weakenTime <= maxActionTime && growTime <= maxActionTime && hackTime <= maxActionTime;
}
