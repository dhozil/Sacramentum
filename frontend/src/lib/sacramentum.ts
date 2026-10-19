import type { GenLayer as Client, ProtocolReceipt } from "./genlayer";

/** The deployed Sacramentum instance this app talks to. Override via env. */
export const ADDRESS =
  process.env.NEXT_PUBLIC_SACRAMENTUM_ADDRESS ?? "0x0DA83e6200318ca83C6C9ed77C3dCE6bdec60Bd6";

// ---------------------------------------------------------------- data shapes

export interface Deal {
  id: string;
  buyer: string;
  seller: string;
  title: string;
  terms_digest: string;
  deadline_unix: number;
  escrow_atto: string;
  status: string;
  delivery_url: string;
  delivered_at_unix: number;
  outcome: string;
  release_bps: number;
  confidence: number;
  appeal_deadline_unix: number;
  appeal_bond_atto: string;
  final: boolean;
  settled: boolean;
}

export interface Criterion {
  id: string;
  text: string;
}

export interface DealTerms {
  deliverable?: string;
  criteria?: Criterion[];
  [key: string]: unknown;
}

export interface EvidenceRecord {
  role: string;
  url: string;
  statement: string;
  at: number;
}

export interface DealAudit {
  id: string;
  status: string;
  outcome: string;
  release_bps: number;
  first_release_bps: number;
  rationale: string;
  confidence: number;
  sources: string[];
  evidence: EvidenceRecord[];
  satisfied_criteria: string[];
  unsatisfied_criteria: string[];
  appellant: string;
  appeal_decided: boolean;
}

export interface VerdictRound {
  round?: string;
  outcome: string;
  release_bps: number;
  release_bucket?: number;
  confidence: number;
  confidence_bucket?: number;
  satisfied_criteria?: string[];
  unsatisfied_criteria?: string[];
  rationale?: string;
  evidence_sources?: string[];
  evidence_digest?: string;
  evidence_chars?: number;
  model_output?: string;
}

