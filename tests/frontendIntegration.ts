/**
 * Frontend ↔ live contract integration test.
 *
 * Everything the frontend ships flows through frontend/src/lib/sacramentum.ts
 * and frontend/src/lib/genlayer.ts. This test drives those exact modules — not a
 * re-implementation — against the deployed contract on Studionet, so a helper
 * that builds the wrong calldata or mis-parses a response fails here instead of
 * in the browser.
 *
 * Default (read-only, no keys, safe to spam):
 *   node tests/frontendIntegration.ts
 * Add the write/error paths (needs the buyer key):
 *   node tests/frontendIntegration.ts --write
 * Add the full happy path — open, fund, accept, deliver, confirm — through the
 * frontend wrappers. This moves 0.01 GEN of real escrow buyer -> seller and
 * leaves one RELEASED deal behind (needs both keys):
 *   node tests/frontendIntegration.ts --full
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const require = createRequire(import.meta.url);

const FULL = process.argv.includes("--full");
const WRITE = FULL || process.argv.includes("--write");

const WALLET_DIR = process.env.SACRAMENTUM_WALLET_DIR ?? "D:\\Genlayer-project\\wallet";
const WALLET_ENV = path.join(WALLET_DIR, ".env");
const WALLET_SELLER_ENV = path.join(WALLET_DIR, "seller.env");
const WALLET_RECIPIENT = path.join(WALLET_DIR, "recipient.json");

const { createRawClient, makeDriver, readKeyFromEnv, readKeyFromJson } = require(
  path.join(ROOT, "scripts", "studionet.cjs"),
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
}
const section = (text) => console.log(`\n[${text}]`);
const fmtGen = (atto) => `${(Number(atto) / 1e18).toFixed(6)} GEN`;

// --------------------------------------------------------------- the modules

const S = await import(pathToFileURL(path.join(ROOT, "frontend", "src", "lib", "sacramentum.ts")).href);
const { makeReadClient } = await import(
  pathToFileURL(path.join(ROOT, "frontend", "src", "lib", "genlayer.ts")).href
);

function loadKeys() {
  const buyerKey =
    process.env.DEPLOYER_PRIVATE_KEY ||
    readKeyFromEnv([process.env.SACRAMENTUM_KEY_FILE, WALLET_ENV], [
      "GENLAYER_DEV_KEY",
      "DEPLOYER_PRIVATE_KEY",
    ]);
  const sellerKey =
    process.env.SACRAMENTUM_SELLER_KEY ||
    readKeyFromEnv([process.env.SACRAMENTUM_SELLER_KEY_FILE, WALLET_SELLER_ENV], [
      "SACRAMENTUM_SELLER_KEY",
    ]) ||
    readKeyFromJson(WALLET_RECIPIENT, "privateKey");
  return { buyerKey, sellerKey };
}

// ------------------------------------------------------------------- the run

async function main() {
  const read = makeReadClient();

  console.log("Sacramentum frontend ↔ live contract");
  console.log(`  contract:  ${S.ADDRESS}`);
  console.log(`  mode:      ${FULL ? "full (reads + writes + GEN round-trip)" : WRITE ? "write (reads + error paths)" : "read-only"}`);

  section("1. read the market through the frontend readers");
  const ids = await S.getDealIds(read);
  check("getDealIds returns an array", Array.isArray(ids), `${ids?.length ?? "?"} ids`);
  check("ids look like d1..dN", ids.every((id) => /^d\d+$/.test(id)), ids.slice(0, 4).join(", "));

  const sample = ids.slice(0, 4);
  const deals = [];
  for (const id of sample) {
    const deal = await S.getDeal(read, id);
    deals.push(deal);
    await sleep(400);
  }
  for (const deal of deals) {
    check(
      `getDeal(${deal.id}) shape`,
      typeof deal.id === "string" &&
        Object.values(S.STATUS).includes(deal.status) &&
        /^0x[0-9a-fA-F]{40}$/.test(deal.buyer) &&
        /^0x[0-9a-fA-F]{40}$/.test(deal.seller) &&
        typeof deal.terms_digest === "string",
      `${deal.status} · ${deal.title?.slice(0, 24) ?? ""}`,
    );
  }

  if (sample[0]) {
    const terms = await S.getTerms(read, sample[0]);
    check(
      `getTerms(${sample[0]}) carries a deliverable`,
      typeof terms?.deliverable === "string" && terms.deliverable.length > 0,
    );
    await sleep(400);
    const audit = await S.getAudit(read, sample[0]);
    check(`getDealAudit(${sample[0]}) returns an audit record`, audit?.id === sample[0]);
    await sleep(400);
    const verdict = await S.getVerdict(read, sample[0]);
    check(
      `getVerdict(${sample[0]}) returns rounds + equivalence`,
      Array.isArray(verdict?.rounds) && !!verdict.equivalence,
      `${verdict?.rounds?.length ?? "?"} rounds`,
    );
  }

  section("2. stats stay conserved");
  const stats = await S.getStats(read);
  check("getStats reports conservation", stats.conserved === true, `deals=${stats.deals}`);
  check("stats.deals matches the id list", Number(stats.deals) === ids.length);

  section("3. the log decodes");
  const log = await S.getLog(read, 0, 50);
  check(
    "getLog returns decoded entries",
    Array.isArray(log) && log.every((entry) => typeof entry.event === "string"),
    `${log.length} entries`,
  );

  if (WRITE) {
    section("4. write path — a rejected call surfaces, and phases are narrated");
    const { buyerKey } = loadKeys();
    if (!buyerKey) {
      check("buyer key available for the write path", false, "set GENLAYER_DEV_KEY");
    } else {
      const signed = createRawClient(buyerKey);
      const phases = [];
      const bogus = await S.fundDeal(signed, "d000000", 0n, (p) => phases.push(p));
      check("a revert resolves to ok:false", bogus.ok === false);
      check("the revert carries an on-chain reason", typeof bogus.message === "string" && bogus.message.length > 0, bogus.message?.slice(0, 80));
      check("phases narrate signing then waiting", phases[0] === "signing" && phases.includes("waiting"), phases.join(" → "));
      check("no false confirmation on failure", !phases.includes("confirmed"));
    }
  } else {
    section("4. write path — skipped (pass --write to exercise it)");
  }

  if (FULL) {
    section("5. full path — the happy path moves GEN through the frontend");
    const { buyerKey, sellerKey } = loadKeys();
    if (!buyerKey || !sellerKey) {
      check("buyer and seller keys available for --full", false);
    } else {
      const buyer = createRawClient(buyerKey);
      const seller = createRawClient(sellerKey);
      const shared = { lastCall: 0 };
      const bd = makeDriver(buyer, shared);
      const sd = makeDriver(seller, shared);
      const ESCROW = 10n ** 16n; // 0.01 GEN
      const phases = [];
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const title = `integration smoke ${new Date().toISOString()}`;
      const termsJson = JSON.stringify({
        deliverable: "A page that exists at the given URL.",
        criteria: [{ id: "C1", text: "The URL is reachable over HTTPS." }],
      });

      const balance = async (driver) => BigInt(await driver.balance());
      /** Poll a native balance until it moved by `delta`, then assert the delta. */
      const expectDelta = async (label, driver, delta, base, timeoutMs = 90000) => {
        const want = base + delta;
        const start = Date.now();
        let now = await balance(driver);
        while (now !== want && Date.now() - start < timeoutMs) {
          await sleep(3000);
          now = await balance(driver);
        }
        check(label, now === want, `delta=${fmtGen(now - base)} expected=${fmtGen(delta)}`);
      };

      const opened = await S.openDeal(
        buyer,
        {
          seller: seller.account.address,
          title,
          termsJson,
          deadlineUnix: deadline,
          evidenceUrls: ["https://example.com"],
        },
        (p) => phases.push(p),
      );
      check("openDeal succeeds", opened.ok === true, opened.ok ? opened.hash.slice(0, 12) : opened.message);
      check("openDeal reports confirmation", phases.includes("confirmed"), phases.join(" → "));

      if (opened.ok) {
        const fresh = await S.getDealIds(read);
        const id = fresh[fresh.length - 1];
        const created = await S.getDeal(read, id);
        check("the new deal reads back OPEN", created.id === id && created.status === "OPEN", `${id} · ${created.status}`);
        check("the title survived the contract clip", created.title === title);

        const buyerBefore = await balance(bd);
        const funded = await S.fundDeal(buyer, id, ESCROW, (p) => phases.push(p));
        check("fundDeal succeeds", funded.ok === true, funded.ok ? funded.hash.slice(0, 12) : funded.message);
        await expectDelta("fundDeal moves the escrow out of the buyer", bd, -ESCROW, buyerBefore);
        const fundedDeal = await S.getDeal(read, id);
        check(
          "the deal reads back FUNDED with the escrow",
          fundedDeal.status === "FUNDED" && BigInt(fundedDeal.escrow_atto) === ESCROW,
          `${fundedDeal.status} · ${fundedDeal.escrow_atto}`,
        );

        const accepted = await S.acceptDeal(seller, id, (p) => phases.push(p));
        check("acceptDeal succeeds", accepted.ok === true, accepted.ok ? accepted.hash.slice(0, 12) : accepted.message);
        const delivered = await S.submitDelivery(seller, id, "https://example.com", "v1 live", (p) => phases.push(p));
        check("submitDelivery succeeds", delivered.ok === true, delivered.ok ? delivered.hash.slice(0, 12) : delivered.message);

        const sellerBefore = await balance(sd);
        const confirmed = await S.confirmDelivery(buyer, id, (p) => phases.push(p));
        check("confirmDelivery succeeds", confirmed.ok === true, confirmed.ok ? confirmed.hash.slice(0, 12) : confirmed.message);
        await expectDelta("confirmDelivery pays the seller the escrow", sd, ESCROW, sellerBefore);
        const released = await S.getDeal(read, id);
        check(
          "the deal reads back RELEASED/COMPLIANT",
          released.status === "RELEASED" && released.outcome === "COMPLIANT",
          `${released.status}/${released.outcome}`,
        );
        check("stats stay conserved after the release", (await S.getStats(read)).conserved === true);
        console.log(`   ${fmtGen(ESCROW)} moved buyer → seller through the frontend (deal ${id})`);
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

await main();
