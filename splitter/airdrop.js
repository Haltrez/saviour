#!/usr/bin/env node
// Saviour gradual airdrop: fund the hub with SOL, and every INTERVAL_MINUTES
// it sends the next recipient on your list exactly USD_PER_DROP worth of a
// token (default $1.10, valued at the token's market price at send time),
// plus enough SOL for them to sell it. It buys the token through Jupiter when
// the hub doesn't already hold enough.
//
//   node airdrop.js budget            how much SOL the hub needs for the remaining drops
//   node airdrop.js run [--dry-run]   drop to one recipient every interval
//   node airdrop.js once [--dry-run]  drop to the next recipient and exit
//   node airdrop.js status            show progress
//
// The hub wallet is the same one split.js uses: create it with `node split.js init`.
//
// Env:
//   MINT              token contract address (required)
//   RECIPIENTS        file with one wallet address per line (default recipients.txt)
//   USD_PER_DROP      default 1.1
//   SELL_FEE_LAMPORTS fee allowance each recipient gets for selling, default 50000
//   INTERVAL_MINUTES  default 60
//   SLIPPAGE_BPS      default 300 (3%)
//   BUY_BUFFER        extra fraction bought to cover slippage, default 0.05
//   BUY_AHEAD         drops' worth of token to buy per swap, default 10
//                     (one swap per 10 drops instead of one per drop: fewer fees)
//   MAX_PRIORITY_LAMPORTS  cap on the swap's priority fee, default 10000 (0.00001 SOL)
//   RPC_URL           default https://api.mainnet-beta.solana.com

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccountLenForMint,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const HUB_PATH = path.join(DIR, "hub-keypair.json");
const STATE_PATH = path.join(DIR, "airdrop-state.json");

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const MINT = process.env.MINT;
const RECIPIENTS = path.resolve(process.env.RECIPIENTS || path.join(DIR, "recipients.txt"));
const USD_PER_DROP = Number(process.env.USD_PER_DROP || 1.1);
const SELL_FEE_LAMPORTS = Number(process.env.SELL_FEE_LAMPORTS || 50000);
const INTERVAL_MINUTES = Number(process.env.INTERVAL_MINUTES || 60);
const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS || 300);
const BUY_BUFFER = Number(process.env.BUY_BUFFER || 0.05);
const BUY_AHEAD = Math.max(1, Number(process.env.BUY_AHEAD || 10));
const MAX_PRIORITY_LAMPORTS = Number(process.env.MAX_PRIORITY_LAMPORTS || 10000);
const DRY_RUN = process.argv.includes("--dry-run");

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUP = "https://lite-api.jup.ag";
const TX_FEE = 5000; // lamports, one signature
const TOKEN_ACCOUNT_LEN = 165; // a classic SPL token account, e.g. wrapped SOL

const connection = new Connection(RPC_URL, "confirmed");

function loadHub() {
  if (!fs.existsSync(HUB_PATH)) {
    throw new Error(`No hub wallet at ${HUB_PATH}. Run: node split.js init`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(HUB_PATH, "utf8"))));
}

function loadRecipients() {
  if (!fs.existsSync(RECIPIENTS)) throw new Error(`No recipients file at ${RECIPIENTS}`);
  const lines = fs
    .readFileSync(RECIPIENTS, "utf8")
    .split(/\r?\n/)
    .map((l) => l.split("#")[0].trim())
    .filter(Boolean);
  const seen = new Set();
  return lines.filter((addr) => {
    new PublicKey(addr); // throws on a bad address, before anything is sent
    if (seen.has(addr)) return false;
    seen.add(addr);
    return true;
  });
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { mint: MINT, drops: {} };
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  if (state.mint !== MINT) {
    throw new Error(`${STATE_PATH} belongs to mint ${state.mint}. Move it aside to start a new airdrop.`);
  }
  return state;
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function prices() {
  const res = await fetch(`${JUP}/price/v3?ids=${SOL_MINT},${MINT}`);
  if (!res.ok) throw new Error(`Jupiter price API returned ${res.status}`);
  const data = await res.json();
  const sol = data[SOL_MINT]?.usdPrice;
  const token = data[MINT]?.usdPrice;
  if (!(sol > 0)) throw new Error("No SOL price from Jupiter");
  if (!(token > 0)) throw new Error(`No USD price for ${MINT} from Jupiter`);
  return { sol, token };
}

// Mint decimals, owning program (classic SPL Token or Token-2022) and the
// rent a holder's token account for it costs.
async function mintInfo(mint) {
  const acc = await connection.getAccountInfo(mint);
  if (!acc) throw new Error(`Mint ${mint.toBase58()} not found`);
  const info = await getMint(connection, mint, "confirmed", acc.owner);
  const ataRent = await connection.getMinimumBalanceForRentExemption(getAccountLenForMint(info));
  return { decimals: info.decimals, programId: acc.owner, ataRent };
}

// SOL a recipient must hold to sell: a sell opens a temporary wrapped-SOL
// account (its rent comes back when it closes in the same transaction), pays
// fees, and must leave the wallet at or above the rent-exempt minimum.
async function sellReserve() {
  const [walletMin, wsolRent] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(0),
    connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_LEN),
  ]);
  return walletMin + wsolRent + SELL_FEE_LAMPORTS;
}

