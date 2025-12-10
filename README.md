# BitBurner Advanced HWGW Batching System

An efficient, fully-automated hacking system for Bitburner that uses HWGW (Hack-Weaken-Grow-Weaken) batching to maximize income. This system automatically utilizes **all available servers** across your network for maximum efficiency.

## Features

- **Fully Automated**: One command to start everything
- **HWGW Batching**: Industry-standard batch scheduling with proper timing
- **Network-Wide Execution**: Uses ALL servers (home, purchased, and rooted network servers)
- **Smart Target Selection**: Automatically picks the most profitable target
- **Dynamic RAM Management**: Distributes threads across all available servers
- **Auto-Prep**: Prepares target to max money and min security
- **Multi-Batch Support**: Runs multiple batches in parallel for maximum throughput
- **Self-Healing**: Automatically re-preps if target drifts

## System Architecture

### Core Components

1. **Worker Scripts** (`hack.js`, `grow.js`, `weaken.js`)
   - Minimal one-shot scripts that perform single operations
   - Used 1.75 GB RAM each
   - Automatically distributed to all servers

2. **Utilities** (`utils.js`)
   - Network scanning and server discovery
   - Auto-rooting with available port crackers
   - Target selection based on profitability
   - RAM management across all servers

3. **Batcher** (`batcher.js`)
   - Advanced HWGW batch scheduler
   - Calculates optimal thread counts
   - Times operations to land in perfect sequence
   - Runs multiple parallel batches
   - Distributes work across entire network

4. **Master Control Program** (`mcp.js`)
   - Main orchestrator script
   - Roots all accessible servers
   - Selects best target
   - Launches the batcher

### Optional Tools

5. **Monitor** (`monitor.js`)
   - Real-time dashboard for target stats
   - Shows money %, security levels, timing
   - Displays RAM usage and income

6. **Purchased Server Manager** (`pserv-manager.js`)
   - Automatically buys and upgrades purchased servers
   - Optimizes spending for maximum RAM

## Quick Start

### Installation

1. Use your in-game sync script to pull files from this GitHub repo
2. Make sure all files in `files.txt` are downloaded to `home`

### Running the System

```bash
run mcp.js
```

That's it! The MCP will:
1. Root all accessible servers on the network
2. Select the most profitable target
3. Launch the batcher with optimized settings

### Advanced Usage

#### Custom Steal Percentage

```bash
run mcp.js 0.05   # Steal 5% per batch (safer, more batches)
run mcp.js 0.10   # Steal 10% per batch (default)
run mcp.js 0.25   # Steal 25% per batch (fewer but bigger batches)
```

**Note**: Lower percentages = more batches in parallel = higher total income (if you have enough RAM)

#### Monitor Your Progress

```bash
run monitor.js n00dles   # Replace with your target name
```

#### Auto-Buy Purchased Servers

```bash
run pserv-manager.js 32   # Buy servers with minimum 32 GB RAM
```

The manager will:
- Buy new servers up to the limit (25)
- Upgrade your smallest server when possible
- Only spend 10% of money on new servers, 25% on upgrades

## How HWGW Batching Works

### The Batch Structure

Each batch consists of 4 operations that land in sequence:

1. **Hack** - Steals money from target
2. **Weaken** - Removes security added by hack
3. **Grow** - Restores stolen money
4. **Weaken** - Removes security added by grow

### Why It's Efficient

- Operations land with 100ms gaps (configurable)
- Multiple batches run in parallel
- Each batch starts 1000ms after the previous one
- Target stays at max money and min security
- Utilizes 100% of available RAM across all servers

### Thread Distribution

The batcher automatically:
- Calculates exact threads needed for each operation
- Distributes threads across ALL available servers
- Sorts servers by available RAM for optimal allocation
- Ensures operations have proper delays to land on time

## Performance Tips

### Early-Mid Game (BN2)

1. Start with low steal percentage: `run mcp.js 0.05`
2. Focus on getting more purchased servers
3. Run `pserv-manager.js` to automate server purchases
4. Target easier servers with high money/time ratios

### Mid-Late Game

1. Increase steal percentage as you get more RAM: `run mcp.js 0.25`
2. Upgrade purchased servers to 1024+ GB
3. System will automatically run more parallel batches
4. Income scales exponentially with available RAM

## Troubleshooting

### "Not enough RAM on home to run batcher"

The batcher itself needs ~5 GB on home. Make sure you have space, or kill other scripts.

### Batches not launching

- Check RAM usage with `run monitor.js`
- Lower your steal percentage to reduce RAM requirements per batch
- Upgrade/buy more purchased servers

### Target keeps drifting

- Normal for lower hack levels (operations take longer)
- System will auto-re-prep
- As you level up, drift decreases

### No income showing

- Wait for first batch to complete (can take several minutes)
- Check that operations are running: `ps` or monitor
- Verify target has money: `run monitor.js target-name`

## Technical Details

### RAM Requirements

- Each worker script: 1.75 GB
- Batch size varies based on target and steal %
- Typical batch: 50-500 threads = 87.5 - 875 GB
- More RAM = more parallel batches = exponentially more income

### Timing Math

Operations are timed so all 4 finish in the correct order:

```
Hack finishes:     T + 0ms
Weaken1 finishes:  T + 100ms
Grow finishes:     T + 200ms
Weaken2 finishes:  T + 300ms
```

Each operation starts with a calculated delay to land at the right time.

### Thread Calculations

- **Hack threads**: Based on % of max money to steal
- **Weaken threads**: Security increase / 0.05
- **Grow threads**: `ns.growthAnalyze()` for money recovery
- **Weaken threads**: Security increase / 0.05

## Files Reference

- `hack.js` - Worker script for hacking
- `grow.js` - Worker script for growing
- `weaken.js` - Worker script for weakening
- `utils.js` - Network scanning and utilities
- `batcher.js` - Core batching engine
- `mcp.js` - Main orchestrator
- `monitor.js` - Real-time stats dashboard
- `pserv-manager.js` - Automated server purchasing
- `files.txt` - List of files for sync script

## Contributing

This is a personal Bitburner script repository. Feel free to fork and customize for your own use!

## Credits

Based on community HWGW batching concepts. Optimized for mid-game efficiency and ease of use.
