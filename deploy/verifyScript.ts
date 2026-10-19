/**
 * Full on-chain verification of Sacramentum on Studionet.
 *
 * Every write method and every view is exercised against the real network, and
 * every path that moves money is checked by measuring the buyer's and the
 * seller's native balance before and after, so a payout is only "verified" if
 * the funds actually moved by the exact expected amount.
 *
 * The contract moves value only via emit_transfer on these paths:
 *   confirm_delivery -> escrow to seller
 *   cancel_deal      -> escrow refunded to buyer
 *   claim_timeout    -> escrow refunded to buyer (or released to seller)
 *   finalize         -> escrow split per the verdict, appeal bond to the winner
 * __on_errored_message__ rejoins a bounced payout; the runtime calls it and no
 * caller can, so it is documented here rather than driven.
 *
 * Usage: node deploy/verifyScript.ts
 * Keys: buyer from DEPLOYER_PRIVATE_KEY / the wallet; seller from
 *       SACRAMENTUM_SELLER_KEY / the wallet's recipient.json.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const WALLET_DIR = process.env.SACRAMENTUM_WALLET_DIR ?? "D:\\Genlayer-project\\wallet";
const WALLET_ENV = path.join(WALLET_DIR, ".env");
const WALLET_SELLER_ENV = path.join(WALLET_DIR, process.env.SACRAMENTUM_SELLER_NAME ? `${process.env.SACRAMENTUM_SELLER_NAME}.env` : "seller.env");
const WALLET_RECIPIENT = path.join(WALLET_DIR, "recipient.json");
const KEY_TMP = path.join(ROOT, "scripts", ".deployer.tmp");

const ONE = 10n ** 18n;
const GEN = (n) => BigInt(n) * ONE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (atto) => `${(Number(atto) / 1e18).toFixed(6)} GEN`;

const TERMS = JSON.stringify({
  deliverable: "A public web page served over HTTPS that contains readable text.",
  criteria: [
    { id: "C1", text: "The deliverable URL is reachable over HTTPS." },
    { id: "C2", text: "The page contains readable text." },
  ],
});
const URL = "https://example.com";

const {
  makeDriver,
  createRawClient,
  readKeyFromEnv,
  readKeyFromJson,
} = createRequire(import.meta.url)(path.join(ROOT, "scripts", "studionet.cjs"));

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
}
const step = (n, text) => console.log(`\n[${n}] ${text}`);

function loadKeys() {
  const buyerKey =
    process.env.DEPLOYER_PRIVATE_KEY ||
    readKeyFromEnv([process.env.SACRAMENTUM_KEY_FILE, WALLET_ENV, KEY_TMP], [
      "GENLAYER_DEV_KEY",
      "DEPLOYER_PRIVATE_KEY",
    ]);
  const sellerKey =
    process.env.SACRAMENTUM_SELLER_KEY ||
    readKeyFromEnv([process.env.SACRAMENTUM_SELLER_KEY_FILE, WALLET_SELLER_ENV], ["SACRAMENTUM_SELLER_KEY"]) ||
    readKeyFromJson(WALLET_RECIPIENT, "privateKey");
  if (!buyerKey) throw new Error("no buyer key");
  if (!sellerKey) throw new Error("no seller key");
  return { buyerKey, sellerKey };
}

async function balance(driver) {
  return BigInt(await driver.balance());
}

/** Poll a balance until it equals `expected`, then assert on the delta. */
async function expectBalance(label, driver, expected, base, timeoutMs = 120000) {
  const start = Date.now();
  let now = BigInt(await driver.balance());
  while (now !== expected && Date.now() - start < timeoutMs) {
    await sleep(3000);
    now = BigInt(await driver.balance());
  }
  check(label, now === expected, `delta=${fmt(now - base)} expected=${fmt(expected - base)}`);
  return now;
}

/** Run an operation and assert it moved `delta` into/out of the driver's account. */
async function moveTo(label, driver, delta, run) {
  const before = await balance(driver);
  const res = await run();
  if (!res.ok) throw new Error(`${label}: ${res.phase}: ${res.reason}`);
  return expectBalance(label, driver, before + delta, before);
}

function ok(res, label) {
  if (!res.ok) throw new Error(`${label} failed at ${res.phase}: ${res.reason}`);
  return res;
}

