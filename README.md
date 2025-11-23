# Bitburner Early-Game Script Pack

This repository contains a small set of Bitburner scripts intended to accelerate the earliest part of a new save. They automate rooting hosts, launching hack/grow/weaken loops, and buying cheap starter servers so you can snowball money quickly.

## Files
- `hello.js` — Simple greeting used to verify you can pull scripts from GitHub.
- `helloworld.js` — Minimal "Hello, world!" script for quick testing.
- `action.js` — Helper used by the batch coordinator to run a single hack/grow/weaken action (threads are provided by `ns.exec`) and log the GMT completion time for each action instance; defaults to `foodnstuff` if you omit the target.
- `worker.js` — Batching coordinator that preps `foodnstuff` then fires tightly spaced hack/grow/weaken batches (sub-1s spacing when possible), scales thread counts based on available RAM, and logs when each step should finish in GMT.
- `microbatch.js` — Lightweight alternative that continuously fires tiny hack (1 thread) / grow / weaken cycles (10 threads max per action) with ~100ms spacing, sizing grow to restore ~99% money and weaken to reach minimum security, pausing when the network runs out of RAM.
- `bootstrap.js` — Manager script that roots servers, focuses the network on `foodnstuff`, copies helpers everywhere, starts the coordinator on home, and keeps buying/using purchased servers when you can afford them (never below 16GB RAM).
- `upgrade.js` — Standalone purchased-server upgrader that every interval (default 60 seconds) upgrades your smallest purchased server to the largest affordable RAM tier up to the BitNode cap, using all available cash.
- `monitor.js` — Live dashboard listing rooted servers that have money (filters out zero-max hosts) with money %, security, hack/grow/weaken times, threads to prep to max, and a rough ETA to finish prep, refreshed every few seconds (defaults to the 20 lowest-max-money servers, configurable via arg).

## How to start
1. Pull the files into Bitburner (e.g., using `wget` or your GitHub fetcher).
2. On `home`, run `run bootstrap.js`.
3. Optionally start `run upgrade.js` to keep purchased servers climbing in RAM every minute.
4. Watch the terminal for purchased server messages; the scripts will automatically spread helpers and focus batches on `foodnstuff` once rooted.

## Dependencies and assumptions
- `bootstrap.js` assumes `worker.js` and `action.js` are present on `home`.
- It will use any port crackers you have (`BruteSSH.exe`, `FTPCrack.exe`, `relaySMTP.exe`, `HTTPWorm.exe`, `SQLInject.exe`), but it also works with only `NUKE.exe`.
- Designed for early-game RAM; purchased servers always stay at or above 16GB and scale as high as your BitNode allows (up to `getPurchasedServerMaxRam()`) while filling every purchased-slot once you can afford the cost. You can edit `purchaseRam` and `minPurchaseRam` inside `bootstrap.js` as you progress, and run `upgrade.js` in parallel to keep bumping RAM with your extra cash.

## Tips for using the pack
- Keep the scripts running while you explore or do crime jobs; they will keep your money flowing in the background.
- The batch coordinator prepares `foodnstuff` to high money/low security and then launches hack → weaken → grow → weaken batches that finish a few hundred milliseconds apart. If RAM is tight, it scales thread counts down and increases/decreases batch concurrency based on how many threads are available, printing expected completion times in GMT so you can see when money will land.
- Each time you run `bootstrap.js` it kills existing `worker.js` instances across your network, copies the latest helpers, and restarts the coordinator so updates propagate everywhere automatically.
- Use `microbatch.js` if you want constant, tiny cycles with a 1-thread hack, ~100ms spacing, and up to 10 threads per action; it will pause when the network runs out of RAM and resume once space frees up while sizing grow to push the target back to ~99% money and weaken to minimum security.
- Replace `worker.js` with a more advanced batcher once you move into mid-game.
- Keep `monitor.js` running in a tail window (e.g., `run monitor.js 2000 20`) to watch money %, prep threads, and rough ETAs for each rooted host; the second arg controls how many of the lowest-max-money servers to display.

## Updating when GitHub reports a conflict
If you see a GitHub conflict banner while trying to pull new versions of these files, you can safely favor the latest upstream changes because these scripts are meant to be overwritten as a set.

Quick options:
- **Local git clone:** run `git fetch` then `git checkout origin/main -- .` to take the incoming version of every file, then commit or re-run your downloader.
- **Bitburner wget:** re-run your `wget` commands with the `--no-cache` flag (or delete the existing file first) to overwrite your copy with the updated GitHub version.

Either approach discards local edits in favor of the repository’s version, which is the fastest way to resolve the conflict and keep playing.

## FAQ: faction automation
- There isn’t an API to “hack into” every faction. Invitations are gated by their standing requirements (city presence, stats, company rep, augmentations, or story progress), so you have to meet those conditions before a faction will invite you.
- If you have Singularity access (BitNode 4 or Source-File 4), you can script joining a faction the moment you qualify and queue work/donations automatically. Without Singularity, you must join and start working manually, but you can still automate money-making (e.g., with these scripts) to hit donation thresholds faster.
