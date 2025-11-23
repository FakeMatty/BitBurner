/**
 * Execute a single hacking action with an optional delay, intended for batch scheduling.
 *
 * Usage: run action.js <target> <action> [delayMs]
 * - target: server name to operate on
 * - action: "hack", "grow", or "weaken"
 * - delayMs: optional delay before starting the action
 *
 * The number of threads is controlled by the caller via ns.exec.
 * @param {NS} ns
 */
export async function main(ns) {
    const [target, action, delay = 0] = ns.args;
    if (!target || !action) {
        ns.tprint("Usage: run action.js <target> <hack|grow|weaken> [delayMs]");
        return;
    }

    if (delay > 0) {
        await ns.sleep(delay);
    }

    switch (action) {
        case "hack":
            await ns.hack(target);
            break;
        case "grow":
            await ns.grow(target);
            break;
        case "weaken":
            await ns.weaken(target);
            break;
        default:
            ns.tprint(`Unknown action: ${action}`);
            break;
    }
}
