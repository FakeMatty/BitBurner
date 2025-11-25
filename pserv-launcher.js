/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const workers = ["hack.js", "grow.js", "weaken.js"];
    const hackManager = "pserv-hack-manager.js";
    const supportManager = "pserv-support.js";

    const purchased = ns.getPurchasedServers();
    if (purchased.length === 0) {
        ns.tprint("pserv-launcher: No purchased servers found.");
        return;
    }

    const missing = workers.filter((f) => !ns.fileExists(f, "home"));
    if (missing.length) {
        ns.tprint(`pserv-launcher: Missing worker scripts on home: ${missing.join(", ")}`);
        return;
    }

    if (!ns.fileExists(hackManager, "home") || !ns.fileExists(supportManager, "home")) {
        ns.tprint("pserv-launcher: Missing pserv manager scripts on home.");
        return;
    }

    for (const host of purchased) {
        await ns.scp([...workers, host === "pserv-0" ? hackManager : supportManager], host);
    }

    const pserv0 = purchased.includes("pserv-0");
    if (!pserv0) {
        ns.tprint("pserv-launcher: pserv-0 not found; hack manager will not start.");
    } else {
        if (!ns.isRunning(hackManager, "pserv-0")) {
            ns.exec(hackManager, "pserv-0", 1);
            ns.tprint("pserv-launcher: Started hack manager on pserv-0.");
        } else {
            ns.tprint("pserv-launcher: Hack manager already running on pserv-0.");
        }
    }

    let supportIndex = 0;
    for (const host of purchased) {
        if (host === "pserv-0") continue;
        if (!ns.isRunning(supportManager, host)) {
            ns.exec(supportManager, host, 1, supportIndex);
            ns.tprint(`pserv-launcher: Started support manager on ${host} (slot ${supportIndex}).`);
        }
        supportIndex++;
    }
}
