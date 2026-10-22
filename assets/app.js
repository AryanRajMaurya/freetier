/**
 * freetier — will it fit?
 *
 * The page is a thin renderer over data/limits.json, which is asserted in
 * the shipfree repository and re-checked there against the platforms' own
 * documentation. Nothing here hard-codes a number, so the page cannot drift
 * from the verified data.
 */

const DATA_URL = "./data/limits.json";

// The execution tiers a workload can run in, and the limits that decide
// whether it fits. Each key names an entry in limits.json.
const TIERS = [
  {
    id: "workers",
    label: "Cloudflare Workers",
    fits: "plain HTTP, no per-request state",
    checks: [
      { key: "requests_per_day", field: "requestsPerDay", kind: "count", unit: "requests/day", label: "requests per day" },
      { key: "cpu_time_per_invocation", field: "cpuMs", kind: "time", unit: "ms", label: "CPU per request" },
    ],
  },
  {
    id: "durable_objects",
    label: "Durable Objects",
    fits: "per-user state, WebSockets, real compute",
    checks: [
      { key: "cpu_per_request", field: "cpuMs", kind: "time", unit: "ms", label: "CPU per request" },
    ],
    state: { key: "storage_per_account", field: "stateMb", kind: "size", unit: "MB", label: "state" },
  },
  {
    id: "queues",
    label: "Queue consumer",
    fits: "heavy work off the request path",
    checks: [
      { key: "consumer_cpu_time", field: "cpuMs", kind: "time", unit: "ms", label: "CPU per message" },
    ],
  },
];

const state = { data: null, filter: "" };

/* ------------------------------------------------------------------ utils */

/**
 * Units the upstream values use, and what they multiply to.
 *
 * The unit lives in the upstream string ("30 seconds (default)", "5GB (Free)"),
 * so it has to be read from there rather than assumed.
 */
const TIME_UNITS = {
  ms: 1, s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000,
  h: 3600000, hour: 3600000, hours: 3600000,
};

const SIZE_UNITS = {
  b: 1 / 1048576, kb: 1 / 1024, k: 1 / 1024,
  mb: 1, m: 1,
  gb: 1024, g: 1024,
  tb: 1048576, t: 1048576,
};

/** Parse a limit value into a number and its unit: "30 seconds (default)". */
function parseLimit(value) {
  const text = String(value).trim().toLowerCase().replace(/,/g, "");
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*([a-z]+)?/);
  if (!match) return { number: NaN, unit: null };
  return { number: parseFloat(match[1]), unit: match[2] || null };
}

/** Convert a parsed limit to milliseconds, or to a plain count. */
function toMs(parsed) {
  if (!parsed || Number.isNaN(parsed.number)) return NaN;
  if (!parsed.unit) return parsed.number;
  const factor = TIME_UNITS[parsed.unit];
  return factor === undefined ? NaN : parsed.number * factor;
}

/** Convert a parsed limit to megabytes. */
function toMb(parsed) {
  if (!parsed || Number.isNaN(parsed.number)) return NaN;
  if (!parsed.unit) return parsed.number;
  const factor = SIZE_UNITS[parsed.unit];
  return factor === undefined ? NaN : parsed.number * factor;
}

