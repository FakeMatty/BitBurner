/** @param {NS} ns **/
export async function main(ns) {
    const [target, delay = 0, batchId = 0, label = "H"] = ns.args;
    if (delay > 0) await ns.sleep(delay);
    await ns.hack(target);
    ns.print(`Batch ${batchId} ${label}: hack ${target} done`);
}
