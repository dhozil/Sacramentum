# Response to the Steward Review — Sacramentum

Reassessment package: what was fixed, how, and how it is verified.

| Item | Type | Status |
| --- | --- | --- |
| 1. Delivery deadline not enforced by `submit_delivery()` | Blocking | Fixed |
| 2. Inconclusive disputes/appeals can lock escrow and bond | Blocking | Fixed |
| 3. Partial payouts agree within 500 bps | Recommended | Tightened to 250 bps |
| 4. "Panel reads only initially committed sources" | Recommended | Clarified (code already merged filed URLs) |
| 5. Bounced outgoing transfers | Recommended | Tested + documented |
| 6. Frontend accepted execution vs finalized settlement | Recommended | Fixed |

Contract source: `contracts/sacramentum.py` (class `Sacramentum`).
The two blocking issues are resolved in source and covered by direct-mode
regression tests. A redeploy is required for the new bytecode to be live; see
"Deployment status" at the end.

---

## 1. Blocking — late delivery could beat the buyer's refund

### What changed

`submit_delivery()` now refuses any delivery after `deadline_unix`:

```python
if _now_unix() > int(deal.deadline_unix):
    raise gl.vm.UserError(
        f"[EXPECTED] the delivery deadline for {deal_id} has passed; "
        "the buyer may claim a refund"
    )
```

The seller can no longer move an overdue `ACCEPTED` deal to `DELIVERED`, so the
buyer's `claim_timeout()` refund stays available and no one-hour dispute window
can be manufactured after the deadline.

Timeliness is also surfaced to the adjudication panel. The prompt now carries:

```
DELIVERY TIMING:
deadline_unix: ...
delivered_at_unix: ...
on_time: yes|no
```

with the instruction: *"If the terms make timeliness a criterion, treat
on_time=no as failing it."* (Strictly, deliveries are now always on time; the
block is defensive and keeps the timing auditable in the stored report.)

### Regression tests

- `test_late_delivery_is_rejected_after_the_deadline` — one second past the
  deadline: `submit_delivery` reverts, the deal stays `ACCEPTED`, and
  `claim_timeout` then refunds the buyer in full; conservation holds.
- `test_on_time_delivery_wins_the_race_against_cancel` — delivery lands first:
  the buyer's `cancel_deal` reverts (`cannot be cancelled from DELIVERED`).
- `test_cancel_wins_the_race_against_a_later_delivery` — cancellation lands
  first: the seller's later `submit_delivery` reverts (`is not accepted`).

Both orderings are deterministic because each call re-checks the stored status.

---

## 2. Blocking — inconclusive adjudication could freeze escrow and bond

### What changed

New constant:

```python
UNRESOLVED_GRACE_SEC = 3600
```

New per-deal timestamps (also exposed through the views):

- `unresolved_at_unix` — stamped whenever a round returns `UNDETERMINED`;
  cleared when a round decides. A fresh `resolve()` restarts the clock.
- `appeal_filed_at_unix` — stamped by `appeal()`.

`claim_timeout()` is extended from the funded/delivered backstop into the full
liveness backstop. It now also closes:

**a) DISPUTED** — after the recovery window:
- if a round already returned `UNDETERMINED`: `unresolved_at_unix + UNRESOLVED_GRACE_SEC`;
- if `resolve()` was never called: `dispute_opened_at_unix + EVIDENCE_WINDOW_SEC + UNRESOLVED_GRACE_SEC`.

Rule: a neutral **50/50 split** of the escrow (`release_bps = 5000`,
`outcome = PARTIAL`, `status = FINALIZED`, `final = true`). Neither party is
punished for a panel that cannot decide, and neither side can stall the escrow
by keeping the evidence unreadable. The odd atto (if any) goes to the buyer.

**b) APPEALED** — after the recovery window:
- if a round already returned `UNDETERMINED`: `unresolved_at_unix + UNRESOLVED_GRACE_SEC`;
- if `resolve_appeal()` was never called: `appeal_filed_at_unix + UNRESOLVED_GRACE_SEC`.

Rule: **uphold the first-round verdict** (the inconclusive appeal is not a
losing appeal) and **return the bond to the appellant**. `appeal_decided` and
`final` are set, the deal ends `FINALIZED`.

Before the window, `claim_timeout()` reverts with a message that names the
alternative (`resolve()` / `resolve_appeal()` may still decide it).

### Tests

- `test_claim_timeout_waits_for_the_recovery_grace` — refuses before the grace;
  splits 50/50 after it; `total_released = 5 GEN`, `total_refunded = 5 GEN`,
  `held = 0`, `conserved = true`.
- `test_claim_timeout_recovers_a_dispute_that_was_never_adjudicated` — escrow
  cannot stay stuck even if nobody ever calls `resolve()`.