/** A call expected to revert: assert it failed and the reason names the guard. */
async function expectRevert(label, run, substring) {
  const res = await run();
  const reason = String(res.reason ?? "");
  check(`${label} reverts`, !res.ok && reason.includes(substring), res.ok ? "unexpectedly succeeded" : reason.slice(0, 90));
  return res;
}

async function resolveUntilDecided(driver, address, dealId, method, label, attempts = 6) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await sleep(8000);
    const res = await driver.writeTo(address, method, [dealId]);
    const view = JSON.parse(String(await driver.readFrom(address, "get_deal", [dealId])));
    if (res.ok && view.status === "RESOLVED" && view.outcome !== "UNDETERMINED") {
      console.log(`   ${label}: settled ${view.outcome} bps=${view.release_bps} (attempt ${attempt})`);
      return view;
    }
    console.log(`   ${label} attempt ${attempt}: ${res.ok ? `committee=${view.outcome}` : res.reason}`);
  }
  throw new Error(`${label} did not settle`);
}

async function main() {
  const { buyerKey, sellerKey } = loadKeys();
  const shared = { lastCall: 0 };
  const buyerClient = createRawClient(buyerKey);
  const sellerClient = createRawClient(sellerKey);
  const bd = makeDriver(buyerClient, shared);
  const sd = makeDriver(sellerClient, shared);
  const buyerAddr = buyerClient.account.address;
  const sellerAddr = sellerClient.account.address;
  console.log(`buyer   ${buyerAddr}`);
  console.log(`seller  ${sellerAddr}`);

  const targetAddress = (() => {
    const i = process.argv.indexOf("--address");
    const fromArg = i >= 0 ? process.argv[i + 1] : null;
    return fromArg || process.env.SACRAMENTUM_ADDRESS || null;
  })();

  step(1, targetAddress ? "attach to the deployed contract" : "deploy a fresh contract");
  let c;
  if (targetAddress) {
    c = targetAddress;
    console.log(`   contract ${c} (existing)`);
    const existing = Number(await bd.readFrom(c, "get_deal_count"));
    check("target contract is empty (deal_count == 0)", existing === 0, `deal_count=${existing}`);
    if (existing !== 0) throw new Error(`contract ${c} already holds ${existing} deal(s); the scenario needs an empty one`);
  } else {
    const source = fs.readFileSync(path.join(ROOT, "contracts", "sacramentum.py"), "utf-8");
    const created = await bd.deployContract(source, []);
    if (!created.ok) throw new Error(`deploy: ${created.reason}`);
    c = created.address;
    console.log(`   contract ${c}`);
    check("deploy read-back get_deal_count == 0", Number(await bd.readFrom(c, "get_deal_count")) === 0);
  }

  const sellerBal = BigInt(await sd.balance());
  console.log(`   buyer balance  ${fmt(BigInt(await bd.balance()))}`);
  console.log(`   seller balance ${fmt(sellerBal)}`);
  if (sellerBal < GEN(1)) {
    const funded = await bd.transfer(sellerAddr, GEN(2));
    if (!funded.ok) throw new Error(`funding the seller failed: ${funded.phase}: ${funded.reason}`);
    await expectBalance("seller funded from the buyer", sd, sellerBal + GEN(2), sellerBal);
  }

  const deadline = () => Math.floor(Date.now() / 1000) + 7 * 86400;

  // ---------------------------------------------------------------- deal A: release
  step(2, "deal A: confirm_delivery moves the escrow to the seller");
  const E_A = GEN(5);
  ok(await bd.writeTo(c, "open_deal", [sellerAddr, "Deal A", TERMS, deadline(), [URL]]), "A.open_deal");
  await moveTo("A fund_deal charges the buyer", bd, -E_A, () => bd.writeTo(c, "fund_deal", ["d1"], E_A));
  ok(await sd.writeTo(c, "accept_deal", ["d1"]), "A.accept_deal");
  await expectRevert("A confirm_delivery by seller", () => sd.writeTo(c, "confirm_delivery", ["d1"]), "only the buyer");
  ok(await sd.writeTo(c, "submit_delivery", ["d1", URL, "v1 live"]), "A.submit_delivery");
  await moveTo("A confirm_delivery pays the seller the escrow", sd, E_A, () => bd.writeTo(c, "confirm_delivery", ["d1"]));

  // ---------------------------------------------------------------- deal C: cancel
  step(3, "deal C: cancel_deal refunds the buyer");
  const E_C = GEN(4);
  ok(await bd.writeTo(c, "open_deal", [sellerAddr, "Deal C", TERMS, deadline(), [URL]]), "C.open_deal");
  await moveTo("C fund_deal charges the buyer", bd, -E_C, () => bd.writeTo(c, "fund_deal", ["d2"], E_C));
  await expectRevert("C cancel_deal by seller", () => sd.writeTo(c, "cancel_deal", ["d2"]), "only the buyer");
  await moveTo("C cancel_deal refunds the buyer", bd, E_C, () => bd.writeTo(c, "cancel_deal", ["d2"]));

  // ---------------------------------------------------------------- deal D: timeout
  step(4, "deal D: claim_timeout refunds the buyer after the deadline");
  const E_D = GEN(3);
  const dDeadline = Math.floor(Date.now() / 1000) + 90;
  ok(await bd.writeTo(c, "open_deal", [sellerAddr, "Deal D", TERMS, dDeadline, [URL]]), "D.open_deal");
  await moveTo("D fund_deal charges the buyer", bd, -E_D, () => bd.writeTo(c, "fund_deal", ["d3"], E_D));
  await expectRevert("D claim_timeout before the deadline", () => bd.writeTo(c, "claim_timeout", ["d3"]), "deadline");

  // ---------------------------------------------------------------- deal B: dispute
  step(5, "deal B: dispute, resolve, appeal, resolve_appeal, finalize");
  const E_B = GEN(10);
  ok(await bd.writeTo(c, "open_deal", [sellerAddr, "Deal B", TERMS, deadline(), [URL]]), "B.open_deal");
  await expectRevert("B open_deal with buyer==seller", () => bd.writeTo(c, "open_deal", [buyerAddr, "Bad", TERMS, deadline(), [URL]]), "must differ");
  await expectRevert("B accept_deal by buyer", () => bd.writeTo(c, "accept_deal", ["d4"]), "only the seller");
  await expectRevert("B fund_deal by seller", () => sd.writeTo(c, "fund_deal", ["d4"]), "only the buyer");
  await expectRevert("B fund_deal with zero value", () => bd.writeTo(c, "fund_deal", ["d4"], 0n), "GEN value");
  await moveTo("B fund_deal charges the buyer the escrow", bd, -E_B, () => bd.writeTo(c, "fund_deal", ["d4"], E_B));
  await expectRevert("B fund_deal twice", () => bd.writeTo(c, "fund_deal", ["d4"], 0n), "not open");
  ok(await sd.writeTo(c, "accept_deal", ["d4"]), "B.accept_deal");
  await expectRevert("B submit_delivery over http", () => sd.writeTo(c, "submit_delivery", ["d4", "http://example.com", "x"]), "https://");
  ok(await sd.writeTo(c, "submit_delivery", ["d4", URL, "v1 live"]), "B.submit_delivery");
  ok(await bd.writeTo(c, "raise_dispute", ["d4", "the version number is missing"]), "B.raise_dispute");
  await expectRevert("B resolve before evidence", () => bd.writeTo(c, "resolve", ["d4"]), "evidence window");
  ok(await bd.writeTo(c, "submit_evidence", ["d4", URL, "I cannot see a version"]), "B.buyer evidence");
  ok(await sd.writeTo(c, "submit_evidence", ["d4", URL, "the version is in the footer"]), "B.seller evidence");

  await resolveUntilDecided(bd, c, "d4", "resolve", "B.resolve");
  const bond = E_B * 2500n / 10000n;
  await expectRevert("B appeal with too small a bond", () => bd.writeTo(c, "appeal", ["d4"], 0n), "bond must be at least");
  await moveTo("B appeal stakes the bond from the buyer", bd, -bond, () => bd.writeTo(c, "appeal", ["d4"], bond));
  const final = await resolveUntilDecided(bd, c, "d4", "resolve_appeal", "B.resolve_appeal");

  const dealB = JSON.parse(String(await bd.readFrom(c, "get_deal", ["d4"])));
  const auditB = JSON.parse(String(await bd.readFrom(c, "get_deal_audit", ["d4"])));
  const escrow = BigInt(dealB.escrow_atto);
  const sellerCut = escrow * BigInt(dealB.release_bps) / 10000n;
  const buyerCut = escrow - sellerCut;
  const appellantIsBuyer = String(auditB.appellant).toLowerCase() === buyerAddr.toLowerCase();
  const appellantWon = appellantIsBuyer
    ? BigInt(dealB.release_bps) < BigInt(auditB.first_release_bps)
    : BigInt(dealB.release_bps) > BigInt(auditB.first_release_bps);
  const bondAtto = BigInt(dealB.appeal_bond_atto);
  console.log(`   verdict final=${final.outcome} bps=${dealB.release_bps} appellant=${appellantIsBuyer ? "buyer" : "seller"} won=${appellantWon}`);

  const sellerBeforeFinalize = await balance(sd);
  const buyerBeforeFinalize = await balance(bd);
  ok(await bd.writeTo(c, "finalize", ["d4"]), "B.finalize");
  await expectRevert("B finalize twice", () => bd.writeTo(c, "finalize", ["d4"]), "no standing verdict");
  await expectBalance("B finalize pays the seller the release + forfeited bond", sd, sellerBeforeFinalize + sellerCut + (appellantWon ? 0n : bondAtto), sellerBeforeFinalize);
  await expectBalance("B finalize pays the buyer the remainder", bd, buyerBeforeFinalize + buyerCut + (appellantWon ? bondAtto : 0n), buyerBeforeFinalize);

  // ---------------------------------------------------------------- close deal D
  step(6, "deal D: claim_timeout once the deadline passed");
  const waitMs = (dDeadline + 5) * 1000 - Date.now();
  if (waitMs > 0) await sleep(waitMs);
  await moveTo("D claim_timeout refunds the buyer", bd, E_D, () => bd.writeTo(c, "claim_timeout", ["d3"]));

  // ---------------------------------------------------------------- views
  step(7, "views");
  const ids = JSON.parse(String(await bd.readFrom(c, "get_deal_ids")));
  const count = Number(await bd.readFrom(c, "get_deal_count"));
  const dealA = JSON.parse(String(await bd.readFrom(c, "get_deal", ["d1"])));
  const terms = String(await bd.readFrom(c, "get_terms", ["d1"]));
  const audit = JSON.parse(String(await bd.readFrom(c, "get_deal_audit", ["d4"])));
  const verdict = JSON.parse(String(await bd.readFrom(c, "get_verdict", ["d4"])));
  const stats = JSON.parse(String(await bd.readFrom(c, "get_stats")));
  const log = JSON.parse(String(await bd.readFrom(c, "get_log", [0, 100])));
  check("get_deal_count == 4", count === 4, String(count));
  check("get_deal_ids == d1..d4", ids.join(",") === "d1,d2,d3,d4", ids.join(","));
  check("get_deal(d1) RELEASED/COMPLIANT", dealA.status === "RELEASED" && dealA.outcome === "COMPLIANT", `${dealA.status}/${dealA.outcome}`);
  check("get_terms returns the committed terms", terms.includes("criteria") && terms.includes("C1"));
  check("get_deal_audit(d4) records both evidence entries", audit.evidence.length === 2, `evidence=${audit.evidence.length}`);
  check("get_deal_audit(d4) appeal decided", audit.appeal_decided === true);
  check("get_verdict(d4) has two rounds", Array.isArray(verdict.rounds) && verdict.rounds.length === 2, `rounds=${verdict.rounds.length}`);
  check("get_verdict(d4) exposes equivalence", verdict.equivalence?.release_bps?.bucket_width_bps === 500);
  check("get_verdict(d4) exposes evidence digest", typeof verdict.rounds[0]?.evidence_digest === "string" && verdict.rounds[0].evidence_digest.length === 64);
  check("get_log returns entries", log.length > 0, `${log.length} entries`);

  step(8, "money invariants");
  const held = BigInt(stats.held_atto);
  check("held_atto is 0", held === 0n, fmt(held));
  check("conserved is true", stats.conserved === true);
  check("lifetime_inflow == lifetime_outflow", BigInt(stats.lifetime_inflow_atto) === BigInt(stats.lifetime_outflow_atto));
  const expectedReleased = E_A + sellerCut;
  const expectedRefunded = E_C + E_D + buyerCut;
  check(`total_released == A escrow + B seller cut (${fmt(expectedReleased)})`, BigInt(stats.total_released_atto) === expectedReleased, fmt(BigInt(stats.total_released_atto)));
  check(`total_refunded == C + D + B buyer cut (${fmt(expectedRefunded)})`, BigInt(stats.total_refunded_atto) === expectedRefunded, fmt(BigInt(stats.total_refunded_atto)));

  console.log(`\ncontract ${c}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
