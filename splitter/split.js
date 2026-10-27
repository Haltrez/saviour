#!/usr/bin/env node
// Saviour splitter: send SOL to the hub wallet, and it gets split into
// fresh wallets that each hold USD_PER_WALLET worth of SOL (default $1.20).
//
//   node split.js init               create the hub wallet and print its address
//   node split.js split [--dry-run]  split whatever the hub holds right now
//   node split.js watch [--dry-run]  poll the hub and split every new deposit
//
// Env:
//   RPC_URL         default https://api.mainnet-beta.solana.com
//   USD_PER_WALLET  default 1.2
//   SOL_PRICE_USD   fixed price override (skips the price API)
//   POLL_SECONDS    default 15 (watch mode)

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const HUB_PATH = path.join(DIR, "hub-keypair.json");
const WALLETS_DIR = path.join(DIR, "wallets");

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const USD_PER_WALLET = Number(process.env.USD_PER_WALLET || 1.2);
const POLL_SECONDS = Number(process.env.POLL_SECONDS || 15);
const DRY_RUN = process.argv.includes("--dry-run");

// A transfer to a brand-new account costs ~48 bytes of a 1232-byte
// transaction, so 20 per transaction stays safely under the limit.
const TRANSFERS_PER_TX = 20;
const FEE_PER_TX = 5000; // lamports, one signature

const connection = new Connection(RPC_URL, "confirmed");

function loadHub() {
  if (!fs.existsSync(HUB_PATH)) {
    throw new Error(`No hub wallet at ${HUB_PATH}. Run: node split.js init`);
  }
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(HUB_PATH, "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function solPriceUsd() {
  if (process.env.SOL_PRICE_USD) return Number(process.env.SOL_PRICE_USD);
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
  );
  if (!res.ok) throw new Error(`Price API returned ${res.status}`);
  const price = (await res.json())?.solana?.usd;
  if (!(price > 0)) throw new Error("Price API returned no SOL price");
  return price;
}

// Work out how many wallets the hub balance can fund, keeping enough back
// for transaction fees and for the hub itself to stay rent-exempt.
async function plan(balance) {
  const price = await solPriceUsd();
  const perWallet = Math.floor((USD_PER_WALLET / price) * LAMPORTS_PER_SOL);
  const rentMin = await connection.getMinimumBalanceForRentExemption(0);

  if (perWallet < rentMin) {
    throw new Error(
      `$${USD_PER_WALLET} is ${perWallet} lamports, below the rent-exempt minimum of ${rentMin}`,
    );
  }

  // Each wallet costs perWallet plus its share of one tx fee per batch.
  let count = Math.floor((balance - rentMin) / perWallet);
  while (count > 0) {
    const fees = Math.ceil(count / TRANSFERS_PER_TX) * FEE_PER_TX;
    if (count * perWallet + fees + rentMin <= balance) break;
    count--;
  }
  return { price, perWallet, count: Math.max(count, 0) };
}

function saveWallets(file, wallets, meta) {
  fs.mkdirSync(WALLETS_DIR, { recursive: true });
  const out = {
    ...meta,
    wallets: wallets.map((w) => ({
      address: w.keypair.publicKey.toBase58(),
      secretKey: bs58.encode(w.keypair.secretKey),
      status: w.status,
      signature: w.signature ?? null,
    })),
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2), { mode: 0o600 });
}

async function split() {
  const hub = loadHub();
  const balance = await connection.getBalance(hub.publicKey);
  const { price, perWallet, count } = await plan(balance);

  console.log(
    `Hub ${hub.publicKey.toBase58()} holds ${balance / LAMPORTS_PER_SOL} SOL ` +
      `(SOL = $${price}). $${USD_PER_WALLET} = ${perWallet / LAMPORTS_PER_SOL} SOL per wallet.`,
  );
  if (count === 0) {
    console.log(`Not enough for one $${USD_PER_WALLET} wallet yet.`);
    return 0;
  }

  const wallets = Array.from({ length: count }, () => ({
    keypair: Keypair.generate(),
    status: "pending",
  }));
  const meta = {
    hub: hub.publicKey.toBase58(),
    createdAt: new Date().toISOString(),
    solPriceUsd: price,
    usdPerWallet: USD_PER_WALLET,
    lamportsPerWallet: perWallet,
    dryRun: DRY_RUN,
  };

  // Write keys to disk before any SOL moves, so a crash mid-send can't
  // leave funded wallets whose keys were never saved.
  const file = path.join(WALLETS_DIR, `split-${Date.now()}.json`);
  saveWallets(file, wallets, meta);
  console.log(`${DRY_RUN ? "[dry run] " : ""}Splitting into ${count} wallets. Keys: ${file}`);
  if (DRY_RUN) return count;

  for (let i = 0; i < wallets.length; i += TRANSFERS_PER_TX) {
    const batch = wallets.slice(i, i + TRANSFERS_PER_TX);
    const tx = new Transaction();
    for (const w of batch) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: hub.publicKey,
          toPubkey: w.keypair.publicKey,
          lamports: perWallet,
        }),
      );
    }
    try {
      const sig = await sendAndConfirmTransaction(connection, tx, [hub]);
      batch.forEach((w) => Object.assign(w, { status: "funded", signature: sig }));
      console.log(`  funded ${i + batch.length}/${count}  ${sig}`);
    } catch (err) {
      batch.forEach((w) => (w.status = "failed"));
      console.error(`  batch ${i / TRANSFERS_PER_TX + 1} failed: ${err.message}`);
    }
    saveWallets(file, wallets, meta);
  }

  const funded = wallets.filter((w) => w.status === "funded").length;
  console.log(`Done: ${funded}/${count} wallets funded. Keys: ${file}`);
  return funded;
}

async function watch() {
  const hub = loadHub();
  console.log(`Watching ${hub.publicKey.toBase58()} every ${POLL_SECONDS}s. Send SOL here.`);
  for (;;) {
    try {
      await split();
    } catch (err) {
      console.error(`Split failed: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000));
  }
}

function init() {
  if (fs.existsSync(HUB_PATH)) {
    console.log(`Hub already exists: ${loadHub().publicKey.toBase58()}`);
    return;
  }
  const hub = Keypair.generate();
  fs.writeFileSync(HUB_PATH, JSON.stringify(Array.from(hub.secretKey)), { mode: 0o600 });
  console.log(`Hub wallet created: ${hub.publicKey.toBase58()}`);
  console.log(`Secret key saved to ${HUB_PATH}. Back it up and never commit it.`);
}

const commands = { init, split, watch };
const cmd = process.argv[2];
if (!commands[cmd]) {
  console.log("Usage: node split.js <init|split|watch> [--dry-run]");
  process.exit(1);
}
Promise.resolve(commands[cmd]()).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