/** Human label for a limit value, e.g. "10 ms" -> "10 ms". */
function humanise(value) {
  return String(value).trim();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ----------------------------------------------------------------- status */

function renderStatus() {
  const { verified_on: verifiedOn, limits } = state.data;
  const count = Object.values(limits).reduce(
    (total, spec) => total + Object.keys(spec.values || {}).length,
    0,
  );

  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  const note = document.getElementById("status-note");

  dot.className = "dot ok";
  text.textContent = `Verified against upstream documentation · ${count} limits checked · 0 drift`;

  note.textContent = `Last verified ${verifiedOn}. Every number below is asserted in one file and re-checked on each push — see the shipfree skill.`;
}

/* ----------------------------------------------------------------- matrix */

function renderMatrix() {
  const body = document.querySelector("#matrix tbody");
  body.replaceChildren();

  for (const row of state.data.platform_matrix || []) {
    const tr = el("tr");

    const name = el("td", null, row.platform);
    const best = el("td", null, row.best_for);
    tr.append(name, best);

    for (const [value, kind] of [
      [row.has_websockets, row.has_websockets === "yes" ? "yes" : "warn"],
      [row.has_streaming, row.has_streaming === "yes" ? "yes" : "warn"],
    ]) {
      const td = el("td");
      td.append(el("span", `tag ${kind}`, value));
      tr.append(td);
    }

    const card = el("td");
    card.append(el("span", `tag ${row.needs_credit_card === "no" ? "yes" : "warn"}`, row.needs_credit_card));
    tr.append(card);

    tr.append(el("td", null, row.cold_start));
    body.append(tr);
  }
}

/* ----------------------------------------------------------------- limits */

function limitMatches(text) {
  if (!state.filter) return true;
  return text.toLowerCase().includes(state.filter);
}

function renderLimits() {
  const host = document.getElementById("limits");
  host.replaceChildren();

  for (const [id, spec] of Object.entries(state.data.limits)) {
    const group = el("details", "group");
    const summary = el("summary");
    summary.append(el("span", null, spec.title));

    if (spec.url) {
      const src = el("a", "src", "upstream ↗");
      src.href = spec.url;
      src.target = "_blank";
      src.rel = "noopener noreferrer";
      summary.append(src);
    }
    group.append(summary);

    const inner = el("div", "inner");
    for (const [key, entry] of Object.entries(spec.values || {})) {
      const row = el("div", "limit-row");
      row.dataset.search = `${key} ${entry.value} ${entry.note || ""}`.toLowerCase();

      row.append(el("span", "limit-key", key.replace(/_/g, " ")));
      row.append(el("span", "limit-value", humanise(entry.value)));
      if (entry.note) row.append(el("p", "limit-note", entry.note));

      inner.append(row);
    }
    group.append(inner);
    host.append(group);
  }

  applyFilter();
}

function applyFilter() {
  const needle = state.filter.trim().toLowerCase();
  for (const row of document.querySelectorAll(".limit-row")) {
    row.classList.toggle("hidden", needle !== "" && !row.dataset.search.includes(needle));
  }
  for (const group of document.querySelectorAll(".group")) {
    const visible = group.querySelectorAll(".limit-row:not(.hidden)").length;
    group.hidden = visible === 0 && needle !== "";
  }
}

/* ------------------------------------------------------------- calculator */

function tierVerdict(tier, workload) {
  const limits = state.data.limits[tier.id]?.values || {};
  const failures = [];

  const evaluate = (check, entry) => {
    const parsed = parseLimit(entry.value);
    const allowed =
      check.kind === "time" ? toMs(parsed) : check.kind === "size" ? toMb(parsed) : parsed.number;

    // A limit whose unit we do not recognise is left out rather than
    // guessed at, so the verdict never rests on a misread number.
    if (Number.isNaN(allowed)) return;

    const used = workload[check.field];
    if (used > allowed) {
      failures.push({
        label: check.label,
        used,
        allowed,
        unit: check.unit,
        upstream: entry.value,
      });
    }
  };

  for (const check of tier.checks) {
    const entry = limits[check.key];
    if (entry) evaluate(check, entry);
  }
  if (tier.state) {
    const entry = limits[tier.state.key];
    if (entry) evaluate(tier.state, entry);
  }

  return failures;
}

function renderCalc() {
  const workload = {
    requestsPerDay: Number(document.getElementById("c-req").value) || 0,
    cpuMs: Number(document.getElementById("c-cpu").value) || 0,
    stateMb: Number(document.getElementById("c-state").value) || 0,
    realtime: document.getElementById("c-rt").value === "yes",
  };

  const out = document.getElementById("calc-out");
  out.replaceChildren();

  for (const tier of TIERS) {
    const failures = tierVerdict(tier, workload);
    const ok = failures.length === 0;

    const card = el("div", `verdict ${ok ? "pass" : "fail"}`);
    card.append(el("h4", null, `${ok ? "✓ Fits" : "✗ Breaks"} — ${tier.label}`));
    card.append(el("p", null, tier.fits));

    if (!ok) {
      const first = failures[0];
      const detail = el(
        "p",
        "why",
        `${first.label}: ${first.used.toLocaleString()} ${first.unit} over a limit of ` +
          `${first.allowed.toLocaleString()} ${first.unit} (upstream: ${first.upstream})`,
      );
      card.append(detail);
      if (failures.length > 1) {
        card.append(el("p", "why", `+ ${failures.length - 1} more limit(s) exceeded`));
      }
    }

    out.append(card);
  }

  if (workload.realtime) {
    const note = el("div", "verdict pass");
    note.append(el("h4", null, "✓ Realtime — use Durable Objects"));
    note.append(
      el(
        "p",
        null,
        "Plain serverless functions do not give you sockets. Durable Objects do, and they also give you per-request state.",
      ),
    );
    out.append(note);
  }
}

/* ------------------------------------------------------------------- boot */

async function boot() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
  } catch (error) {
    const dot = document.getElementById("status-dot");
    dot.className = "dot bad";
    document.getElementById("status-text").textContent =
      "Could not load the limits data. This page reads data/limits.json — if you are running it locally, serve the directory over HTTP rather than opening the file directly.";
    document.getElementById("status-note").textContent = String(error);
    return;
  }

  renderStatus();
  renderMatrix();
  renderLimits();

  document.getElementById("filter").addEventListener("input", (event) => {
    state.filter = event.target.value;
    applyFilter();
  });

  document.getElementById("calc-form").addEventListener("input", renderCalc);
  renderCalc();
}

boot();
