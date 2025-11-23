/**
 * Early batching coordinator that prepares a target then fires small hack-grow-weaken batches.
 *
 * Usage: run worker.js [target] [actionScript]
 * - target: server name to hack (defaults to n00dles)
 * - actionScript: helper script used to run individual actions (default: action.js)
 *
 * Behavior:
 * - Prepares the target to near-max money and near-min security using available servers.
 * - Calculates a small batch (hack/grow/weaken/weaken) and schedules completions a few hundred ms apart.
 * - Distributes threads across rooted and purchased servers while reserving some home RAM.
 *
 * This is intentionally lightweight for early-game RAM. If there isn't enough memory to run the
 * full batch, it scales the threads down while keeping the timings aligned.
 *
 * @param {NS} ns
 */
export async function main(ns) {
    const preferredTarget = ns.args[0] || "n00dles";
    const actionScript = ns.args[1] || "action.js";

    const prepareSecBuffer = 0.5;
    const prepareMoneyPct = 0.95;
    const batchGap = calcBatchGap(ns, preferredTarget); // ms between hack/weaken/grow/weaken finishes
    const delayBuffer = 200;      // safety buffer before first action starts
    const homeReservePct = 0.2;   // leave some home RAM free for manual tasks

    const target = preferredTarget;

    while (true) {
        const hosts = hostState(ns, homeReservePct, actionScript);
        if (hosts.totalThreads === 0) {
            ns.print("No available RAM to schedule actions. Waiting...");
            await ns.sleep(2000);
            continue;
        }

        await prepareTarget(ns, target, hosts, actionScript, prepareSecBuffer, prepareMoneyPct);
        const plan = buildBatchPlan(ns, target, actionScript, hosts.totalThreads);
        if (!plan) {
            ns.print("Unable to build a batch plan with current RAM. Retrying after a short wait.");
            await ns.sleep(2000);
            continue;
        }

        const baseSchedule = buildSchedule(ns, target, plan, batchGap, delayBuffer);
        const updatedHosts = hostState(ns, homeReservePct, actionScript); // refresh free RAM
        const success = dispatchBatch(ns, target, actionScript, plan, updatedHosts, batchGap);
        if (!success) {
            ns.print("Batch dispatch failed due to RAM limits. Retrying...");
            await ns.sleep(2000);
            continue;
        }

        logSchedule(ns, target, plan, baseSchedule, batchGap);
        const batchSpacing = calcBatchSpacing(batchGap);
        const lastFinish = baseSchedule.finishWeaken2 + batchSpacing * (plan.batchCount - 1);
        const sleepTime = Math.max(0, lastFinish - Date.now() + delayBuffer);
        await ns.sleep(sleepTime);
    }
}

/**
 * Discover rooted + purchased servers and estimate usable threads for the action script.
 * @param {NS} ns
 * @param {number} homeReservePct
 * @param {string} actionScript
 */