- `test_claim_timeout_returns_the_bond_and_upholds_an_undetermined_appeal` —
  round-one verdict stands, escrow follows it, bond returns to the appellant,
  `lifetime_outflow = escrow + bond`, `conserved = true`.
- `test_claim_timeout_recovers_an_appeal_that_was_never_decided` — appeal filed
  but never reviewed; round-one `NON_COMPLIANT` is upheld.

---

## 3. Recommended — closer validator agreement on partial payouts

`RELEASE_TOLERANCE_BPS` **500 → 250**.

`release_bps` is quantized to `RELEASE_BUCKET_BPS = 500`, so a tolerance below
the bucket width forces two validators to agree on the **exact** partial
bucket. A financially binding split can no longer pass with a materially
different payout.

`get_verdict().equivalence` publishes the rule from the constants, so the UI
and auditors see `tolerance_bps: 250` without a second source of truth.

Tests:

- `test_validator_accepts_the_same_partial_bucket` — same 5000 bps bucket,
  different confidence/rationale → accepted.
- `test_validator_rejects_a_materially_different_partial_payout` — 5000 vs 5500
  → rejected.
- `test_validator_rejects_a_different_outcome` — unchanged.

---

## 4. Recommended — evidence URLs after funding (clarification)

The contract already merged party-filed URLs into what the panel reads:
`_evidence_urls()` = committed manifest **plus** every `https://` URL filed via
`submit_evidence()`, de-duplicated and capped at 8 (3 baseline + up to 3 per
party). No behavior change was needed; the misleading statement was in the
docs/UI.

Clarified in:

- `open_deal` docstring — the committed manifest is the immutable **baseline**;
  up to `MAX_EVIDENCE_PER_PARTY` additional https URLs per party may be filed
  during a dispute and are also read.
- Frontend delivery hint — names the baseline plus filed evidence URLs.
- Adjudication prompt already labels filed evidence as *"untrusted claims,
  weigh against the sources"*.

---

## 5. Recommended — bounced outgoing transfers

`__on_errored_message__()` already rejoins a bounced payout to `held_atto` and
reverses `lifetime_outflow`, preserving
`held == lifetime_inflow - lifetime_outflow`. This is now covered by a test:

- `test_bounced_payout_rejoins_held_value` — after a full release (`held = 0`),
  a 10 GEN bounce returns the value: `held = 10 GEN`, `outflow = 0`,
  `conserved = true`.

**Limitation, stated honestly:** the GenVM error callback is deal-agnostic, so
the returned value cannot be attributed back to the specific `Deal` that paid
it out. Per-deal automatic re-payment is therefore not implemented; the value
is held by the contract (conservation holds) rather than lost. A bounce only
occurs when a recipient address rejects the transfer, which cannot happen for
the plain accounts this contract pays in normal operation.

---

## 6. Recommended — accepted execution vs finalized settlement (frontend)

Consensus `ACCEPTED` is no longer reported as "settled".

`lib/sacramentum.ts`:

- New phases: `confirming` and `accepted` (plus `waiting`, `confirmed`).
- Every write passes a `StateVerifier`: after consensus the client **reads the
  contract back** and only reports `confirmed` when the expected state is
  observable. `WriteResult` now carries `stateConfirmed`.
  - status-based reads for fund/accept/cancel/deliver/confirm/dispute/appeal/
    finalize/claim_timeout;
  - `open_deal` → new id in `get_deal_ids`;
  - `submit_evidence` → evidence count increased;
  - `resolve` → decided, or a fresh `unresolved_at_unix`;
  - `resolve_appeal` → new verdict round.
- Bounded confirmation budget (10 × 3 s) so a done write never becomes an
  endless spinner.

UI (`components/deal/action-panel.tsx`):

- busy copy: `Signing…` → `Waiting for consensus…` → `Confirming state…`;
- success: green **"State change confirmed on-chain."** only when the read-back
  succeeded;
- otherwise amber **"Accepted by consensus, but the ledger has not shown the
  state change yet. Refresh…"**.

Also in the UI: the delivery form is disabled after the deadline with an
explicit explanation, and DISPUTED/APPEALED deals show the recovery time and a
permissionless **Split & close** / **Uphold & close** action once open.

---

## GenLayer documentation conformance (re-audit)

Checked against the current docs (transaction context, messages, value
transfers, special methods, dataclasses, non-determinism/equivalence, error
handling):

- `datetime.now(timezone.utc)` is valid: GenVM pins the clock to the
  transaction timestamp, so every validator sees the same instant
  (transaction-context docs). Deadline and grace arithmetic is deterministic.
- Payouts use `emit_transfer` through an `@gl.evm.contract_interface`, which the
  messages docs restrict to `on='finalized'` — the default we rely on.
