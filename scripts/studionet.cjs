#!/usr/bin/env node
/**
 * Shared plumbing for the Studionet drivers.
 *
 * Every hard-won detail about talking to Studionet lives here rather than being
 * repeated in each script:
 *
 *  1. Only browser-like User-Agents get through Cloudflare. The Node.js SDK
 *     qualifies, the Python SDK does not, so gltest cannot be used here at all.
 *  2. A transaction can reach ACCEPTED and FINALIZED and still have rolled
 *     back. Only consensus_data.leader_receipt says which happened, and
 *     result.payload is the only place the reason appears.
 *  2b. A receipt is only believed once its hash matches the hash that was just
 *     submitted, otherwise an earlier transaction's outcome gets attributed to
 *     the call under test.
 *  3. 30 JSON-RPC requests per minute, 500 per hour, rejected with -32029 and a
 *     retry_after_seconds hint. Every call is paced and backs off on the hint.
 *  4. genlayer-js is resolved from the global `genlayer` CLI install, so nothing
 *     needs npm installing.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const GLOBAL_MODULES = path.join(execSync("npm root -g").toString().trim(), "genlayer", "node_modules");
const { createClient, createAccount, chains } = require(path.join(GLOBAL_MODULES, "genlayer-js"));

const RPC_SPACING_MS = 2600;
const READ_ATTEMPTS = 24;
const READ_BACKOFF_MS = 10000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (wei) => `${(Number(BigInt(wei)) / 1e18).toFixed(6)} GEN`;

/**
 * Read a private key from the first env-like file that matches, or a bare
 * 32-byte hex key from a plain file. Returns null when nothing is found so the
 * caller can decide how loud to be about it.
 */
function readKeyFromEnv(files, names = ["GENLAYER_DEV_KEY", "DEPLOYER_PRIVATE_KEY"]) {
  for (const file of files) {
    if (!file || !fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf-8");
    for (const name of names) {
      const match = text.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, "m"));
      if (match) return match[1].replace(/^["']|["']$/g, "").trim();
    }
    const bare = text.trim();
    if (/^0x[0-9a-fA-F]{64}$/.test(bare)) return bare;
  }
  return null;
}

/** Read a specific JSON field (e.g. a wallet export's privateKey). */
function readKeyFromJson(file, field) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    const value = parsed[field];
    return typeof value === "string" && value.startsWith("0x") ? value : null;
  } catch {
    return null;
  }
}

function createRawClient(key) {
  return createClient({ chain: chains.studionet, account: createAccount(key.trim()) });
}

function makeClient(keyPath) {
  return createRawClient(fs.readFileSync(keyPath, "utf-8"));
}

