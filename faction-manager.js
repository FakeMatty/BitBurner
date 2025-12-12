/** @param {NS} ns */
/**
 * Advanced faction manager - joins factions and shows requirements
 */

// All known factions in BitBurner
const CITY_FACTIONS = ['Sector-12', 'Aevum', 'Volhaven', 'Chongqing', 'New Tokyo', 'Ishima'];
const HACKING_FACTIONS = ['CyberSec', 'NiteSec', 'The Black Hand', 'BitRunners'];
const MEGACORP_FACTIONS = [
    'ECorp', 'MegaCorp', 'KuaiGong International', 'Four Sigma',
    'NWO', 'Blade Industries', 'OmniTek Incorporated',
    'Bachman & Associates', 'Clarke Incorporated', 'Fulcrum Secret Technologies'
];
const CRIMINAL_FACTIONS = ['Slum Snakes', 'Tetrads', 'Silhouette', 'Speakers for the Dead',
    'The Dark Army', 'The Syndicate'];
const ENDGAME_FACTIONS = ['The Covenant', 'Daedalus', 'Illuminati'];
const OTHER_FACTIONS = ['Netburners', 'Tian Di Hui', 'Bladeburners'];

const ALL_FACTIONS = [
    ...CITY_FACTIONS,
    ...HACKING_FACTIONS,
    ...MEGACORP_FACTIONS,
    ...CRIMINAL_FACTIONS,
    ...ENDGAME_FACTIONS,
    ...OTHER_FACTIONS
];

export async function main(ns) {
    ns.disableLog('ALL');
    ns.tail();

    const autoJoin = !ns.args.includes('--no-auto');
    const showAll = ns.args.includes('--all');

    ns.print('═══════════════════════════════════════');
    ns.print('       FACTION MANAGER v2.0            ');
    ns.print('═══════════════════════════════════════\n');

    const player = ns.getPlayer();
    const invitations = ns.singularity.checkFactionInvitations();
    const currentFactions = player.factions;

    // Auto-join all pending invitations
    if (autoJoin && invitations.length > 0) {
        ns.print(`📬 Found ${invitations.length} pending invitation(s):\n`);

        for (const faction of invitations) {
            const joined = ns.singularity.joinFaction(faction);
            if (joined) {
                ns.print(`✓ Joined: ${faction}`);
                currentFactions.push(faction);
            }
        }
        ns.print('\n');
    }

    // Show current factions
    ns.print(`📊 Total Factions Joined: ${currentFactions.length}/${ALL_FACTIONS.length}\n`);

    if (currentFactions.length > 0) {
        ns.print('Current Factions:');
        for (const faction of currentFactions) {
            const rep = ns.singularity.getFactionRep(faction);
            const favor = ns.singularity.getFactionFavor(faction);
            ns.print(`  ✓ ${faction.padEnd(30)} Rep: ${ns.formatNumber(rep).padStart(8)} | Favor: ${favor}`);
        }
        ns.print('\n');
    }

    // Show available invitations (if any remain)
    const remainingInvites = ns.singularity.checkFactionInvitations();
    if (remainingInvites.length > 0) {
        ns.print(`📨 Pending Invitations (${remainingInvites.length}):`);
        for (const faction of remainingInvites) {
            ns.print(`  → ${faction}`);
        }
        ns.print('\n');
    }

    // Show faction categories and status
    if (showAll) {
        ns.print('───────────────────────────────────────');
        ns.print('FACTION CATEGORIES:\n');

        showFactionCategory(ns, 'Early Hacking Factions', HACKING_FACTIONS, currentFactions);
        showFactionCategory(ns, 'City Factions', CITY_FACTIONS, currentFactions);
        showFactionCategory(ns, 'Megacorporations', MEGACORP_FACTIONS, currentFactions);
        showFactionCategory(ns, 'Criminal Organizations', CRIMINAL_FACTIONS, currentFactions);
        showFactionCategory(ns, 'Endgame Factions', ENDGAME_FACTIONS, currentFactions);
        showFactionCategory(ns, 'Other Factions', OTHER_FACTIONS, currentFactions);
    }

    ns.print('═══════════════════════════════════════');
    ns.print('\nUsage:');
    ns.print('  run faction-manager.js          - Auto-join invites');
    ns.print('  run faction-manager.js --all    - Show all factions');
    ns.print('  run faction-manager.js --no-auto - Don\'t auto-join');
}

function showFactionCategory(ns, categoryName, factions, joined) {
    ns.print(`\n${categoryName}:`);

    for (const faction of factions) {
        const status = joined.includes(faction) ? '✓' : '○';
        const marker = joined.includes(faction) ? '' : ' [Not joined]';
        ns.print(`  ${status} ${faction}${marker}`);
    }
}