- `__on_errored_message__` is the documented refund hook and is decorated
  `@gl.public.write.payable`; it reads `gl.message.value` and restores
  `held_atto`.
- The validator reruns the full leader task and compares only `outcome` and
  `release_bps`; it is not a leader-output-only check.
- Errors use the documented prefix scheme (`[EXPECTED]`, `[EXTERNAL]`,
  `[TRANSIENT]`, `[LLM_ERROR]`) with `gl.vm.UserError`.
- Storage uses `TreeMap`/`DynArray`, `@allow_storage` dataclasses, atto-scale
  `u256` for money, and no floats in settlement.
- Two layout/semantics fixes from this pass: the new `Deal` timestamps are now
  appended at the end of the dataclass (positional storage layout), and
  `get_deal.recovery_at_unix` returns `0` unless the status is DISPUTED or
  APPEALED.
- Lint note: `I200` reports a newer runner hash than the pinned one. The pinned
  hash is the documented, network-accepted version; bumping it is a separate
  decision.

---

## Verification

| Check | Result |
| --- | --- |
| `genvm-lint check contracts/sacramentum.py --json` | ok — 3/3 lint, 21 methods (8 view, 13 write); `I200` runner-version note |
| `python -m pytest tests -q` | **42 passed, 5 skipped** |
| `npm run test:sync` | **41 passed, 0 failed** |
| `npm run verify` (live, fresh deploy) | **38 passed, 0 failed** |
| `deploy/stewardLiveTest.ts` (live) | **31 passed, 0 failed** |
| `npm run test:frontend` (live, read-only) | **12 passed, 0 failed** |
| `npm run test:frontend:full` (live write path) | **29 passed, 0 failed** |
| `frontend` `npm run lint` | clean |
| `frontend` `npm run build` | succeeds (`/api/rpc` dynamic) |

Money invariants are asserted in every new test (`conserved == true`,
`held_atto == 0` after settlement).

---

## Live verification on the new deployment

Deployed 2026-10-22 on Studionet (chain `61999`):
**`0x9b3790A80972EE0a052022b2B595489573ec5361`**.

`npm run verify` ran on a fresh deploy of exactly this code: **38/38**. Then
`node deploy/stewardLiveTest.ts --address 0x9b37…` added the steward-specific
checks: **31/31**. That script is committed, so the checks are reproducible
against any deployment.

### Blocking #1 — deadline cannot be bypassed

Deal `d5` (0.01 GEN): funded, accepted, then the deadline was allowed to pass.

- `submit_delivery` reverted with
  `[EXPECTED] the delivery deadline for d5 has passed; the buyer may claim a refund`
  (tx `0x81d7e7e0dfbcad8b0d1ea6952a5d8c0654f476a8f3ea56635725c1af627d96df`).
- The deal stayed `ACCEPTED`; the late call changed nothing.
- `claim_timeout` then refunded the buyer
  (tx `0xdc4de37cf65beaf9e54a8f03bd20fc89b20a61e86f205e6ad98a9f165dd1c5ca`),
  leaving `d5 = REFUNDED` and the ledger conserved.
- On-time delivery still works on the same build (`d4` and `d6` both reached
  `DELIVERED` before their deadlines).

### Blocking #2 — recovery is bounded and visible

Deal `d6`: delivered on time, then disputed by the buyer.

- `get_deal(d6).recovery_at_unix` was `0` for OPEN/FUNDED/ACCEPTED/DELIVERED
  and became `2026-10-22T05:56:41Z` once the deal was `DISPUTED`
  (evidence window + grace).
- `claim_timeout(d6)` before that instant reverted with
  `[EXPECTED] the dispute for d6 is not yet recoverable; resolve() may still decide it`
  (tx `0xb26ad96688c2db8461cdc3949dc2ceeca820e154171b50fe73abaf4fe123847e`),
  proving the recovery cannot fire early.
- The *positive* outcomes (neutral 50/50 split, and upholding an undetermined
  appeal with the bond returned to the appellant) require advancing the chain
  clock past the grace. Studionet has no clock jump, so those are proven in
  direct mode with `direct_vm.warp`:
  `test_claim_timeout_recovers_a_dispute_that_was_never_adjudicated`,
  `test_claim_timeout_recovers_an_appeal_that_was_never_decided`, and
  `test_claim_timeout_returns_the_bond_and_upholds_an_undetermined_appeal`.
  `d6` is left `DISPUTED` on purpose and becomes recoverable at the timestamp
  above; anyone may then call `claim_timeout` permissionlessly.

### Recommended #3 — partial-payout agreement is published

- `get_verdict(d6).equivalence.release_bps` = `{bucket_width_bps: 500,
  tolerance_bps: 250}` on the live build.
