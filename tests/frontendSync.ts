/**
 * Frontend ↔ contract sync check — the "is the frontend safe?" guard.
 *
 * The frontend is a thin skin over contracts/sacramentum.py. If a method is
 * renamed, an argument is added, or a protocol constant drifts, the UI would
 * call into the void and only fail at runtime, on-chain. This test parses the
 * contract source, imports the frontend's contract surface, and refuses to pass
 * unless every method, argument count, constant, status, and outcome lines up.
 *
 * No network. No keys. Runs anywhere:
 *   node tests/frontendSync.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CONTRACT = path.join(ROOT, "contracts", "sacramentum.py");
const SACRAMENTUM = path.join(ROOT, "frontend", "src", "lib", "sacramentum.ts");

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
}
const section = (text) => console.log(`\n[${text}]`);

// ---------------------------------------------------------- contract parsing

function splitParams(raw) {
  const out = [];
  let depth = 0;
  let current = "";
  let quote = null;
  for (const ch of raw) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "[" || ch === "(" || ch === "{") depth += 1;
    if (ch === "]" || ch === ")" || ch === "}") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

function paramName(param) {
  return param.split(":")[0].split("=")[0].trim();
}

function parseContract(source) {
  const lines = source.split(/\r?\n/);
  const methods = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    const deco = lines[i].trim();
    if (!deco.startsWith("@gl.public.")) continue;
    const kind = deco.includes(".view") ? "view" : "write";
    const payable = deco.includes("payable");
    let j = i + 1;
    while (j < lines.length && !lines[j].trim().startsWith("def ")) j += 1;
    const match = (lines[j] ?? "")
      .trim()
      .match(/^def\s+([a-zA-Z_]\w*)\s*\((.*?)\)\s*(?:->\s*[^:]+)?:/);
    if (!match) continue;
    const name = match[1];
    // The runtime's own hook (__on_errored_message__) is public to the VM but
    // no caller can invoke it; it is not part of the user-facing surface.
    if (name.startsWith("_")) continue;
    const params = splitParams(match[2]).slice(1).map(paramName); // drop self
    methods.set(name, { kind, payable, params });
  }

  const constants = new Map();
  for (const line of lines) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(\d+|\d+\s*\*\*\s*\d+)\s*$/);
    if (!match) continue;
    const expr = match[2];
    const pow = expr.match(/^(\d+)\s*\*\*\s*(\d+)$/);
    constants.set(match[1], pow ? BigInt(pow[1]) ** BigInt(pow[2]) : BigInt(expr));
  }

  const statuses = new Set();
  const outcomes = new Set();
  for (const line of lines) {
    const status = line.match(/^STATUS_[A-Z_]+\s*=\s*"([A-Z_]+)"\s*$/);
    if (status) statuses.add(status[1]);
    const outcome = line.match(/^OUTCOME_[A-Z_]+\s*=\s*"([A-Z_]+)"\s*$/);
    if (outcome) outcomes.add(outcome[1]);
  }

  return { methods, constants, statuses, outcomes };
}

// ------------------------------------------------------- the frontend surface

const WRITE_CALLS = [
  { method: "open_deal", fn: "openDeal", args: 5, value: false },
  { method: "fund_deal", fn: "fundDeal", args: 1, value: true },
  { method: "accept_deal", fn: "acceptDeal", args: 1, value: false },
  { method: "cancel_deal", fn: "cancelDeal", args: 1, value: false },
  { method: "submit_delivery", fn: "submitDelivery", args: 3, value: false },
  { method: "confirm_delivery", fn: "confirmDelivery", args: 1, value: false },
  { method: "raise_dispute", fn: "raiseDispute", args: 2, value: false },
  { method: "submit_evidence", fn: "submitEvidence", args: 3, value: false },
  { method: "resolve", fn: "resolve", args: 1, value: false },
  { method: "appeal", fn: "appeal", args: 1, value: true },
  { method: "resolve_appeal", fn: "resolveAppeal", args: 1, value: false },
  { method: "finalize", fn: "finalize", args: 1, value: false },
  { method: "claim_timeout", fn: "claimTimeout", args: 1, value: false },
];

const VIEW_CALLS = [
  { method: "get_deal", fn: "getDeal", args: 1 },
  { method: "get_terms", fn: "getTerms", args: 1 },
  { method: "get_deal_audit", fn: "getAudit", args: 1 },
  { method: "get_verdict", fn: "getVerdict", args: 1 },
  { method: "get_deal_ids", fn: "getDealIds", args: 0 },
  { method: "get_stats", fn: "getStats", args: 0 },
  { method: "get_log", fn: "getLog", args: 2 },
];

/** Public methods the frontend deliberately never calls, with the reason. */
const UNUSED = new Map([
  ["get_deal_count", "the UI lists ids and reads stats instead of a bare count"],
]);