function makeDriver(client, shared = { lastCall: 0 }) {
  async function paced(fn) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const wait = shared.lastCall + RPC_SPACING_MS - Date.now();
      if (wait > 0) await sleep(wait);
      shared.lastCall = Date.now();
      try {
        return await fn();
      } catch (err) {
        // Studionet sits behind Cloudflare, which answers throttled or unhappy
        // requests with an HTML error page rather than JSON. Those, a raw
        // transport failure, and a stated rate limit are all worth retrying;
        // a contract revert is not, and that never surfaces as a thrown call.
        const retryAfter = err?.data?.retry_after_seconds ?? err?.cause?.data?.retry_after_seconds;
        const message = `${err?.message ?? ""} ${err?.cause?.message ?? ""} ${err?.details ?? ""}`;
        const transient =
          /rate limit|unknown RPC error|unexpected token|DOCTYPE|bad gateway|service unavailable|gateway timeout|fetch failed|network error|ECONNRESET|socket hang up|\b50[234]\b|temporarily/i.test(
            message,
          );
        if (retryAfter === undefined && !transient) throw err;
        const backoff = retryAfter !== undefined ? (Number(retryAfter) + 2) * 1000 : 4000 * (attempt + 1);
        await sleep(backoff);
      }
    }
    throw new Error("gave up after repeated transient RPC failures");
  }

  /**
   * Reject a receipt that belongs to a different transaction.
   *
   * A receipt can carry its own hashes under several names depending on the
   * node version, and a receipt that belongs to an earlier transaction looks
   * exactly like a successful one. Reading it would attribute some previous
   * intent's outcome to the call that was just submitted, so the hash is
   * compared before the receipt is believed at all.
   */
  function receiptHashMismatch(receipt, expected) {
    if (!expected) return null;
    const got =
      receipt?.transaction_hash ??
      receipt?.transactionHash ??
      receipt?.hash ??
      receipt?.to_transaction_hash;
    if (got === undefined || got === null) return null; // node did not echo it
    return String(got).toLowerCase() === String(expected).toLowerCase() ? null : `${got} != ${expected}`;
  }

  /** null when the leader actually returned, otherwise a diagnostic string. */
  function executionFailure(receipt) {
    const leader = receipt?.consensus_data?.leader_receipt?.[0];
    if (!leader) return "no leader receipt in the response";
    const status = leader.result?.status;
    if (leader.execution_result === "SUCCESS" && (status === undefined || status === "return")) return null;
    const parts = [];
    if (leader.execution_result !== "SUCCESS") parts.push(`execution_result=${leader.execution_result}`);
    if (leader.error_code) parts.push(`error_code=${leader.error_code}`);
    if (status) parts.push(`result=${status}`);
    const payload = leader.result?.payload;
    if (payload !== undefined && payload !== null) {
      parts.push(`payload=${(typeof payload === "string" ? payload : JSON.stringify(payload)).slice(0, 300)}`);
    }
    return parts.length ? parts.join(" | ") : "unknown failure";
  }

  async function readFrom(address, method, args = []) {
    let lastError;
    for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
      try {
        return await paced(() => client.readContract({ address, functionName: method, args }));
      } catch (err) {
        lastError = err;
        if (!/execution failed|invalid parameters|not found/i.test(err?.message ?? "")) throw err;
        await sleep(READ_BACKOFF_MS);
      }
    }
    throw lastError;
  }

  const waitReceipt = (hash) =>
    paced(() => client.waitForTransactionReceipt({ hash, status: "ACCEPTED", interval: 4000, retries: 120 }));

  async function writeTo(address, method, args = [], value = 0n) {
    let hash;
    try {
      hash = await paced(() =>
        client.writeContract({ address, functionName: method, args, value, consensusMaxRotations: 5 }),
      );
    } catch (err) {
      return { ok: false, phase: "submit", reason: err.message };
    }
    let receipt;
    try {
      receipt = await waitReceipt(hash);
    } catch (err) {
      return { ok: false, phase: "receipt", reason: err.message, hash };
    }
    const stale = receiptHashMismatch(receipt, hash);
    if (stale) return { ok: false, phase: "receipt", reason: `receipt is for another transaction: ${stale}`, hash };
    const failure = executionFailure(receipt);
    if (failure) return { ok: false, phase: "execute", reason: failure, hash, receipt };
    return { ok: true, hash, receipt };
  }

  async function deployContract(code, args = []) {
    let hash;
    try {
      hash = await paced(() => client.deployContract({ code, args, consensusMaxRotations: 5 }));
    } catch (err) {
      return { ok: false, phase: "submit", reason: err.message };
    }
    const receipt = await waitReceipt(hash);
    const stale = receiptHashMismatch(receipt, hash);
    if (stale) return { ok: false, phase: "receipt", reason: `receipt is for another transaction: ${stale}`, hash };
    const failure = executionFailure(receipt);
    if (failure) return { ok: false, phase: "execute", reason: failure, hash };
    return { ok: true, hash, address: receipt.contract_address || receipt.to_address };
  }

  const balance = () => paced(() => client.getBalance({ address: client.account.address }));

  /**
   * Send native GEN. A plain transfer has no contract execution, so there is no
   * leader receipt to inspect; success is the receipt existing and matching.
   */
  async function transfer(to, amount) {
    let hash;
    try {
      hash = await paced(() => client.sendTransaction({ to, value: amount }));
    } catch (err) {
      return { ok: false, phase: "submit", reason: err.message };
    }
    let receipt;
    try {
      receipt = await waitReceipt(hash);
    } catch (err) {
      return { ok: false, phase: "receipt", reason: err.message, hash };
    }
    const stale = receiptHashMismatch(receipt, hash);
    if (stale) return { ok: false, phase: "receipt", reason: `receipt is for another transaction: ${stale}`, hash };
    return { ok: true, hash, receipt };
  }

  return {
    paced,
    readFrom,
    writeTo,
    deployContract,
    transfer,
    waitReceipt,
    executionFailure,
    receiptHashMismatch,
    balance,
  };
}

module.exports = {
  makeClient,
  makeDriver,
  createRawClient,
  readKeyFromEnv,
  readKeyFromJson,
  sleep,
  fmt,
};
