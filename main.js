/* Saviour site script. Edit CONFIG once the token is live. */
const CONFIG = {
  ticker: "SAVIOUR",
  ca: "",                 // contract address, paste after deploy on pump.fun
  links: {
    pump: "https://pump.fun",          // replace with https://pump.fun/coin/<CA>
    dex: "https://dexscreener.com/solana",
    x: "https://x.com",
    telegram: "https://t.me",
  },
  lockMinutes: 30,
};

/* ---------- Ticker normalisation (mirrors docs/TECH_SPEC.md §3) ---------- */
const HOMOGLYPHS = {
  "0": "O", "1": "I", "|": "I", "!": "I", "3": "E", "4": "A", "@": "A",
  "5": "S", "7": "T", "8": "B", "$": "S",
  // Cyrillic & Greek look-alikes (uppercase after toUpperCase)
  "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
  "Р": "P", "С": "C", "Т": "T", "Х": "X", "У": "Y", "І": "I",
  "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K",
  "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
};

function normalise(raw) {
  let s = raw.normalize("NFKC").trim().toUpperCase();
  s = s.replace(/^\$+/, "");                      // leading $ is cosmetic
  s = [...s].map((c) => HOMOGLYPHS[c] ?? c).join("");
  return s.replace(/[^A-Z0-9]/g, "");
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/* ---------- Wiring CONFIG into the page ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

$$("[data-ticker]").forEach((el) => (el.textContent = `$${CONFIG.ticker}`));
$$("[data-link]").forEach((el) => {
  const url = CONFIG.links[el.dataset.link];
  if (url) el.href = url;
});
const short = CONFIG.ca ? `${CONFIG.ca.slice(0, 4)}…${CONFIG.ca.slice(-4)}` : "Soon";
$$("[data-ca-short]").forEach((el) => (el.textContent = short));
$$("[data-ca-full]").forEach((el) => (el.textContent = CONFIG.ca || "Announced at launch"));

const toastEl = $("[data-toast]");
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-on"), 1800);
}

$$("[data-copy-ca]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    if (!CONFIG.ca) return toast("Contract address drops at launch");
    try {
      await navigator.clipboard.writeText(CONFIG.ca);
      toast("Contract address copied");
    } catch {
      toast(CONFIG.ca);
    }
  })
);

/* ---------- Hero clock: a lock counting down, looping ---------- */
const clock = $("[data-clock]");
const fmt = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
let clockEnd = Date.now() + CONFIG.lockMinutes * 60e3;

/* ---------- Ticker Lock demo ---------- */
const registry = new Map(); // normalised ticker -> { display, until, isNew }
const now = Date.now();
[
  [CONFIG.ticker, 29.2], ["AGENT", 17.5], ["MOON", 8.1], ["CATWIFHAT", 23.9], ["GROKAI", 4.4], ["PEPE2", 12.7],
].forEach(([t, m]) => registry.set(normalise(t), { display: t, until: now + m * 60e3 }));

const list = $("[data-lock-list]");
const out = $("[data-lock-out]");
const form = $("[data-lock-form]");

function renderList() {
  const t = Date.now();
  for (const [k, v] of registry) if (v.until <= t) registry.delete(k);
  list.innerHTML = [...registry.values()]
    .sort((a, b) => b.until - a.until)
    .map((v) => `<li class="${v.isNew ? "is-new" : ""}"><span class="t">$${v.display}</span><span class="c">${fmt(v.until - t)}</span></li>`)
    .join("");
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function line(cls, text) {
  return `<p class="${cls}">› ${text}</p>`;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = form.ticker.value;
  const n = normalise(raw);
  const lines = [];

  if (!n) {
    out.innerHTML = line("bad", "Ticker must contain letters or numbers.");
    return;
  }
  if (n.length > 10) {
    out.innerHTML = line("bad", `Rejected: "${esc(n)}" is longer than 10 characters.`);
    return;
  }

  lines.push(line("dim", `input      "${esc(raw.trim())}"`));
  lines.push(line("dim", `normalised ${esc(n)}`));

  const hit = registry.get(n);
  if (hit) {
    lines.push(line("bad", `LOCKED: $${esc(hit.display)} was deployed recently. Unlocks in ${fmt(hit.until - Date.now())}.`));
    lines.push(line("dim", "No fee charged. Transaction rejected by the registry."));
  } else {
    const near = n.length >= 5
      ? [...registry.entries()].find(([k]) => editDistance(k, n) === 1)
      : null;
    registry.set(n, { display: n, until: Date.now() + CONFIG.lockMinutes * 60e3, isNew: true });
    lines.push(line("ok", `DEPLOYED: $${esc(n)} is now locked for ${CONFIG.lockMinutes}:00.`));
    lines.push(line("ok", `0.5 SOL routed to buy & burn $${esc(CONFIG.ticker)}.`));
    if (near) lines.push(line("bad", `Similarity flag: one character off $${esc(near[1].display)}. Shown on the coin page.`));
  }
  out.innerHTML = lines.join("");
  renderList();
});

/* ---------- Tick ---------- */
function tick() {
  const left = clockEnd - Date.now();
  if (left <= 0) clockEnd = Date.now() + CONFIG.lockMinutes * 60e3;
  if (clock) clock.textContent = fmt(clockEnd - Date.now());
  renderList();
}
tick();
setInterval(tick, 1000);

/* ---------- Reveal on scroll ---------- */
if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const targets = $$(".section__head, .problem, .feature, .flow__node, .terminal, .token > *, .phase, .faq__list, .metrics");
  targets.forEach((el) => el.classList.add("reveal"));
  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
    }),
    { rootMargin: "0px 0px -8% 0px" }
  );
  targets.forEach((el) => io.observe(el));
}