export interface Equivalence {
  outcome?: string;
  release_bps?: { bucket_width_bps?: number; tolerance_bps?: number; [key: string]: unknown };
  confidence?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Verdict {
  id: string;
  status: string;
  outcome: string;
  release_bps: number;
  first_release_bps: number;
  confidence: number;
  final: boolean;
  appeal_decided: boolean;
  rounds: VerdictRound[];
  equivalence: Equivalence;
}

export interface Stats {
  deals: number;
  held_atto: string;
  lifetime_inflow_atto: string;
  lifetime_outflow_atto: string;
  total_released_atto: string;
  total_refunded_atto: string;
  conserved: boolean;
  log_truncated: boolean;
}

export interface LogEntry {
  event: string;
  id?: string;
  [key: string]: unknown;
}

// --------------------------------------------------------------- status model

export const STATUS = {
  OPEN: "OPEN",
  FUNDED: "FUNDED",
  ACCEPTED: "ACCEPTED",
  DELIVERED: "DELIVERED",
  RELEASED: "RELEASED",
  REFUNDED: "REFUNDED",
  DISPUTED: "DISPUTED",
  RESOLVED: "RESOLVED",
  APPEALED: "APPEALED",
  FINALIZED: "FINALIZED",
} as const;

export const LIFECYCLE = ["OPEN", "FUNDED", "ACCEPTED", "DELIVERED"] as const;

export const OUTCOME_LABEL: Record<string, string> = {
  COMPLIANT: "Compliant — release to seller",
  NON_COMPLIANT: "Non-compliant — refund buyer",
  PARTIAL: "Partial — split the escrow",
  UNDETERMINED: "Undetermined — no verdict yet",
};

export const OUTCOME_TONE: Record<string, "verdigris" | "seal" | "brass" | "neutral"> = {
  COMPLIANT: "verdigris",
  NON_COMPLIANT: "seal",
  PARTIAL: "brass",
  UNDETERMINED: "neutral",
};

export const STATUS_TONE: Record<
  string,
  "neutral" | "brass" | "verdigris" | "seal" | "parchment"
> = {
  OPEN: "neutral",
  FUNDED: "brass",
  ACCEPTED: "brass",
  DELIVERED: "parchment",
  DISPUTED: "seal",
  RESOLVED: "brass",
  APPEALED: "seal",
  RELEASED: "verdigris",
  REFUNDED: "verdigris",
  FINALIZED: "verdigris",
};

/** Protocol constants mirrored from contracts/sacramentum.py. */
export const PROTOCOL = {
  minEscrowAtto: 1n,
  maxTitle: 200,
  statementClip: 1200,
  disputeWindowSec: 3600,
  evidenceWindowSec: 1800,
  appealWindowSec: 3600,
  appealBondBps: 2500,
  minAppealBondAtto: 10n ** 15n,
  releaseBucketBps: 500,
  releaseToleranceBps: 500,
  maxEvidencePerParty: 3,
  maxSources: 3,
  maxCriteria: 12,
} as const;

/** The minimum bond `appeal()` will accept for a given escrow. */
export function appealBondFor(escrowAtto: string | bigint): bigint {
  const escrow = BigInt(escrowAtto);
  const share = (escrow * BigInt(PROTOCOL.appealBondBps)) / 10000n;
  return share > PROTOCOL.minAppealBondAtto ? share : PROTOCOL.minAppealBondAtto;
}

export type Role = "buyer" | "seller" | "observer" | "disconnected";

export function roleOf(deal: Deal | null, address: string | null): Role {
  if (!deal) return "observer";
  if (!address) return "disconnected";
  const a = address.toLowerCase();
  if (deal.buyer.toLowerCase() === a) return "buyer";
  if (deal.seller.toLowerCase() === a) return "seller";
  return "observer";
}

export function roleOfLabel(role: Role): string {
  if (role === "buyer") return "You are the buyer";
  if (role === "seller") return "You are the seller";
  if (role === "disconnected") return "No wallet connected";
  return "Observer";
}

// ------------------------------------------------------------ rpc resilience

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Flatten an error and its `cause` chain into one searchable string. */
export function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return `${error.message} ${cause?.message ?? ""}`.trim();
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Studionet sits behind Cloudflare, which answers throttled or unhappy requests
 * with HTML, a rate-limit marker, or a dropped socket. None of those mean the
 * call failed — they mean it should be tried again in a moment.
 */
export function isTransient(error: unknown): boolean {
  return /rate limit|unknown rpc error|unexpected token|DOCTYPE|bad gateway|service unavailable|gateway timeout|fetch failed|network error|ECONNRESET|socket hang up|\b50[234]\b|temporarily|-32029|retry_after/i.test(
    messageOf(error),
  );
}

/**
 * A read can land before the transaction it depends on is finalized, so the
 * node briefly reports the target as missing. That, too, is worth retrying.
 */
function isReadRetryable(error: unknown): boolean {
  return (
    isTransient(error) ||
    /execution failed|invalid parameters|not found|not been finalized|not finalized|is pending|not ready|no such/i.test(
      messageOf(error),
    )
  );
}

// -------------------------------------------------------------- read helpers

async function readJson<T>(client: Client, functionName: string, args: unknown[] = []): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const raw = await client.readContract({ address: ADDRESS, functionName, args });
      return JSON.parse(String(raw)) as T;
    } catch (error) {
      lastError = error;
      if (!isReadRetryable(error)) throw error;
      await sleep(1200 * (attempt + 1));
    }
  }
  throw lastError;
}

export const getDealIds = (client: Client) => readJson<string[]>(client, "get_deal_ids");
export const getDeal = (client: Client, id: string) => readJson<Deal>(client, "get_deal", [id]);
export const getTerms = (client: Client, id: string) => readJson<DealTerms>(client, "get_terms", [id]);
export const getAudit = (client: Client, id: string) => readJson<DealAudit>(client, "get_deal_audit", [id]);
export const getVerdict = (client: Client, id: string) => readJson<Verdict>(client, "get_verdict", [id]);
export const getStats = (client: Client) => readJson<Stats>(client, "get_stats");

