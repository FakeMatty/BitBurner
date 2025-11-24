/** @param {NS} ns **/
export async function main(ns) {
    const [target, delay = 0, batchId = 0, label = "G"] = ns.args;
    if (delay > 0) await ns.sleep(delay);
    await ns.grow(target);
    ns.print(`Batch ${batchId} ${label}: grow ${target} done`);
}
