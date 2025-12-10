/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog('ALL');
    ns.tail();

    const maxServers = ns.getPurchasedServerLimit();
    const minRam = ns.args[0] || 8; // Minimum RAM to buy (GB)

    ns.print('=== Purchased Server Manager ===');
    ns.print(`Target: ${maxServers} servers`);
    ns.print(`Minimum RAM per server: ${minRam} GB`);

    while (true) {
        const owned = ns.getPurchasedServers();
        const money = ns.getServerMoneyAvailable('home');

        // If we don't have max servers yet, buy new ones
        if (owned.length < maxServers) {
            let ramToBuy = minRam;

            // Find the largest RAM we can afford
            while (ramToBuy <= ns.getPurchasedServerMaxRam()) {
                const cost = ns.getPurchasedServerCost(ramToBuy * 2);
                if (cost > money * 0.1) break; // Only spend 10% of current money
                ramToBuy *= 2;
            }

            const cost = ns.getPurchasedServerCost(ramToBuy);

            if (cost <= money * 0.1 && ramToBuy >= minRam) {
                const hostname = `pserv-${owned.length}`;
                const purchased = ns.purchaseServer(hostname, ramToBuy);

                if (purchased) {
                    ns.print(`Purchased: ${purchased} with ${ramToBuy} GB RAM ($${ns.formatNumber(cost)})`);
                }
            }
        } else {
            // We have max servers, try to upgrade the weakest one
            let weakestServer = null;
            let weakestRam = Infinity;

            for (const server of owned) {
                const ram = ns.getServerMaxRam(server);
                if (ram < weakestRam && ram < ns.getPurchasedServerMaxRam()) {
                    weakestRam = ram;
                    weakestServer = server;
                }
            }

            if (weakestServer) {
                const targetRam = weakestRam * 2;
                const cost = ns.getPurchasedServerCost(targetRam);

                if (cost <= money * 0.25) { // Spend up to 25% on upgrades
                    ns.killall(weakestServer);
                    ns.deleteServer(weakestServer);

                    const newServer = ns.purchaseServer(weakestServer, targetRam);

                    if (newServer) {
                        ns.print(`Upgraded: ${weakestServer} from ${weakestRam} GB to ${targetRam} GB ($${ns.formatNumber(cost)})`);
                    }
                }
            }
        }

        await ns.sleep(30000); // Check every 30 seconds
    }
}
