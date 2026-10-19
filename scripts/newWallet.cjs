#!/usr/bin/env node
/**
 * Create a fresh Studionet signing wallet and persist its key in two safe forms
 * inside the project wallet folder:
 *
 *   <dir>/<name>.env    SACRAMENTUM_<NAME>_KEY=0x...
 *   <dir>/<name>.json   { name, network, address, privateKey, note }
 *
 * Only the address is printed; the private key is written straight to disk and
 * never echoed to the console or shell history.
 *
 * Usage: node scripts/newWallet.cjs <name> [dir]
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const GLOBAL_MODULES = path.join(execSync("npm root -g").toString().trim(), "genlayer", "node_modules");
const { createAccount, generatePrivateKey } = require(path.join(GLOBAL_MODULES, "genlayer-js"));

const name = (process.argv[2] || "seller").toLowerCase();
const dir = process.argv[3] || path.join(__dirname, "..", "..", "wallet");
const envVar = `SACRAMENTUM_${name.toUpperCase()}_KEY`;

const privateKey = generatePrivateKey();
const account = createAccount(privateKey);

fs.mkdirSync(dir, { recursive: true });
const envPath = path.join(dir, `${name}.env`);
const jsonPath = path.join(dir, `${name}.json`);
if (fs.existsSync(envPath) || fs.existsSync(jsonPath)) {
  console.error(`refusing to overwrite an existing wallet: ${envPath} / ${jsonPath}`);
  process.exit(1);
}

fs.writeFileSync(envPath, `${envVar}=${privateKey}\n`);
fs.writeFileSync(
  jsonPath,
  `${JSON.stringify(
    { name, network: "studionet", address: account.address, privateKey, note: "Created by scripts/newWallet.cjs" },
    null,
    2,
  )}\n`,
);

console.log(`created ${name} wallet`);
console.log(`  address  ${account.address}`);
console.log(`  env      ${envPath}`);
console.log(`  json     ${jsonPath}`);
