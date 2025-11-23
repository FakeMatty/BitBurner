# Bitburner Early-Game Script Pack

This repository contains a small set of Bitburner scripts intended to accelerate the earliest part of a new save. They automate rooting hosts, launching hack/grow/weaken loops, and buying cheap starter servers so you can snowball money quickly.

## Files
- `hello.js` — Simple greeting used to verify you can pull scripts from GitHub.
- `helloworld.js` — Minimal "Hello, world!" script for quick testing.
- `action.js` — Helper used by the batch coordinator to run a single hack/grow/weaken action (threads are provided by `ns.exec`) and log the GMT completion time for each action instance.
- `worker.js` — Batching coordinator that preps a target then fires hack/grow/weaken batches with ~1s spacing, scaling down to fit early-game RAM while logging when each step should finish in GMT.
- `bootstrap.js` — Manager script that roots servers, picks a target, copies helpers everywhere, starts the coordinator on home, and buys small servers when you can afford them (never below 4GB RAM).

## How to start
1. Pull the files into Bitburner (e.g., using `wget` or your GitHub fetcher).
2. On `home`, run `run bootstrap.js`.
3. Watch the terminal for purchased server messages; the script will automatically spread helpers and pick the best target it can hack.

## Dependencies and assumptions
- `bootstrap.js` assumes `worker.js` and `action.js` are present on `home`.
- It will use any port crackers you have (`BruteSSH.exe`, `FTPCrack.exe`, `relaySMTP.exe`, `HTTPWorm.exe`, `SQLInject.exe`), but it also works with only `NUKE.exe`.
- Designed for early-game RAM; purchased servers default to 8GB but will automatically downsize to whatever you can afford (never below 4GB). You can edit `purchaseRam` and `desiredPurchased` inside `bootstrap.js` as you progress.

## Tips for using the pack
- Keep the scripts running while you explore or do crime jobs; they will keep your money flowing in the background.
- The batch coordinator prepares the target to high money/low security and then launches hack → weaken → grow → weaken batches that finish about one second apart. If RAM is tight, it scales thread counts down instead of stalling, and it prints expected completion times in GMT so you can see when money will land.
- Each time you run `bootstrap.js` it kills existing `worker.js` instances across your network, copies the latest helpers, and restarts the coordinator so updates propagate everywhere automatically.
- Replace `worker.js` with a more advanced batcher once you move into mid-game.

## Updating when GitHub reports a conflict
If you see a GitHub conflict banner while trying to pull new versions of these files, you can safely favor the latest upstream changes because these scripts are meant to be overwritten as a set.

Quick options:
- **Local git clone:** run `git fetch` then `git checkout origin/main -- .` to take the incoming version of every file, then commit or re-run your downloader.
- **Bitburner wget:** re-run your `wget` commands with the `--no-cache` flag (or delete the existing file first) to overwrite your copy with the updated GitHub version.

Either approach discards local edits in favor of the repository’s version, which is the fastest way to resolve the conflict and keep playing.