async function accountsExist(keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 100) {
    out.push(...(await connection.getMultipleAccountsInfo(keys.slice(i, i + 100))));
  }
  return out;
}

async function tokenBalance(owner, mint, programId) {
  const ata = getAssociatedTokenAddressSync(mint, owner, true, programId);
  try {
    const bal = await connection.getTokenAccountBalance(ata);
    return BigInt(bal.value.amount);
  } catch {
    return 0n; // account doesn't exist yet
  }
}

async function buy(hub, lamports) {
  const quoteUrl =
    `${JUP}/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${MINT}` +
    `&amount=${lamports}&slippageBps=${SLIPPAGE_BPS}`;
  const quote = await (await fetch(quoteUrl)).json();
  if (!quote.outAmount) throw new Error(`No Jupiter route: ${JSON.stringify(quote)}`);

  const res = await fetch(`${JUP}/swap/v1/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: hub.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: { priorityLevel: "medium", maxLamports: MAX_PRIORITY_LAMPORTS },
      },
    }),
  });
  const { swapTransaction, error } = await res.json();
  if (!swapTransaction) throw new Error(`Jupiter swap failed: ${error}`);

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
  tx.sign([hub]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const latest = await connection.getLatestBlockhash();
  const conf = await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
  if (conf.value.err) throw new Error(`Buy ${sig} failed: ${JSON.stringify(conf.value.err)}`);
  return sig;
}

async function dropOnce() {
  if (!MINT) throw new Error("Set MINT to the token contract address");
  const hub = loadHub();
  const mint = new PublicKey(MINT);
  const recipients = loadRecipients();
  const state = loadState();

  const next = recipients.find((r) => !state.drops[r]);
  if (!next) {
    console.log(`All ${recipients.length} recipients have received their drop.`);
    return false;
  }

  const { decimals, programId } = await mintInfo(mint);
  const price = await prices();
  const owner = new PublicKey(next);
  const topUp = Math.max(0, (await sellReserve()) - (await connection.getBalance(owner)));
  // Exactly USD_PER_DROP at the current market price, in base units.
  const amount = BigInt(Math.floor((USD_PER_DROP / price.token) * 10 ** decimals));
  const have = await tokenBalance(hub.publicKey, mint, programId);

  console.log(
    `Next: ${next}. $${USD_PER_DROP} = ${Number(amount) / 10 ** decimals} tokens ` +
      `+ ${topUp / LAMPORTS_PER_SOL} SOL for selling (token $${price.token}, SOL $${price.sol}). ` +
      `Hub holds ${Number(have) / 10 ** decimals} tokens.`,
  );

  let buySig = null;
  if (have < amount) {
    // Buy several drops' worth at once so most drops need no swap at all.
    const remaining = recipients.filter((r) => !state.drops[r]).length;
    const target = amount * BigInt(Math.min(BUY_AHEAD, remaining));
    const shortUsd = (Number(target - have) / 10 ** decimals) * price.token;
    const lamports = Math.ceil((shortUsd * (1 + BUY_BUFFER) / price.sol) * LAMPORTS_PER_SOL);
    console.log(`  buying ${lamports / LAMPORTS_PER_SOL} SOL of token`);
    if (DRY_RUN) return true;
    buySig = await buy(hub, lamports);
    console.log(`  bought  ${buySig}`);
    const after = await tokenBalance(hub.publicKey, mint, programId);
    if (after < amount) {
      throw new Error(`Hub holds ${after} after buying, needs ${amount}. Will retry next round.`);
    }
  }
  if (DRY_RUN) return true;

  const from = getAssociatedTokenAddressSync(mint, hub.publicKey, true, programId);
  const to = getAssociatedTokenAddressSync(mint, owner, true, programId);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(hub.publicKey, to, owner, mint, programId),
    createTransferCheckedInstruction(from, mint, to, hub.publicKey, amount, decimals, [], programId),
  );
  if (topUp > 0) {
    tx.add(SystemProgram.transfer({ fromPubkey: hub.publicKey, toPubkey: owner, lamports: topUp }));
  }
  const sig = await sendAndConfirmTransaction(connection, tx, [hub]);

  state.drops[next] = {
    amount: amount.toString(),
    usd: USD_PER_DROP,
    tokenPriceUsd: price.token,
    solTopUpLamports: topUp,
    buySignature: buySig,
    signature: sig,
    at: new Date().toISOString(),
  };
  saveState(state);
  const done = Object.keys(state.drops).length;
  console.log(`  sent    ${sig}  (${done}/${recipients.length})`);
  return done < recipients.length;
}

async function run() {
  console.log(`Dropping $${USD_PER_DROP} of ${MINT} every ${INTERVAL_MINUTES} min.`);
  for (;;) {
    try {
      if (!(await dropOnce())) return;
    } catch (err) {
      console.error(`Drop failed: ${err.message}`);
    }
    if (DRY_RUN) return;
    await new Promise((r) => setTimeout(r, INTERVAL_MINUTES * 60 * 1000));
  }
}

// Total SOL the hub needs for every remaining drop, checked against each
// recipient's actual wallet: existing token accounts and SOL balances lower it.
async function budget() {
  if (!MINT) throw new Error("Set MINT to the token contract address");
  const hub = loadHub();
  const mint = new PublicKey(MINT);
  const state = loadState();
  const left = loadRecipients().filter((r) => !state.drops[r]).map((r) => new PublicKey(r));
  const [{ ataRent, decimals, programId }, price, reserve, walletMin, wsolRent] = await Promise.all([
    mintInfo(mint),
    prices(),
    sellReserve(),
    connection.getMinimumBalanceForRentExemption(0),
    connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_LEN),
  ]);

  const wallets = await accountsExist(left);
  const atas = await accountsExist(
    left.map((o) => getAssociatedTokenAddressSync(mint, o, true, programId)),
  );
  const perDropToken = Math.ceil(((USD_PER_DROP * (1 + BUY_BUFFER)) / price.sol) * LAMPORTS_PER_SOL);
  const newAtas = atas.filter((a) => !a).length;
  const topUps = wallets.reduce((sum, w) => sum + Math.max(0, reserve - (w?.lamports ?? 0)), 0);
  const swaps = Math.ceil(left.length / BUY_AHEAD);

  const hubToken = await tokenBalance(hub.publicKey, mint, programId);
  const hubTokenLamports = Math.floor(
    ((Number(hubToken) / 10 ** decimals) * price.token / price.sol) * LAMPORTS_PER_SOL,
  );
  const hubAtaExists = (await connection.getAccountInfo(
    getAssociatedTokenAddressSync(mint, hub.publicKey, true, programId),
  )) !== null;

  const lines = [
    [`Token: ${left.length} x $${USD_PER_DROP} (+${BUY_BUFFER * 100}% buy buffer)`, perDropToken * left.length],
    [`Recipient token accounts: ${newAtas} new`, newAtas * ataRent],
    [`SOL to sell with: ${wallets.filter((w) => (w?.lamports ?? 0) < reserve).length} wallets topped up`, topUps],
    [`Transfer fees: ${left.length} drops`, left.length * TX_FEE],
    [`Swap fees: ${swaps} swaps`, swaps * (TX_FEE + MAX_PRIORITY_LAMPORTS)],
    [`Hub reserve (own minimum, token account, temporary wSOL)`, walletMin + (hubAtaExists ? 0 : ataRent) + wsolRent],
    [`Token the hub already holds`, -hubTokenLamports],
  ];
  const total = lines.reduce((s, [, l]) => s + l, 0);
  const hubSol = await connection.getBalance(hub.publicKey);
  const fmt = (l) => `${(l / LAMPORTS_PER_SOL).toFixed(6)} SOL  $${((l / LAMPORTS_PER_SOL) * price.sol).toFixed(2)}`;

  console.log(`Budget for ${left.length} remaining drops (SOL $${price.sol.toFixed(2)}):`);
  for (const [label, l] of lines) console.log(`  ${label.padEnd(58)} ${fmt(l)}`);
  console.log(`  ${"Total".padEnd(58)} ${fmt(total)}`);
  if (left.length) console.log(`  ${"Per drop".padEnd(58)} ${fmt(total / left.length)}`);
  console.log(`Hub ${hub.publicKey.toBase58()} holds ${fmt(hubSol)}.`);
  console.log(hubSol >= total ? "Enough for every drop." : `Send ${fmt(total - hubSol)} more.`);
}

function status() {
  const recipients = loadRecipients();
  const state = loadState();
  const done = recipients.filter((r) => state.drops[r]).length;
  console.log(`${done}/${recipients.length} recipients dropped for ${MINT}`);
}

const commands = { budget, run, once: dropOnce, status };
const cmd = process.argv[2];
if (!commands[cmd]) {
  console.log("Usage: MINT=<ca> node airdrop.js <budget|run|once|status> [--dry-run]");
  process.exit(1);
}
Promise.resolve(commands[cmd]()).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
