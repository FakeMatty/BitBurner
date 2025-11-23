# Bitburner Early-Game Script Pack

This repository contains a small set of Bitburner scripts intended to accelerate the earliest part of a new save. They automate rooting hosts, launching hack/grow/weaken loops, and buying cheap starter servers so you can snowball money quickly.

## Files
- `hello.js` — Simple greeting used to verify you can pull scripts from GitHub.
- `worker.js` — Lightweight hack/grow/weaken loop that keeps a target server's money high and security low.
- `bootstrap.js` — Manager script that roots servers, picks a target, deploys workers everywhere, and buys small servers when you can afford them.

## How to start
1. Pull the files into Bitburner (e.g., using `wget` or your GitHub fetcher).
2. On `home`, run `run bootstrap.js`.
3. Watch the terminal for purchased server messages; the script will automatically spread workers and pick the best target it can hack.

## Dependencies and assumptions
- `bootstrap.js` assumes `worker.js` is present on `home`.
- It will use any port crackers you have (`BruteSSH.exe`, `FTPCrack.exe`, `relaySMTP.exe`, `HTTPWorm.exe`, `SQLInject.exe`), but it also works with only `NUKE.exe`.
- Designed for early-game RAM; purchased servers default to 8GB so they are affordable. You can edit `purchaseRam` and `desiredPurchased` inside `bootstrap.js` as you progress.

## Tips for using the pack
- Keep the scripts running while you explore or do crime jobs; they will keep your money flowing in the background.
- If you unlock stronger port crackers or more RAM, bump the purchase RAM or the target selection to speed things up.
- Replace `worker.js` with batcher-style scripts once you move into mid-game.
