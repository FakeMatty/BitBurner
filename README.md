# Bitburner Early-Game Script Pack

This repository now centers around a lightweight HWGW automation stack designed for early-to-mid game Bitburner play. It follows common community guidance: prep the target, fire one-shot workers with tight-but-safe gaps, and manage everything from a single launcher.

## Community-backed approach (quick summary)
- The usual progression is single-loop scripts → coordinated HGW loops → batch managers (HWGW). The code here sits in that last bucket.
- Use tiny one-shot worker scripts for hack/grow/weaken and let a manager handle timing with landing gaps around 100–200ms.
- Always prep first (max money, min security) and re-prep if the target drifts.
- Recompute timings regularly because your hack level changes runtime lengths.
- A “master control program” on `home` that auto-roots servers, picks a target, and launches the batcher is a common pattern—`mcp.js` does exactly that.

## Core automation
- `mcp.js` — Master launcher that scans the network, auto-roots with any port crackers you own, picks a profitable target (`maxMoney * hackChance / hackTime`), kills older hacking scripts, and starts the batcher on `home`. It also has hooks to start your other scripts (Hacknet, purchased servers, etc.).
- `batcher.js` — Stable single-target HWGW batch controller. It preps the target, computes thread counts based on desired steal fraction and available RAM, schedules one batch at a time with finish order Hack → Weaken → Grow → Weaken, and keeps running indefinitely with automatic re-prep.
- `/shared/hack.js`, `/shared/grow.js`, `/shared/weaken.js` — Minimal one-shot workers (sleep → action → log) used by the batcher. Keep them on `home` (or the host running `batcher.js`).

## Other included utilities
- `hello.js`, `helloworld.js` — Small greeting scripts for connectivity tests.
- `action.js` — General-purpose one-shot helper used by older batch managers.
- `worker.js` — Legacy batching coordinator that spreads actions across rooted hosts with capped grow steps.
- `microbatch.js` — Simple, tiny HGW loop that fires 1-thread hacks with modest grows/weakens when RAM is tight.
- `bootstrap.js` — Roots servers, copies helpers, focuses the network on `foodnstuff`, and keeps purchased servers stocked (pairs with `worker.js`).
- `upgrade.js` — Purchased-server upgrader that periodically buys the biggest server you can afford up to the BitNode cap.
- `monitor.js` — Live dashboard for money %, security, HGW times, and prep ETAs across rooted servers.

## Getting started
1. Pull these files into Bitburner (e.g., via `wget`). Make sure the `/shared` directory exists with `hack.js`, `grow.js`, and `weaken.js` on `home`.
2. From the terminal, run `run mcp.js` for a ~10% per-batch steal target, or `run mcp.js 0.2` if you have the RAM for larger batches.
3. Add your own scripts to the `extraScripts` array in `mcp.js` to autostart them after the batcher.
4. Keep `monitor.js` running in a tail window if you want a quick view of your rooted hosts while batches run.

## Plugging in your scripts
- Drop your automation scripts on `home` and list them in `extraScripts` inside `mcp.js` along with any arguments they need.
- The batcher only depends on the three `/shared` worker files and itself; everything else is optional.
- To iterate on or improve your scripts, start `mcp.js` to handle hacking money, then refine one utility at a time—e.g., swap in a better purchased-server manager—without touching the batcher.

## Troubleshooting and updates
- If Bitburner shows a sync conflict, re-run your `wget` commands with `--no-cache` (or delete the file first) to overwrite with the latest version.
- If `mcp.js` reports missing files, ensure `/shared/hack.js`, `/shared/grow.js`, and `/shared/weaken.js` plus `batcher.js` are on `home`.

Enjoy the faster ramp while keeping the setup simple and extensible for future upgrades.
