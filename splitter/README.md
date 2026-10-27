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

# Gradual airdrop

`airdrop.js` sends each address in your recipient list exactly **$1.30 worth of a token**, one recipient every set interval. The value is taken from the token's market price at send time. The hub buys the token through Jupiter when it doesn't already hold enough. Fund the hub with SOL first (`node split.js init` prints its address).

```bash
# recipients.txt: one wallet address per line, # for comments
MINT=<token CA> node airdrop.js once --dry-run   # show the next drop and the buy it needs
MINT=<token CA> INTERVAL_MINUTES=30 node airdrop.js run
MINT=<token CA> node airdrop.js status
```

| Env | Default | What |
|---|---|---|
| `MINT` | (required) | Token contract address |
| `RECIPIENTS` | `recipients.txt` | Address list; duplicates are skipped and bad addresses stop the run before anything is sent |
| `USD_PER_DROP` | `1.3` | Dollar value each recipient gets |
| `INTERVAL_MINUTES` | `60` | Time between drops |
| `BUY_AHEAD` | `10` | Buy enough token for this many drops per swap |
| `SLIPPAGE_BPS` | `300` | Max slippage on the buy (3%) |
| `BUY_BUFFER` | `0.05` | Extra bought to cover slippage; leftovers go into later drops |
| `MAX_PRIORITY_LAMPORTS` | `10000` | Cap on the swap's priority fee |

Progress is saved to `airdrop-state.json`, so a restart picks up at the next recipient and never pays anyone twice.

## Costs per drop

| Cost | Amount | When |
|---|---|---|
| Transfer fee | 5000 lamports (~$0.0005) | Every drop |
| Swap fee + priority | ≤ ~15000 lamports (~$0.0015) | Once per `BUY_AHEAD` drops |
| Recipient's token account | ~0.0015 SOL (~$0.15), stays in the recipient's account | Only if the recipient has never held this token |
| DEX/pool fee + slippage | ~0.25–1% of the buy | Built into the swap price |

The network fees come to well under $0.01 per drop. The one cost that isn't near zero is the recipient's token account. Solana charges this deposit the first time a wallet holds a given token, and the sender has to pay it. Nothing can avoid it, but it's charged once per recipient, not once per drop.
