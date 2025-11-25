/** @param {NS} ns **/
export async function main(ns) {
    const [target, delay = 0, batchId = 0, label = "W"] = ns.args;
    if (delay > 0) await ns.sleep(delay);
    await ns.weaken(target);
    ns.print(`Batch ${batchId} ${label}: weaken ${target} done`);
}
