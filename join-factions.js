/** @param {NS} ns */
/**
 * Automatically joins all available factions
 * Checks for invitations and accepts them all
 */
export async function main(ns) {
    ns.disableLog('ALL');
    ns.tail();

    const continuous = ns.args[0] === 'loop' || ns.args[0] === 'auto';

    ns.print('═══════════════════════════════════════');
    ns.print('     FACTION AUTO-JOIN SCRIPT          ');
    ns.print('═══════════════════════════════════════\n');

    do {
        // Get all pending faction invitations
        const invitations = ns.singularity.checkFactionInvitations();

        if (invitations.length === 0) {
            ns.print('No pending faction invitations.');
        } else {
            ns.print(`Found ${invitations.length} faction invitation(s):\n`);

            for (const faction of invitations) {
                try {
                    const joined = ns.singularity.joinFaction(faction);

                    if (joined) {
                        ns.print(`✓ Successfully joined: ${faction}`);
                    } else {
                        ns.print(`✗ Failed to join: ${faction}`);
                    }
                } catch (error) {
                    ns.print(`✗ Error joining ${faction}: ${error.message}`);
                }
            }
        }

        // Show current factions
        const currentFactions = ns.getPlayer().factions;
        ns.print('\n───────────────────────────────────────');
        ns.print(`Total factions joined: ${currentFactions.length}`);

        if (currentFactions.length > 0) {
            ns.print('\nCurrent factions:');
            for (const faction of currentFactions) {
                const rep = ns.singularity.getFactionRep(faction);
                const favor = ns.singularity.getFactionFavor(faction);
                ns.print(`  • ${faction} (Rep: ${ns.formatNumber(rep)}, Favor: ${favor})`);
            }
        }

        ns.print('═══════════════════════════════════════\n');

        if (continuous) {
            ns.print('Waiting 60 seconds before next check...\n');
            await ns.sleep(60000);
        }

    } while (continuous);

    if (!continuous) {
        ns.print('Done! Run with "loop" argument for continuous monitoring:');
        ns.print('  run join-factions.js loop');
    }
}