- `get_verdict(d4)` (two rounds: first + appeal) returns both rounds plus the
  equivalence block and evidence digest.

### Recommended #4 — evidence after funding is accepted

- The buyer filed an https evidence URL on `d6` after the escrow was locked
  (tx `0x46606ed294e3001c87ba05fc7a58b6704e0822fada6e80e947d514cdf70de48e`);
  `get_deal_audit(d6).evidence.length` went `0 -> 1`, and the committed manifest
  is still in `get_deal`/`get_terms`.

### Recommended #5 — bounced transfers

Not forceable on-chain from a funded EOA (a payout has to fail at the recipient).
Covered by the direct test `test_bounced_payout_rejoins_held_value`, which
asserts `held_atto` is restored and `conserved` stays true.

### Recommended #6 — accepted execution vs finalized settlement

`test:frontend:full` ran the whole path through the frontend wrappers on this
deployment and observed `signing -> waiting -> confirming -> confirmed`, then
settled `d7` (0.01 GEN buyer -> seller, `RELEASED/COMPLIANT`). A rejected call
resolved to `ok:false` with the on-chain reason and narrated only
`signing -> waiting` — no false "confirmed".

### Transaction references (deals d5/d6)

| Step | Deal | Tx |
| --- | --- | --- |
| open | d5 | `0xaad34dc655bc716d353926833034a2bccce086400cce2311baf054fbb9f18b2a` |
| fund 0.01 GEN | d5 | `0x18651821e96db7b0c005f2e03785fc7c7ab42229443c7c734593cab6d9f89fa3` |
| accept | d5 | `0xc2faa79e79bc50cbe7e92fb9d8dcd84b22573bbf14482dfdeb395dea48ee3806` |
| late delivery rejected | d5 | `0x81d7e7e0dfbcad8b0d1ea6952a5d8c0654f476a8f3ea56635725c1af627d96df` |
| timeout refund | d5 | `0xdc4de37cf65beaf9e54a8f03bd20fc89b20a61e86f205e6ad98a9f165dd1c5ca` |
| open | d6 | `0x0d878932aa9bcc16cd17fdbb5607e3fd578d3eb75b4ed74d2cce39bc9dfc6db7` |
| deliver (on time) | d6 | `0x92e076e605d9b0f78f97d2ad33007524bbfae1796d8590b1fee99127076985e8` |
| dispute | d6 | `0x1a8c116387d4c105b469be5c694c585bce51009d1f3fc724a327c69df4902e9e` |
| evidence after funding | d6 | `0x46606ed294e3001c87ba05fc7a58b6704e0822fada6e80e947d514cdf70de48e` |
| early recovery refused | d6 | `0xb26ad96688c2db8461cdc3949dc2ceeca820e154171b50fe73abaf4fe123847e` |

---

## Files changed

- `contracts/sacramentum.py`
  - deadline check in `submit_delivery`;
  - `UNRESOLVED_GRACE_SEC`, `RELEASE_TOLERANCE_BPS` 250;
  - `Deal.unresolved_at_unix`, `Deal.appeal_filed_at_unix`;
  - `_unresolved_recovery_at`, `_settle_unresolved_dispute`, `_uphold_first_round`;
  - `claim_timeout` handles DISPUTED/APPEALED;
  - timing block in `_adjudication_inputs` / prompt;
  - `get_deal` / `get_deal_audit` expose the timestamps (`recovery_at_unix`);
  - clarified `open_deal` docstring.
- `tests/test_sacramentum.py` — 10 new tests; partial-tolerance tests updated.
- `deploy/stewardLiveTest.ts` (new) — live checks for the stewarded guards
  (deadline rejection, recovery window, tolerance, evidence after funding).
- `tests/frontendSync.ts` — `UNRESOLVED_GRACE_SEC` mapped.
- `frontend/src/lib/sacramentum.ts` — phases, `StateVerifier`, read-back
  confirmation, constants, deal/audit fields.
- `frontend/src/hooks/use-tx.ts` — reports `accepted` vs `confirmed`.
- `frontend/src/components/deal/action-panel.tsx` — acceptance/finality copy,
  deadline guard, recovery actions.

## Deployment status

Deployed and verified:

- Contract: `0x9b3790A80972EE0a052022b2B595489573ec5361` (Studionet).
- Frontend default (`frontend/src/lib/sacramentum.ts`), `frontend/.env.local`
  and `frontend/.env.example` point at it.
- The previous `0x0DA8…` build is superseded and no longer referenced.
- Re-run the live checks with
  `node deploy/stewardLiveTest.ts --address 0x9b3790A80972EE0a052022b2B595489573ec5361`;
  `npm run verify` still requires a fresh (empty) deploy.
