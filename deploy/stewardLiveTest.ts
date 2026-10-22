/**
 * Live checks for the steward-review fixes, against a deployed Sacramentum.
 *
 * The time-based outcomes (a neutral split after the grace, upholding an
 * undetermined appeal) need a clock jump, which Studionet does not allow, so
 * those are proven in direct mode. What this script proves on-chain is that the
 * new guards are wired: a late delivery is rejected, the recovery window is
 * exposed only while a dispute/appeal is live, and `claim_timeout` refuses to
 * fire before it opens.
 *
 * Usage:
 *   node deploy/stewardLiveTest.ts --address 0x...
 *   node deploy/stewardLiveTest.ts --address 0x... --deadline-seconds 90
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const require = createRequire(import.meta.url);
const { createRawClient, makeDriver, readKeyFromEnv, sleep, fmt } = require(
  path.join(ROOT, "scripts", "studionet.cjs"),
);

const args = parseArgs(process.argv.slice(2));
const address = args.address || process.env.SACRAMENTUM_ADDRESS || "";
const deadlineSeconds = Number(args["deadline-seconds"] || 120);
const ESCROW = 10n ** 16n; // 0.01 GEN

if (!address) {
  console.error("usage: node deploy/stewardLiveTest.ts --address 0x...");
  process.exit(1);
}

const WALLET_DIR = process.env.SACRAMENTUM_WALLET_DIR ?? "D:\\Genlayer-project\\wallet";
const buyerKey =
  process.env.DEPLOYER_PRIVATE_KEY ||
  readKeyFromEnv([process.env.SACRAMENTUM_KEY_FILE, path.join(WALLET_DIR, ".env")], [
    "GENLAYER_DEV_KEY",
    "DEPLOYER_PRIVATE_KEY",
  ]);
const sellerKey =
  process.env.SACRAMENTUM_SELLER_KEY ||
  readKeyFromEnv([process.env.SACRAMENTUM_SELLER_KEY_FILE, path.join(WALLET_DIR, "seller.env")], [
    "SACRAMENTUM_SELLER_KEY",
    "GENLAYER_DEV_KEY",
    "DEPLOYER_PRIVATE_KEY",
  ]);

const buyer = createRawClient(buyerKey);
const seller = createRawClient(sellerKey);
// Share one pacing clock across both signers so the pair stays under the
// Studionet request budget instead of each spending it separately.
const shared = { lastCall: 0 };
const buyerDriver = makeDriver(buyer, shared);
const sellerDriver = makeDriver(seller, shared);
const read = (method, callArgs = []) => buyerDriver.readFrom(address, method, callArgs);
const view = async (id) => JSON.parse(String(await read("get_deal", [id])));
const audit = async (id) => JSON.parse(String(await read("get_deal_audit", [id])));
const verdict = async (id) => JSON.parse(String(await read("get_verdict", [id])));
const stats = async () => JSON.parse(String(await read("get_stats")));

let passed = 0;
let failed = 0;
const hashes: Record<string, string> = {};

function check(label, ok, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
}

function section(text) {
  console.log(`\n[${text}]`);
}

function note(hash) {
  if (!hash) return "";
  return hash;
}

function termsJson() {
  return JSON.stringify({
    deliverable: "A public web page reachable over HTTPS that states a version number.",
    criteria: [
      { id: "c1", text: "The page is reachable over HTTPS." },
      { id: "c2", text: "The page states a version number." },
    ],
  });
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = "1";
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

async function main() {
  console.log(`contract   ${address}`);
  console.log(`buyer      ${buyer.account.address}`);
  console.log(`seller     ${seller.account.address}`);
  console.log(`deadline   open + ${deadlineSeconds}s`);

  section("0. the deployment is the fixed build");
  const base = Number(await read("get_deal_count"));
  const opening = await stats();
  check("contract answers get_deal_count", Number.isInteger(base), String(base));
  check("opening ledger is conserved", opening.conserved === true);

  section("1. deadline is enforced in submit_delivery (blocking #1)");
  const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;
  const opened = await buyerDriver.writeTo(address, "open_deal", [
    seller.account.address,
    "Steward live check - late delivery",
    termsJson(),
    deadline,
    ["https://example.com"],
  ]);
  hashes.open = note(opened.hash);
  check("open_deal succeeds", opened.ok, opened.ok ? opened.hash : opened.reason);
  const lateId = "d" + (base + 1);

  const beforeFund = await view(lateId);
  check("new deal is OPEN", beforeFund.status === "OPEN", beforeFund.status);
  check("recovery_at_unix is 0 before any dispute", beforeFund.recovery_at_unix === 0, String(beforeFund.recovery_at_unix));

  const funded = await buyerDriver.writeTo(address, "fund_deal", [lateId], ESCROW);
  hashes.fund = note(funded.hash);
  check("fund_deal locks 0.01 GEN", funded.ok, funded.ok ? funded.hash : funded.reason);

  const accepted = await sellerDriver.writeTo(address, "accept_deal", [lateId]);
  hashes.accept = note(accepted.hash);
  check("seller accepts", accepted.ok, accepted.ok ? accepted.hash : accepted.reason);

  const waitMs = Math.max(0, deadline * 1000 - Date.now()) + 5000;
  console.log(`   waiting ${Math.ceil(waitMs / 1000)}s for the deadline to pass...`);
  await sleep(waitMs);

  const late = await sellerDriver.writeTo(address, "submit_delivery", [
    lateId,
    "https://example.com",
    "this delivery is intentionally late",
  ]);
  hashes.late_delivery_attempt = note(late.hash);
  check("late submit_delivery is rejected", late.ok === false, late.ok ? "unexpectedly accepted" : late.reason);
  check(
    "rejection names the deadline",
    late.ok === false && /deadline/i.test(late.reason),
    late.ok ? "" : late.reason,
  );
  const afterLate = await view(lateId);
  check("deal stays ACCEPTED after the rejected delivery", afterLate.status === "ACCEPTED", afterLate.status);

  const refunded = await buyerDriver.writeTo(address, "claim_timeout", [lateId]);
  hashes.refund = note(refunded.hash);
  check("buyer can still claim the refund", refunded.ok, refunded.ok ? refunded.hash : refunded.reason);
  const afterRefund = await view(lateId);
  check("deal is REFUNDED", afterRefund.status === "REFUNDED", afterRefund.status);
  check("recovery_at_unix is 0 on a settled deal", afterRefund.recovery_at_unix === 0, String(afterRefund.recovery_at_unix));

  section("2. an inconclusive dispute is bounded, not frozen (blocking #2)");
  const opened2 = await buyerDriver.writeTo(address, "open_deal", [
    seller.account.address,
    "Steward live check - recovery window",
    termsJson(),
    Math.floor(Date.now() / 1000) + 3600,
    ["https://example.com"],
  ]);
  hashes.open_2 = note(opened2.hash);
  check("second open_deal succeeds", opened2.ok, opened2.ok ? opened2.hash : opened2.reason);
  const holdId = "d" + (base + 2);

  await buyerDriver.writeTo(address, "fund_deal", [holdId], ESCROW);
  await sellerDriver.writeTo(address, "accept_deal", [holdId]);
  const delivered = await sellerDriver.writeTo(address, "submit_delivery", [
    holdId,
    "https://example.com",
    "delivered on time",
  ]);
  hashes.deliver = note(delivered.hash);
  check("on-time delivery is accepted", delivered.ok, delivered.ok ? delivered.hash : delivered.reason);

  const deliveredView = await view(holdId);
  check("deal is DELIVERED", deliveredView.status === "DELIVERED", deliveredView.status);
  check("no recovery window before a dispute", deliveredView.recovery_at_unix === 0, String(deliveredView.recovery_at_unix));

  const disputed = await buyerDriver.writeTo(address, "raise_dispute", [holdId, "the page states no version"]);
  hashes.dispute = note(disputed.hash);
  check("raise_dispute succeeds", disputed.ok, disputed.ok ? disputed.hash : disputed.reason);

  const disputedView = await view(holdId);
  const now = Math.floor(Date.now() / 1000);
  check("deal is DISPUTED", disputedView.status === "DISPUTED", disputedView.status);
  check(
    "recovery window is exposed while the dispute is live",
    disputedView.recovery_at_unix > now,
    new Date(disputedView.recovery_at_unix * 1000).toISOString(),
  );
  check(
    "the window is the evidence window + grace",
    disputedView.recovery_at_unix - now >= 1800 + 3600 - 120,
    `${disputedView.recovery_at_unix - now}s away`,
  );
  check("no UNDETERMINED round has run yet", disputedView.unresolved_at_unix === 0);

  const filed = await buyerDriver.writeTo(address, "submit_evidence", [
    holdId,
    "https://example.com/evidence",
    "the page has no version string",
  ]);
  hashes.evidence = note(filed.hash);
  check("evidence can be filed after funding", filed.ok, filed.ok ? filed.hash : filed.reason);
  const audited = await audit(holdId);
  check("filed evidence is visible in the audit view", audited.evidence.length === 1, String(audited.evidence.length));
  check(
    "audit exposes the new timing fields",
    typeof audited.deadline_unix === "number" &&
      typeof audited.delivered_at_unix === "number" &&
      audited.unresolved_at_unix === 0 &&
      audited.appeal_filed_at_unix === 0,
  );

  const early = await buyerDriver.writeTo(address, "claim_timeout", [holdId]);
  hashes.early_recovery_attempt = note(early.hash);
  check("claim_timeout refuses before the window opens", early.ok === false, early.ok ? "unexpectedly paid" : early.reason);
  check(
    "refusal says the dispute is not yet recoverable",
    early.ok === false && /not yet recoverable/i.test(early.reason),
    early.ok ? "" : early.reason,
  );

  section("3. validator agreement rule is published (recommended #3)");
  const report = await verdict(holdId);
  check(
    "release tolerance is 250 bps, below the 500 bps bucket",
    report.equivalence.release_bps.tolerance_bps === 250 && report.equivalence.release_bps.bucket_width_bps === 500,
    `tolerance=${report.equivalence.release_bps.tolerance_bps} bucket=${report.equivalence.release_bps.bucket_width_bps}`,
  );
  check("verdict view returns zero rounds before adjudication", report.rounds.length === 0);

  section("4. the ledger is still conserved");
  const closing = await stats();
  check("conserved after refund and dispute", closing.conserved === true);
  check(
    "held value still covers the disputed escrow",
    BigInt(closing.held_atto) >= ESCROW,
    fmt(closing.held_atto),
  );

  console.log("\ntransactions");
  for (const [label, hash] of Object.entries(hashes)) {
    if (hash) console.log(`  ${label.padEnd(24)} ${hash}`);
  }
  console.log(`\nrecovery for ${holdId} opens ${new Date(disputedView.recovery_at_unix * 1000).toISOString()}`);
  console.log("the neutral split / upheld appeal themselves are proven in direct mode (clock jump).");
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
