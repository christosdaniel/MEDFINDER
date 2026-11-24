# MedFinder Stock Sync agent

Keeps MedFinder up to date from the stock file a pharmacy already uses. It watches the file and uploads it whenever it is saved. MedFinder reads it on the server, so nothing else needs installing.

Supported files: Excel `.xlsx`, `.csv`, Microsoft Access `.mdb` / `.accdb`.

## Setup

1. Install [Node.js](https://nodejs.org) 18 or newer.
2. In the MedFinder pharmacy portal, open **Import / link database** and copy your **sync key**.
3. Copy `config.example.json` to `config.json` and fill in the API URL, key and file path, or pass them on the command line:

```bash
node sync.js --api https://YOUR-SERVER/api --key mfsync_xxx --file "C:\Pharmacy\stock.xlsx"
```

Options: `--table <name>` (Access table), `--mode replace` (file is your full stock list; anything missing becomes out of stock), `--interval 60` (seconds between checks), `--once` (upload once and exit).

## Run it automatically on Windows

Use Task Scheduler → *Create Basic Task* → trigger *When I log on* (or every 15 minutes with `--once`) → action *Start a program*: `node` with arguments `C:\path\to\sync.js --config C:\path\to\config.json`.

## Columns

The server recognises common headers: *Medicine / Drug / Product / Item name*, *Strength / Dosage*, *Price / Selling price / Unit price*, *Quantity / Qty / Stock / QOH*, plus optional *Form*, *Category*, *Reorder level*, *Prescription*. If your headers are unusual, upload once in the portal to check the mapping, then add `"mapping": {"name": "Your column", "price": "...", "quantity": "..."}` to `config.json`.
