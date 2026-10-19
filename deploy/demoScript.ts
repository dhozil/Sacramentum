/**
 * End-to-end demo of Sacramentum on Studionet: every write method and every view,
 * on one freshly deployed instance, with the buyer and the seller as two separate
 * signing accounts.
 *
 * It deliberately uses the real network for the adjudication steps, so `resolve`
 * and `resolve_appeal` are real leader/validator rounds over a real web fetch and
 * a real model call, not mocks. That makes those rounds occasionally return
 * UNDETERMINED or fail a disagreement; the script retries a few times and reports
 * what the committee decided rather than pretending it is deterministic.
 *
 * Usage:
 *   node deploy/demoScript.ts                         # deploy fresh, then run
 *   node deploy/demoScript.ts --address 0x...         # run against an existing one
 *   SACRAMENTUM_ADDRESS=0x... node deploy/demoScript.ts
 *
 * Buyer key:  DEPLOYER_PRIVATE_KEY, the project wallet's GENLAYER_DEV_KEY, or
 *             scripts/.deployer.tmp.
 * Seller key: SACRAMENTUM_SELLER_KEY, or the wallet's recipient.json privateKey.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const WALLET_DIR = process.env.SACRAMENTUM_WALLET_DIR ?? "D:\\Genlayer-project\\wallet";
const WALLET_ENV = path.join(WALLET_DIR, ".env");
const WALLET_RECIPIENT = path.join(WALLET_DIR, "recipient.json");
const KEY_TMP = path.join(ROOT, "scripts", ".deployer.tmp");

const ONE = 10n ** 18n;
const GEN = (n) => BigInt(n) * ONE;

const TERMS = JSON.stringify({
  deliverable: "A public web page served over HTTPS that contains readable text.",
  criteria: [
    { id: "C1", text: "The deliverable URL is reachable over HTTPS." },
    { id: "C2", text: "The page contains readable text." },
  ],
});
const DELIVERY_URL = "https://example.com";
const SOURCES = ["https://example.com"];

function parseArgs(argv) {
  const out = {};
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

const args = parseArgs(process.argv.slice(2));
const short = (hash) => String(hash).slice(0, 12) + "…";
const line = (n, text) => console.log(`\n[${n}] ${text}`);

const { makeDriver, createRawClient, readKeyFromEnv, readKeyFromJson } = createRequire(import.meta.url)(
  path.join(ROOT, "scripts", "studionet.cjs"),
);

function loadKeys() {
  const buyerKey =
    process.env.DEPLOYER_PRIVATE_KEY ||
    readKeyFromEnv([process.env.SACRAMENTUM_KEY_FILE, WALLET_ENV, KEY_TMP], [
      "GENLAYER_DEV_KEY",
      "DEPLOYER_PRIVATE_KEY",
    ]);
  const sellerKey =
    process.env.SACRAMENTUM_SELLER_KEY || readKeyFromJson(WALLET_RECIPIENT, "privateKey");
  if (!buyerKey) throw new Error("no buyer key: set DEPLOYER_PRIVATE_KEY or GENLAYER_DEV_KEY");
  if (!sellerKey) throw new Error(`no seller key: set SACRAMENTUM_SELLER_KEY or put one in ${WALLET_RECIPIENT}`);
  return { buyerKey, sellerKey };
}

async function reader(driver, address) {
  return {
    deal: async (id) => JSON.parse(String(await driver.readFrom(address, "get_deal", [id]))),
    stats: async () => JSON.parse(String(await driver.readFrom(address, "get_stats"))),
    audit: async (id) => JSON.parse(String(await driver.readFrom(address, "get_deal_audit", [id]))),
    verdict: async (id) => JSON.parse(String(await driver.readFrom(address, "get_verdict", [id]))),
    terms: async (id) => String(await driver.readFrom(address, "get_terms", [id])),
  };
}

function must(res, label) {
  if (!res.ok) throw new Error(`${label} failed at ${res.phase}: ${res.reason}`);
  console.log(`   ok  ${label}  ${short(res.hash)}`);
  return res;
}

const deadlineIn = (seconds) => Math.floor(Date.now() / 1000) + seconds;

async function main() {
  const { buyerKey, sellerKey } = loadKeys();
  const shared = { lastCall: 0 };
  const buyer = createRawClient(buyerKey);
  const seller = createRawClient(sellerKey);
  const bd = makeDriver(buyer, shared);
  const sd = makeDriver(seller, shared);

  console.log(`buyer   ${buyer.account.address}`);
  console.log(`seller  ${seller.account.address}`);

  line(1, "deploy a fresh Sacramentum");
  const address = args.address || process.env.SACRAMENTUM_ADDRESS;
  let contract = address;
  if (contract) {
    console.log(`   using existing contract ${contract}`);
  } else {
    const source = fs.readFileSync(path.join(ROOT, "contracts", "sacramentum.py"), "utf-8");
    const created = await bd.deployContract(source, []);
    if (!created.ok) throw new Error(`deploy failed at ${created.phase}: ${created.reason}`);
    contract = created.address;
    console.log(`   ok  deployed  ${short(created.hash)}`);
    console.log(`   contract ${contract}`);
  }
  const reader0 = await reader(bd, contract);

  line(2, "make sure the seller can pay gas");
  const sellerBalance = BigInt(await sd.balance());
  if (sellerBalance < GEN(1)) {
    console.log(`   seller holds ${Number(sellerBalance) / 1e18} GEN; sending 5 GEN`);
    const funded = await bd.transfer(seller.account.address, GEN(5));
    if (!funded.ok) console.log(`   (funding failed at ${funded.phase}: ${funded.reason}; continuing)`);
    else console.log(`   ok  funded  ${short(funded.hash)}`);
  } else {
    console.log(`   seller already holds ${Number(sellerBalance) / 1e18} GEN`);
  }

  // --- Deal A: the happy path, buyer confirms delivery --------------------
  line(3, "deal A: open -> fund -> accept -> deliver -> confirm (release)");
  must(await bd.writeTo(contract, "open_deal", [seller.account.address, "Deal A", TERMS, deadlineIn(7 * 86400), SOURCES]), "A.open_deal");
  const idA = String(await bd.readFrom(contract, "get_deal_count"));
  const dealA = "d" + idA;
  must(await bd.writeTo(contract, "fund_deal", [dealA], GEN(5)), "A.fund_deal");
  must(await sd.writeTo(contract, "accept_deal", [dealA]), "A.accept_deal");
  must(await sd.writeTo(contract, "submit_delivery", [dealA, DELIVERY_URL, "version 1.0 is live"]), "A.submit_delivery");
  must(await bd.writeTo(contract, "confirm_delivery", [dealA]), "A.confirm_delivery");
  console.log(`   A status: ${(await reader0.deal(dealA)).status}`);

  // --- Deal C: the buyer cancels before delivery --------------------------
  line(4, "deal C: open -> fund -> cancel (refund)");
  must(await bd.writeTo(contract, "open_deal", [seller.account.address, "Deal C", TERMS, deadlineIn(7 * 86400), SOURCES]), "C.open_deal");
  const idC = String(await bd.readFrom(contract, "get_deal_count"));
  const dealC = "d" + idC;
  must(await bd.writeTo(contract, "fund_deal", [dealC], GEN(4)), "C.fund_deal");
  must(await bd.writeTo(contract, "cancel_deal", [dealC]), "C.cancel_deal");
  console.log(`   C status: ${(await reader0.deal(dealC)).status}`);

  // --- Deal D: a deadline miss, refunded by the timeout backstop ----------
  line(5, "deal D: open -> fund with a short deadline (claimed later)");
  const dDeadline = deadlineIn(120);
  must(await bd.writeTo(contract, "open_deal", [seller.account.address, "Deal D", TERMS, dDeadline, SOURCES]), "D.open_deal");
  const idD = String(await bd.readFrom(contract, "get_deal_count"));
  const dealD = "d" + idD;
  must(await bd.writeTo(contract, "fund_deal", [dealD], GEN(3)), "D.fund_deal");
  console.log(`   D deadline in 120s`);

  // --- Deal B: the full disputed path, with real consensus ----------------
  line(6, "deal B: open -> fund -> accept -> deliver -> dispute -> evidence x2 -> resolve");
  must(await bd.writeTo(contract, "open_deal", [seller.account.address, "Deal B", TERMS, deadlineIn(7 * 86400), SOURCES]), "B.open_deal");
  const idB = String(await bd.readFrom(contract, "get_deal_count"));
  const dealB = "d" + idB;
  const escrowB = GEN(10);
  must(await bd.writeTo(contract, "fund_deal", [dealB], escrowB), "B.fund_deal");
  must(await sd.writeTo(contract, "accept_deal", [dealB]), "B.accept_deal");
  must(await sd.writeTo(contract, "submit_delivery", [dealB, DELIVERY_URL, "version 1.0 is live"]), "B.submit_delivery");
  must(await bd.writeTo(contract, "raise_dispute", [dealB, "the version number is missing"]), "B.raise_dispute");
  must(await bd.writeTo(contract, "submit_evidence", [dealB, DELIVERY_URL, "I cannot see a version"]), "B.buyer evidence");
  must(await sd.writeTo(contract, "submit_evidence", [dealB, DELIVERY_URL, "the version is in the footer"]), "B.seller evidence");

  const firstVerdict = await resolveUntilDecided(bd, contract, dealB, "resolve", "RESOLVED", "B.resolve");
  console.log(`   verdict: ${firstVerdict.outcome} release_bps=${firstVerdict.release_bps} confidence=${firstVerdict.confidence}`);
  const verdictB = await reader0.verdict(dealB);
  if (verdictB.rounds[0]) {
    console.log(`   AI round 1: ${verdictB.rounds[0].outcome} bps=${verdictB.rounds[0].release_bps} bucket=${verdictB.rounds[0].release_bucket} digest=${verdictB.rounds[0].evidence_digest.slice(0, 12)}…`);
  }

  line(7, "deal B: appeal (bonded) -> resolve_appeal (final) -> finalize");
  const bond = escrowB * 2500n / 10000n;
  must(await bd.writeTo(contract, "appeal", [dealB], bond), `B.appeal (bond ${bond} atto)`);
  const finalVerdict = await resolveUntilDecided(bd, contract, dealB, "resolve_appeal", "RESOLVED", "B.resolve_appeal");
  console.log(`   verdict: ${finalVerdict.outcome} release_bps=${finalVerdict.release_bps} final=${finalVerdict.final}`);
  must(await bd.writeTo(contract, "finalize", [dealB]), "B.finalize");

  // --- Deal D: claim the timeout once its deadline has actually passed ----
  line(8, "deal D: claim_timeout (refund)");
  const waitMs = (dDeadline + 5) * 1000 - Date.now();
  if (waitMs > 0) {
    console.log(`   waiting ${Math.ceil(waitMs / 1000)}s for the deadline`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  must(await bd.writeTo(contract, "claim_timeout", [dealD]), "D.claim_timeout");
  console.log(`   D status: ${(await reader0.deal(dealD)).status}`);

  // --- Every view ---------------------------------------------------------
  line(9, "views");
  const ids = JSON.parse(String(await bd.readFrom(contract, "get_deal_ids")));
  const count = Number(await bd.readFrom(contract, "get_deal_count"));
  const stats = await reader0.stats();
  const log = JSON.parse(String(await bd.readFrom(contract, "get_log", [0, 3])));
  console.log(`   get_deal_count  ${count}`);
  console.log(`   get_deal_ids    ${ids.join(", ")}`);
  console.log(`   get_terms(B)    ${(await reader0.terms(dealB)).slice(0, 60)}…`);
  console.log(`   get_deal(A)     ${(await reader0.deal(dealA)).status} / ${(await reader0.deal(dealA)).outcome}`);
  console.log(`   get_deal_audit(B) appellant=${(await reader0.audit(dealB)).appellant} appeal_decided=${(await reader0.audit(dealB)).appeal_decided}`);
  console.log(`   get_stats       ${JSON.stringify(stats)}`);
  console.log(`   get_log[0:3]    ${log.length} entries`);

  line(10, "get_verdict(B): the AI consensus + equivalence detail a frontend reads");
  console.log(JSON.stringify(await reader0.verdict(dealB), null, 2));

  console.log("\nAll write methods exercised except __on_errored_message__, which the");
  console.log("runtime calls on a bounced payout and no caller can invoke directly.");
  console.log(`\ncontract ${contract}`);
}

/** Resolve/adjudicate, retrying when the committee fails or cannot commit. */
async function resolveUntilDecided(driver, contract, dealId, method, expectStatus, label, attempts = 6) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      // Real consensus over a real web fetch occasionally disagrees or reads
      // nothing; back off a little so the retry gets fresh committee and data.
      await new Promise((r) => setTimeout(r, 8000));
    }
    const res = await driver.writeTo(contract, method, [dealId]);
    if (!res.ok) {
      const leader = res.receipt?.consensus_data?.leader_receipt?.[0];
      console.log(`   ${label} attempt ${attempt}: ${res.phase}: ${res.reason}`);
      if (leader) {
        console.log(`     leader.exec=${leader.execution_result} status=${leader.result?.status}`);
        console.log(`     payload=${JSON.stringify(leader.result?.payload)?.slice(0, 400)}`);
      }
      continue;
    }
    const view = JSON.parse(String(await driver.readFrom(contract, "get_deal", [dealId])));
    if (view.status === expectStatus && view.outcome !== "UNDETERMINED") {
      console.log(`   ok  ${label}  ${short(res.hash)}`);
      return view;
    }
    console.log(`   ${label} attempt ${attempt}: committee returned ${view.outcome}, retrying`);
  }
  throw new Error(`${label} did not reach ${expectStatus} after ${attempts} attempts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
