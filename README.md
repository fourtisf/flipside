# Flipside handoff package

Long or short any Solana coin by its contract address, filled against an on-chain pool. Working name: Flipside.

| File | What it is |
|---|---|
| `prototype.html` | Approved UI. Open it in a browser: every view works with simulated data. |
| `CLAUDE.md` | Full build brief: stack, vault program, engine and ledger, price indexer, risk engine, API, database, frontend port rules, deployment, phases and definition of done. |
| `TASK.md` | The first message to paste into Claude Code, plus a phase checklist. |
| `.env.example` | Every environment variable, with the trading and risk defaults. |

How to start: put all of these files in an empty folder, open Claude Code there, and paste the prompt from `TASK.md` step 2. Claude Code builds one phase at a time and stops for review after each one.
