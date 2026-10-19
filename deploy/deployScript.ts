/**
 * Deploy Sacramentum to Studionet, and report the thing a deploy script exists
 * to report: whether the leader actually returned.
 *
 * A deployment that reaches FINALIZED and rolled back is the single most
 * expensive thing a deploy script can do wrong, because the address looks real
 * and the receipt looks final. The driver in scripts/studionet.cjs verifies the
 * receipt's hash against the transaction it submitted and reads the leader
 * receipt to decide whether the leader returned; this script reuses that driver
 * rather than re-implementing pacing, backoff or the rollback check.
 *
 * Usage:
 *   node deploy/deployScript.ts              # deploy and read it back
 *   node deploy/deployScript.ts --dry-run    # print what it would do
 *
 * The contract takes no constructor arguments. This is a network the SDK reaches
 * through a browser-like User-Agent, and it is reached from Node, not from the
 * Python SDK: Cloudflare rejects the Python User-Agent in front of Studionet.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

// The key is read from the environment or from the project's existing wallet,
// never from a file committed in this repository.
const WALLET_ENV = process.env.SACRAMENTUM_KEY_FILE ?? "D:\\Genlayer-project\\wallet\\.env";
const KEY_TMP = path.join(ROOT, "scripts", ".deployer.tmp");

const args = parseArgs(process.argv.slice(2));
const dryRun = args["dry-run"] !== undefined;

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

function rawKey(): string {
  if (process.env.DEPLOYER_PRIVATE_KEY) return process.env.DEPLOYER_PRIVATE_KEY.trim();

  for (const file of [WALLET_ENV, KEY_TMP]) {
    if (!file || !fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf-8");
    const match = text.match(/^\s*(?:GENLAYER_DEV_KEY|DEPLOYER_PRIVATE_KEY)\s*=\s*(.+?)\s*$/m);
    if (match) return match[1].replace(/^["']|["']$/g, "").trim();
    const bare = text.trim();
    if (/^0x[0-9a-fA-F]{64}$/.test(bare)) return bare;
  }

  console.error(
    "No deployer key. Set DEPLOYER_PRIVATE_KEY, or point SACRAMENTUM_KEY_FILE at an env file\n" +
      `that holds GENLAYER_DEV_KEY (looked at ${WALLET_ENV}).`,
  );
  process.exit(1);
}

/** makeClient() takes a path to a file holding just the key. */
function materializeKey(): string {
  fs.writeFileSync(KEY_TMP, rawKey(), "utf-8");
  return KEY_TMP;
}

function loadDriver(): { makeClient: Function; makeDriver: Function } {
  const required = createRequire(import.meta.url);
  return required(path.join(ROOT, "scripts", "studionet.cjs"));
}

async function main() {
  const { makeClient, makeDriver } = loadDriver();
  const client = makeClient(materializeKey());
  const { deployContract, readFrom, balance } = makeDriver(client);

  console.log(`deployer   ${client.account.address}`);
  console.log(`balance    ${(Number(await balance()) / 1e18).toFixed(6)} GEN`);

  const source = fs.readFileSync(path.join(ROOT, "contracts", "sacramentum.py"), "utf-8");

  if (dryRun) {
    console.log("\n--dry-run, so nothing will be sent. This would:");
    console.log("  1. deploy contracts/sacramentum.py (no constructor arguments)");
    console.log("  2. read back get_deal_count and get_stats to confirm the deployment is real");
    return;
  }

  console.log("\n[1] deploy Sacramentum");
  const created = await deployContract(source, []);
  if (!created.ok) {
    console.error(`  FAILED at ${created.phase}: ${created.reason}`);
    process.exit(1);
  }
  console.log(`  ${created.hash}`);
  const address = created.address;
  if (!address) {
    console.error("  the receipt carried no contract address");
    process.exit(1);
  }
  console.log(`  contract ${address}`);

  console.log("\n[2] read it back, because a FINALIZED receipt is not proof");
  const count = await readFrom(address, "get_deal_count");
  if (Number(count) !== 0) {
    console.error(`  a fresh contract reports ${count} deals, not 0`);
    process.exit(1);
  }
  const stats = JSON.parse(String(await readFrom(address, "get_stats")));
  if (stats.conserved !== true || stats.held_atto !== "0") {
    console.error(`  unexpected opening state: ${JSON.stringify(stats)}`);
    process.exit(1);
  }
  console.log(`  deals       ${stats.deals}`);
  console.log(`  held_atto   ${stats.held_atto}`);
  console.log(`  conserved   ${stats.conserved}`);

  console.log("\ndeployed. Next, by hand:");
  console.log("  open_deal + fund_deal   create an escrow and lock the value");
  console.log("  accept / deliver / confirm, or raise_dispute and resolve");
  console.log("");
  console.log("There is no factory: whoever deploys is whoever chose the code.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