export async function getLog(client: Client, start = 0, count = 200): Promise<LogEntry[]> {
  const rows = await readJson<string[]>(client, "get_log", [start, count]);
  return rows.map((row) => {
    try {
      return JSON.parse(row) as LogEntry;
    } catch {
      return { event: String(row) };
    }
  });
}

// -------------------------------------------------------------- write helpers

export type WriteResult =
  | { ok: true; hash: string; receipt: ProtocolReceipt }
  | { ok: false; message: string; hash?: string };

/** Progress of a write, surfaced to the UI so a slow consensus stays legible. */
export type TxPhase = "idle" | "signing" | "waiting" | "confirmed";
export type PhaseReporter = (phase: TxPhase) => void;

/**
 * Studionet reaches consensus slowly — validators propose, commit, and reveal
 * over what can stretch into minutes. Wait a long time before giving up: a
 * premature failure is far worse than a long spinner, and a receipt that
 * arrives late is still a good receipt. Polling at 5s keeps the request rate
 * well under the node's 30/min ceiling.
 */
export const CONSENSUS_WAIT = {
  intervalMs: 5000,
  /** 120 × 5s ≈ 10 minutes: comfortably past any honest consensus round. */
  retries: 120,
} as const;

function leaderFailure(receipt: ProtocolReceipt): string | null {
  const leader = receipt?.consensus_data?.leader_receipt?.[0];
  if (!leader) return null;
  const status = leader.result?.status;
  if (leader.execution_result === "SUCCESS" && (status === undefined || status === "return")) {
    return null;
  }
  const parts: string[] = [];
  if (leader.execution_result && leader.execution_result !== "SUCCESS") {
    parts.push(leader.execution_result);
  }
  if (leader.error_code) parts.push(String(leader.error_code));
  const payload = leader.result?.payload;
  if (payload !== undefined && payload !== null) {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    parts.push(text);
  }
  return parts.join(" · ") || "the contract rejected the call";
}

/** The hash a receipt claims for itself, if the node echoed one at all. */
function receiptHash(receipt: ProtocolReceipt): string | null {
  const got = receipt?.transaction_hash ?? receipt?.hash;
  return got ? String(got) : null;
}

export function humanizeError(error: unknown): string {
  const message = messageOf(error);
  const code =
    (error as { code?: number })?.code ?? (error as { cause?: { code?: number } })?.cause?.code;
  if (code === 4001 || /user rejected|rejected the request|denied/i.test(message)) {
    return "Rejected in the wallet.";
  }
  if (/chain/i.test(message) && /mismatch|not the expected|wrong/i.test(message)) {
    return "Wallet is on the wrong network. Switch to Genlayer Studio Network.";
  }
  if (/rate limit|-32029|retry_after/i.test(message)) {
    return "The Studio node is rate-limiting requests. Give it a few seconds, then try again.";
  }
  if (/insufficient funds|exceeds balance/i.test(message)) {
    return "Not enough GEN to cover this action.";
  }
  if (/timeout|timed out|gave up|deadline/i.test(message)) {
    return "This is taking longer than usual. It may still settle — refresh the ledger in a minute before retrying.";
  }
  return message || "The call failed.";
}

/** Wait out consensus, retrying only genuinely transient RPC noise. */
async function waitForReceipt(client: Client, hash: string): Promise<ProtocolReceipt> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await client.waitForTransactionReceipt({
        hash,
        status: "ACCEPTED",
        interval: CONSENSUS_WAIT.intervalMs,
        retries: CONSENSUS_WAIT.retries,
      });
    } catch (error) {
      lastError = error;
      if (!isTransient(error)) throw error;
      await sleep(4000 * (attempt + 1));
    }
  }
  throw lastError;
}