/** Contract constant -> frontend PROTOCOL key. */
const CONSTANT_MAP = {
  MIN_ESCROW_ATTO: "minEscrowAtto",
  MAX_TITLE: "maxTitle",
  STATEMENT_CLIP: "statementClip",
  DISPUTE_WINDOW_SEC: "disputeWindowSec",
  EVIDENCE_WINDOW_SEC: "evidenceWindowSec",
  APPEAL_WINDOW_SEC: "appealWindowSec",
  APPEAL_BOND_BPS: "appealBondBps",
  MIN_APPEAL_BOND_ATTO: "minAppealBondAtto",
  RELEASE_BUCKET_BPS: "releaseBucketBps",
  RELEASE_TOLERANCE_BPS: "releaseToleranceBps",
  UNRESOLVED_GRACE_SEC: "unresolvedGraceSec",
  MAX_EVIDENCE_PER_PARTY: "maxEvidencePerParty",
  MAX_SOURCES: "maxSources",
  MAX_CRITERIA: "maxCriteria",
};

async function main() {
  const contract = parseContract(fs.readFileSync(CONTRACT, "utf-8"));
  const src = fs.readFileSync(SACRAMENTUM, "utf-8");
  const frontend = await import(pathToFileURL(SACRAMENTUM).href);

  console.log("Sacramentum frontend ↔ contract sync");
  console.log(`  contract:  ${path.relative(ROOT, CONTRACT)}`);
  console.log(`  frontend:  ${path.relative(ROOT, SACRAMENTUM)}`);

  // 1. Method coverage: everything the frontend calls must be public on-chain.
  section("1. write methods the frontend calls");
  for (const call of WRITE_CALLS) {
    const on = contract.methods.get(call.method);
    check(
      `${call.method} → ${call.fn}()`,
      !!on &&
        on.kind === "write" &&
        on.params.length === call.args &&
        typeof frontend[call.fn] === "function" &&
        src.includes(`"${call.method}"`),
      on ? `${on.params.length} contract args` : "missing from contract",
    );
  }

  section("2. view methods the frontend reads");
  for (const call of VIEW_CALLS) {
    const on = contract.methods.get(call.method);
    check(
      `${call.method} → ${call.fn}()`,
      !!on &&
        on.kind === "view" &&
        on.params.length === call.args &&
        typeof frontend[call.fn] === "function" &&
        src.includes(`"${call.method}"`),
      on ? `${on.params.length} contract args` : "missing from contract",
    );
  }

  section("3. no public method is silently dropped");
  for (const [name, on] of contract.methods) {
    const used = WRITE_CALLS.some((c) => c.method === name) || VIEW_CALLS.some((c) => c.method === name);
    if (used) continue;
    check(`${name} accounted for`, UNUSED.has(name), on.kind);
  }

  // 4. Payable methods must be the ones the UI funds.
  section("4. payable surface");
  for (const [name, on] of contract.methods) {
    if (!on.payable) continue;
    const call = WRITE_CALLS.find((c) => c.method === name);
    check(`${name} is payable and funded by the UI`, !!call && call.value === true);
  }

  // 5. Protocol constants must not drift.
  section("5. protocol constants");
  for (const [constant, key] of Object.entries(CONSTANT_MAP)) {
    const expected = contract.constants.get(constant);
    const actual = frontend.PROTOCOL[key];
    check(
      `${constant} == PROTOCOL.${key}`,
      expected !== undefined && actual !== undefined && BigInt(actual) === expected,
      expected !== undefined ? `${expected}` : "missing",
    );
  }

  // 6. Statuses and outcomes.
  section("6. statuses & outcomes");
  const feStatuses = new Set(Object.values(frontend.STATUS));
  check(
    "frontend STATUS set matches the contract",
    contract.statuses.size === feStatuses.size && [...contract.statuses].every((s) => feStatuses.has(s)),
    `${contract.statuses.size} statuses`,
  );
  const feOutcomes = new Set(Object.keys(frontend.OUTCOME_LABEL));
  check(
    "frontend OUTCOME_LABEL set matches the contract",
    contract.outcomes.size === feOutcomes.size && [...contract.outcomes].every((o) => feOutcomes.has(o)),
    `${contract.outcomes.size} outcomes`,
  );

  // 7. Address sanity + consensus-wait sanity.
  section("7. runtime guards");
  check(
    "ADDRESS is a well-formed 0x address",
    /^0x[0-9a-fA-F]{40}$/.test(frontend.ADDRESS),
    frontend.ADDRESS,
  );
  const waitMs = frontend.CONSENSUS_WAIT.intervalMs * frontend.CONSENSUS_WAIT.retries;
  check(
    "consensus wait is longer than 2 minutes",
    waitMs >= 120000,
    `~${Math.round(waitMs / 60000)} min`,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
