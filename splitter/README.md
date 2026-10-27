# Splitter

Send SOL to one hub wallet and it gets split into fresh wallets that each hold **$1.20 worth of SOL** (at the live SOL price).

## Setup

```bash
cd splitter
npm install
node split.js init      # creates hub-keypair.json and prints the hub address
```

Send SOL to the printed hub address.

## Run

```bash
node split.js split --dry-run   # show how many wallets it would make; moves nothing
node split.js split             # split what the hub holds right now
node split.js watch             # keep polling and split every new deposit
```

| Env | Default | What |
|---|---|---|
| `RPC_URL` | `https://api.mainnet-beta.solana.com` | Use a paid RPC (Helius, Triton, QuickNode) for anything serious |
| `USD_PER_WALLET` | `1.2` | Dollar value each new wallet gets |
| `SOL_PRICE_USD` | live from CoinGecko | Fix the price instead of fetching it |
| `POLL_SECONDS` | `15` | How often `watch` checks the hub |

## How it works

1. Reads the hub balance and the SOL/USD price, and turns $1.20 into lamports.
2. Keeps back the hub's rent-exempt minimum (~0.00089 SOL) and 5000 lamports of fee per transaction, then makes as many $1.20 wallets as the rest covers. Anything under $1.20 stays in the hub and is used in the next split.
3. Generates the new keypairs and **writes them to `wallets/split-<time>.json` before sending anything**. That way a crash can't leave a funded wallet whose key was lost.
4. Sends up to 20 transfers per transaction and records each wallet's status (`funded` / `failed`) and signature in the same file.

## Keys

`hub-keypair.json` and `wallets/` hold private keys. They are gitignored and written with `0600` permissions. Back them up somewhere safe; anyone with these files can spend the funds.