/**
 * Submit a write, wait out consensus, and resolve to a settled receipt.
 *
 * `onPhase` narrates the wait for the UI (signing → waiting → confirmed). The
 * receipt is only trusted once its own hash matches the one just submitted — a
 * node hiccup that returns an earlier transaction's receipt must never be read
 * as this call's outcome.
 */
export async function submit(
  client: Client,
  functionName: string,
  args: unknown[] = [],
  value = 0n,
  onPhase?: PhaseReporter,
): Promise<WriteResult> {
  onPhase?.("signing");
  let hash: string;
  try {
    hash = String(
      await client.writeContract({
        address: ADDRESS,
        functionName,
        args,
        value,
        consensusMaxRotations: 5,
      }),
    );
  } catch (error) {
    return { ok: false, message: humanizeError(error) };
  }

  onPhase?.("waiting");
  let receipt: ProtocolReceipt;
  try {
    receipt = await waitForReceipt(client, hash);
  } catch (error) {
    return { ok: false, message: humanizeError(error), hash };
  }

  const echoed = receiptHash(receipt);
  if (echoed && echoed.toLowerCase() !== hash.toLowerCase()) {
    return {
      ok: false,
      message:
        "The node returned a receipt for a different transaction. Refresh and check the ledger before retrying.",
      hash,
    };
  }

  const failure = leaderFailure(receipt);
  if (failure) {
    const clean = failure.replace(/\[(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\]\s*/g, "");
    return { ok: false, message: clean, hash };
  }

  onPhase?.("confirmed");
  return { ok: true, hash, receipt };
}

export const openDeal = (
  client: Client,
  input: {
    seller: string;
    title: string;
    termsJson: string;
    deadlineUnix: number;
    evidenceUrls: string[];
  },
  onPhase?: PhaseReporter,
) =>
  submit(
    client,
    "open_deal",
    [input.seller, input.title, input.termsJson, input.deadlineUnix, input.evidenceUrls],
    0n,
    onPhase,
  );

export const fundDeal = (client: Client, id: string, amount: bigint, onPhase?: PhaseReporter) =>
  submit(client, "fund_deal", [id], amount, onPhase);

export const acceptDeal = (client: Client, id: string, onPhase?: PhaseReporter) =>
  submit(client, "accept_deal", [id], 0n, onPhase);
export const cancelDeal = (client: Client, id: string, onPhase?: PhaseReporter) =>
  submit(client, "cancel_deal", [id], 0n, onPhase);

export const submitDelivery = (
  client: Client,
  id: string,
  url: string,
  note: string,
  onPhase?: PhaseReporter,
) => submit(client, "submit_delivery", [id, url, note], 0n, onPhase);

export const confirmDelivery = (client: Client, id: string, onPhase?: PhaseReporter) =>
  submit(client, "confirm_delivery", [id], 0n, onPhase);

export const raiseDispute = (client: Client, id: string, reason: string, onPhase?: PhaseReporter) =>
  submit(client, "raise_dispute", [id, reason], 0n, onPhase);

export const submitEvidence = (
  client: Client,
  id: string,
  url: string,
  statement: string,
  onPhase?: PhaseReporter,
) => submit(client, "submit_evidence", [id, url, statement], 0n, onPhase);

export const resolve = (client: Client, id: string, onPhase?: PhaseReporter) =>
  submit(client, "resolve", [id], 0n, onPhase);
export const appeal = (client: Client, id: string, bond: bigint, onPhase?: PhaseReporter) =>
  submit(client, "appeal", [id], bond, onPhase);
export const resolveAppeal = (client: Client, id: string, onPhase?: PhaseReporter) =>
  submit(client, "resolve_appeal", [id], 0n, onPhase);
export const finalize = (client: Client, id: string, onPhase?: PhaseReporter) =>
  submit(client, "finalize", [id], 0n, onPhase);
export const claimTimeout = (client: Client, id: string, onPhase?: PhaseReporter) =>
  submit(client, "claim_timeout", [id], 0n, onPhase);
