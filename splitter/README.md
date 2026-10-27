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

`airdrop.js` sends each address in your recipient list exactly **$1.10 worth of a token**, valued at the token's market price at send time. It goes to one recipient every set interval, **plus enough SOL for that recipient to sell it**. The hub buys the token through Jupiter when it doesn't already hold enough. Fund the hub with SOL first (`node split.js init` prints its address).

```bash
# recipients.txt: one wallet address per line, # for comments
MINT=<token CA> node airdrop.js budget            # how much SOL to send the hub
MINT=<token CA> node airdrop.js once --dry-run    # show the next drop and the buy it needs
MINT=<token CA> INTERVAL_MINUTES=30 node airdrop.js run
MINT=<token CA> node airdrop.js status
```

| Env | Default | What |
|---|---|---|
| `MINT` | (required) | Token contract address |
| `RECIPIENTS` | `recipients.txt` | Address list; duplicates are skipped and bad addresses stop the run before anything is sent |
| `USD_PER_DROP` | `1.1` | Dollar value of token each recipient gets |
| `SELL_FEE_LAMPORTS` | `50000` | Fee allowance (0.00005 SOL) included in each recipient's sell SOL |
| `INTERVAL_MINUTES` | `60` | Time between drops |
| `BUY_AHEAD` | `10` | Buy enough token for this many drops per swap |
| `SLIPPAGE_BPS` | `300` | Max slippage on the buy (3%) |
| `BUY_BUFFER` | `0.05` | Extra bought to cover slippage; leftovers go into later drops |
| `MAX_PRIORITY_LAMPORTS` | `10000` | Cap on the swap's priority fee |

Progress is saved to `airdrop-state.json`, so a restart picks up at the next recipient and never pays anyone twice.

## SOL for selling

A wallet with no SOL can't sell. A sell through Jupiter briefly opens a wrapped-SOL account, pays a fee, and has to leave the wallet at or above Solana's minimum balance. So each recipient is topped up to:

| | SOL |
|---|---|
| Wallet minimum balance | ~0.00089 |
| Temporary wrapped-SOL account (returned when the sell closes it) | ~0.00149 |
| Sell fee allowance (`SELL_FEE_LAMPORTS`) | 0.00005 |
| **Total** | **~0.0022 SOL (~$0.22)** |

The amounts are read live from the network. A recipient who already holds that much SOL gets nothing extra, and one holding part of it gets only the difference.

## What to send the hub

`node airdrop.js budget` reads every remaining recipient's wallet and adds up the exact cost. At SOL ≈ $100, a drop to a brand-new wallet costs:

| Cost | ~USD |
|---|---|
| Token ($1.10 + 5% buy buffer) | $1.155 |
| Recipient's token account (one-time, if they've never held the token) | $0.15 |
| SOL to sell with (if their wallet is empty) | $0.22 |
| Transfer + swap fees | < $0.01 |
| **Per drop** | **~$1.53** |

There is also a one-time hub reserve of ~0.0036 SOL (~$0.36). Recipients who already hold the token or some SOL cost less, down to about $1.16.