function hostState(ns, homeReservePct, actionScript) {
    const actionRam = ns.getScriptRam(actionScript, "home");
    const seen = new Set(["home"]);
    const queue = ["home"];
    const hosts = [];

    while (queue.length) {
        const host = queue.shift();
        for (const neighbor of ns.scan(host)) {
            if (!seen.has(neighbor)) {
                seen.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    for (const host of seen) {
        if (host !== "home" && !ns.hasRootAccess(host)) continue;
        let freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
        if (host === "home") {
            freeRam = Math.max(0, freeRam - ns.getServerMaxRam(host) * homeReservePct);
        }
        const threads = Math.floor(freeRam / actionRam);
        if (threads > 0) {
            hosts.push({ host, freeRam, threads });
        }
    }

    // Add purchased servers explicitly (ns.scan may miss them if not connected)
    for (const pserv of ns.getPurchasedServers()) {
        if (seen.has(pserv)) continue;
        const freeRam = ns.getServerMaxRam(pserv) - ns.getServerUsedRam(pserv);
        const threads = Math.floor(freeRam / actionRam);
        if (threads > 0) hosts.push({ host: pserv, freeRam, threads });
    }

    hosts.sort((a, b) => b.freeRam - a.freeRam);

    const totalThreads = hosts.reduce((sum, h) => sum + h.threads, 0);
    return { hosts, totalThreads, actionRam };
}

/**
 * Prepare the target to near-max money and near-min security.
 */
async function prepareTarget(ns, target, hosts, actionScript, secBuffer, moneyPct) {
    const minSec = ns.getServerMinSecurityLevel(target);
    const maxMoney = ns.getServerMaxMoney(target);

    while (true) {
        const security = ns.getServerSecurityLevel(target);
        const money = ns.getServerMoneyAvailable(target);
        const needWeaken = security > minSec + secBuffer;
        const needGrow = money < maxMoney * moneyPct;
        if (!needWeaken && !needGrow) return;

        const updated = hostState(ns, 0.2, actionScript);
        if (updated.totalThreads === 0) {
            ns.print("No RAM to prep target. Waiting...");
            await ns.sleep(2000);
            continue;
        }

        if (needWeaken) {
            const threads = Math.max(1, Math.min(updated.totalThreads, Math.ceil((security - minSec) / ns.weakenAnalyze(1))));
            dispatchSimple(ns, target, actionScript, "weaken", threads, updated);
        }
        if (needGrow) {
            const growThreads = Math.max(1, Math.min(updated.totalThreads, Math.ceil(ns.growthAnalyze(target, maxMoney / Math.max(1, money)))));
            dispatchSimple(ns, target, actionScript, "grow", growThreads, updated);
        }

        await ns.sleep(ns.getWeakenTime(target) + 200);
    }
}

/**
 * Build a scaled batch plan based on available threads.
 */
function buildBatchPlan(ns, target, actionScript, availableThreads) {
    const hackFraction = 0.1;
    const maxMoney = ns.getServerMaxMoney(target);
    if (maxMoney <= 0) return null;

    const desiredHackThreads = Math.max(1, Math.floor(ns.hackAnalyzeThreads(target, maxMoney * hackFraction)) || 1);
    const growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(target, 1 / (1 - hackFraction))));

    const hackSec = ns.hackAnalyzeSecurity(desiredHackThreads, target);
    const growSec = ns.growthAnalyzeSecurity(growThreads, target);
    const weakenPerThread = ns.weakenAnalyze(1);
    const weaken1Threads = Math.max(1, Math.ceil(hackSec / weakenPerThread));
    const weaken2Threads = Math.max(1, Math.ceil(growSec / weakenPerThread));

    const required = desiredHackThreads + growThreads + weaken1Threads + weaken2Threads;

    const scale = Math.min(1, availableThreads / required);
    if (scale <= 0) return null;

    const plan = {
        hackThreads: Math.max(1, Math.floor(desiredHackThreads * scale)),
        growThreads: Math.max(1, Math.floor(growThreads * scale)),
        weaken1Threads: Math.max(1, Math.floor(weaken1Threads * scale)),
        weaken2Threads: Math.max(1, Math.floor(weaken2Threads * scale)),
    };

    const threadsPerBatch = plan.hackThreads + plan.growThreads + plan.weaken1Threads + plan.weaken2Threads;
    if (threadsPerBatch <= 0) return null;

    const batchCount = Math.min(5, Math.max(1, Math.floor(availableThreads / threadsPerBatch)));
    return { ...plan, threadsPerBatch, batchCount };
}

/**
 * Compute start delays so actions finish tightly grouped while keeping ordering.
 */
function buildSchedule(ns, target, plan, gap, buffer, offset = 0) {
    const now = Date.now();
    const weakenTime = ns.getWeakenTime(target);
    const growTime = ns.getGrowTime(target);
    const hackTime = ns.getHackTime(target);

    const finishWeaken2 = now + buffer + weakenTime + gap * 3 + offset;
    const finishGrow = finishWeaken2 - gap;
    const finishWeaken1 = finishGrow - gap;
    const finishHack = finishWeaken1 - gap;

    const hackStart = Math.max(0, finishHack - hackTime - now);
    const weaken1Start = Math.max(0, finishWeaken1 - weakenTime - now);
    const growStart = Math.max(0, finishGrow - growTime - now);
    const weaken2Start = Math.max(0, finishWeaken2 - weakenTime - now);

    return { hackStart, weaken1Start, growStart, weaken2Start, finishHack, finishWeaken1, finishGrow, finishWeaken2 };
}

/**
 * Dispatch a full batch across available hosts.
 */
function dispatchBatch(ns, target, actionScript, plan, hosts, gap) {
    const state = hosts.hosts.map(h => ({ ...h }));
    const actionRam = hosts.actionRam;
    const batchSpacing = calcBatchSpacing(gap);

    for (let i = 0; i < plan.batchCount; i++) {
        const offset = i * batchSpacing;
        const batchSchedule = buildSchedule(ns, target, plan, gap, 0, offset);
        const steps = [
            { action: "weaken", threads: plan.weaken1Threads, delay: batchSchedule.weaken1Start },
            { action: "hack", threads: plan.hackThreads, delay: batchSchedule.hackStart },
            { action: "grow", threads: plan.growThreads, delay: batchSchedule.growStart },
            { action: "weaken", threads: plan.weaken2Threads, delay: batchSchedule.weaken2Start },
        ];

        for (const step of steps) {
            const assignments = allocateThreads(state, step.threads, actionRam);
            if (assignments.assigned < step.threads) {
                ns.print(`Not enough threads for ${step.action}; assigned ${assignments.assigned}/${step.threads}.`);
                return false;
            }

            for (const job of assignments.jobs) {
                ns.exec(actionScript, job.host, job.threads, target, step.action, step.delay);
            }
        }
    }
    return true;
}

/**
 * Dispatch a simple action immediately for prep steps.
 */
function dispatchSimple(ns, target, actionScript, action, threads, hosts) {
    const assignments = allocateThreads(hosts.hosts.map(h => ({ ...h })), threads, hosts.actionRam);
    for (const job of assignments.jobs) {
        ns.exec(actionScript, job.host, job.threads, target, action, 0);
    }
}

function logSchedule(ns, target, plan, schedule, gap) {
    ns.print(`Scheduled ${plan.batchCount} batch(es) for ${target} using ${plan.threadsPerBatch} threads each.`);
    ns.print(` First batch hack completes at ${toGMT(schedule.finishHack)}`);
    ns.print(` First weaken#1 completes at ${toGMT(schedule.finishWeaken1)}`);
    ns.print(` First grow completes at ${toGMT(schedule.finishGrow)}`);
    ns.print(` First weaken#2 completes at ${toGMT(schedule.finishWeaken2)}`);
    ns.print(` Batch spacing: ~${calcBatchSpacing(gap)}ms; finish spacing within batch: ~${gap}ms.`);
}

function toGMT(timestamp) {
    return new Date(timestamp).toISOString();
}

function calcBatchGap(ns, target) {
    const weakenTime = ns.getWeakenTime(target);
    return Math.max(200, Math.min(750, Math.round(weakenTime * 0.02)));
}

function calcBatchSpacing(gap) {
    return Math.max(200, Math.floor(gap / 2));
}

/**
 * Allocate threads across hosts using available RAM.
 */
function allocateThreads(hosts, neededThreads, ramPerThread) {
    let remaining = neededThreads;
    const jobs = [];

    for (const host of hosts) {
        const possible = Math.floor(host.freeRam / ramPerThread);
        if (possible <= 0) continue;
        const use = Math.min(possible, remaining);
        if (use > 0) {
            jobs.push({ host: host.host, threads: use });
            remaining -= use;
            host.freeRam -= use * ramPerThread;
        }
        if (remaining <= 0) break;
    }

    const assigned = neededThreads - remaining;
    return { jobs, assigned };
}
