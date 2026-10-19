<p align="center">
  <img src="assets/logo.svg" alt="Sacramentum" width="112" height="112" />
</p>

<h1 align="center">Sacramentum</h1>

<p align="center">
  <b>An escrow tribunal for agentic marketplaces.</b><br/>
  A buyer locks GEN against a machine-readable deliverable spec. Funds release only when a
  panel of GenLayer validators — reading the committed evidence — agrees the work satisfies
  that spec. Either party can contest a verdict once by staking an appeal bond, and the loser
  forfeits it. Nothing is decided by a trusted operator.
</p>

<p align="center">
  <img alt="GenLayer" src="https://img.shields.io/badge/GenLayer-intelligent_contract-c9a25b?style=flat-square&amp;labelColor=0e141a" />
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16.4-000000?style=flat-square&amp;logo=nextdotjs&amp;logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-0e141a?style=flat-square&amp;logo=react&amp;logoColor=c9a25b" />
  <img alt="Studionet" src="https://img.shields.io/badge/Studionet-61999-0e141a?style=flat-square&amp;labelColor=c9a25b" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-4_layers-c9a25b?style=flat-square&amp;labelColor=0e141a" />
</p>

---

> **The name is Roman.** A *sacramentum* was the stake both parties deposited in
> the oldest Roman trial. The loser's stake was forfeited. The bonded appeal is
> the same idea, onchain.

## At a glance

| | |
| --- | --- |
| **Contract** | `0x0DA83e6200318ca83C6C9ed77C3dCE6bdec60Bd6` on Studionet |
| **Chain** | GenLayer Studionet · id `61999` (`0xF22F`) |
| **Interface** | 13 writes · 8 views · no constructor args |
| **Consensus** | leader/validator round comparing `outcome` + `release_bps` only |
| **Frontend** | Next.js 16 · React 19 · Tailwind v4, talks to the RPC directly |
| **Verification** | 39 passed / 0 failed on-chain (write + read, balance deltas) |

## Lifecycle

```
OPEN -> FUNDED -> ACCEPTED -> DELIVERED ---- confirm ------> RELEASED
                                   |                          (buyer, instant)
                                   raise_dispute
                                   v
                               DISPUTED --resolve--> RESOLVED --appeal--> APPEALED
                                   |                    |                    |
                                   |                    |               resolve_appeal
                           claim_timeout          finalize (no appeal)        |
                                   |                    |                    |
                                   v                    v                    v
                               REFUNDED             FINALIZED  <---- finalize
```

- `confirm_delivery` is the happy path: the buyer releases the escrow at once.
- `cancel_deal` and a missed-deadline `claim_timeout` refund the buyer before
  delivery; an undisputed delivery past the dispute window releases to the seller.
- `resolve` is permissionless. It refuses to run until both parties have filed
  evidence or the evidence window has lapsed, so neither side is judged early.
- `finalize` is the only place money moves on the disputed path, once an appeal
  was decided or the unappealed appeal window has closed.

## The flow, end to end

Three roles: the **buyer** writes and funds the deal, the **seller** accepts and
delivers, and **anyone** can run the permissionless steps that keep a deal from
stalling (adjudicate, finalize, claim a timeout).

1. **Open** (`open_deal`, buyer). The buyer posts a title, a deadline, a
   deliverable spec, the criteria the panel will check, and the evidence sources
   it may read (max 3). The terms are canonicalised and hashed into a digest
   here; they can never change. `OPEN`.
2. **Fund** (`fund_deal`, buyer). The buyer sends GEN. The escrow is exactly what
   is sent — the contract custodies it, nobody else. `FUNDED`.
3. **Accept** (`accept_deal`, seller). The seller binds to the frozen terms.
   `ACCEPTED`.
4. **Deliver** (`submit_delivery`, seller). An `https://` link plus a note. A
   one-hour dispute window opens. `DELIVERED`.
5. **Confirm or contest.**
   - `confirm_delivery` (buyer) pays the seller the whole escrow at once. `RELEASED`.
   - `raise_dispute` (either party, within the window) starts the tribunal and
     both sides file evidence (`submit_evidence`, up to 3 filings each, within a
     30-minute evidence window). `DISPUTED`.
6. **Adjudicate** (`resolve`, anyone). Runs only once both parties have filed or
   the evidence window has lapsed. A leader/validator round reads the committed
   sources and rules on the delivery, setting an outcome and a split and opening
   a one-hour appeal window. `RESOLVED`.
7. **Appeal, once** (`appeal` + `resolve_appeal`). Either party may stake a bond
   (25% of the escrow, floor 0.001 GEN) to demand a second panel. Its verdict is
   final, and the loser forfeits the bond to the other party. `APPEALED → RESOLVED`.
8. **Finalize** (`finalize`, anyone). Once the appeal is decided or the
   unappealed window has closed, the escrow is split by `release_bps` and the
   bond is settled — the only place money moves on the disputed path.
   `FINALIZED`.

Two backstops keep funds from ever sticking: `cancel_deal` (buyer, before
delivery) and `claim_timeout` (anyone) — a missed deadline refunds the buyer, and
an undisputed delivery past the window pays the seller.

The frontend mirrors this exactly: `/open` writes the terms, `/market` lists
deals, and `/deal/[id]` shows only the actions available to the connected wallet
for that deal's current state, alongside the panel's verdict and the filed
evidence.

## How consensus works

`resolve` / `resolve_appeal` run a leader/validator round
(`gl.vm.run_nondet_unsafe`). The leader fetches every committed source, frames
the pages as untrusted data, and asks the model to rule the delivery against the
terms. Validators rerun the same task independently and compare only the fields
that carry the decision:

- `outcome` — compared exactly (`COMPLIANT` / `NON_COMPLIANT` / `PARTIAL` /
  `UNDETERMINED`).
- `release_bps` — quantized to a bucket; `PARTIAL` splits are compared within a
  tolerance so two reasonable models converge.

Everything else — the model's self-reported `confidence`, the rationale and the
per-criterion breakdown — is stored for audit but never gates consensus. Two
honest models routinely report different certainty or name different criterion
subsets while agreeing on the payout, so comparing those fields would fail
consensus on noise. If no evidence source can be read at all, the round aborts
transiently and is retried rather than judging emptiness.

`get_verdict(deal_id)` is the read a frontend uses to explain a result rather
than just show it: it returns each adjudication round as the model produced it
(decision fields, the buckets consensus actually compared, a fingerprint of the
evidence that was read, and the raw model output) plus the equivalence rule the
validators applied.

## Money safety

`held_atto` only ever covers escrow plus posted appeal bonds, and every terminal
path distributes exactly that. The contract exposes the identity
`held_atto == lifetime_inflow - lifetime_outflow` as `conserved` in `get_stats`,
so the invariant is checkable rather than merely asserted. The contract never
divides by a float; release shares are integer basis points.

## Contract surface

| Writes (13) | Views (8) |
| --- | --- |
| `open_deal` · `fund_deal` · `accept_deal` | `get_deal` · `get_terms` · `get_deal_audit` |
| `cancel_deal` · `submit_delivery` · `confirm_delivery` | `get_verdict` · `get_deal_ids` · `get_deal_count` |
| `raise_dispute` · `submit_evidence` · `resolve` | `get_stats` · `get_log` |
| `appeal` · `resolve_appeal` · `finalize` · `claim_timeout` | |

`__on_errored_message__` is the runtime's error callback and cannot be called by hand.

## Layout

```
contracts/sacramentum.py        the intelligent contract (GenVM entry point)
tests/test_sacramentum.py       direct-mode tests (in-process, mocked web + LLM)
tests/integration/              consensus tests against a real network
tests/frontendSync.ts           frontend <-> contract sync (static, no network)
tests/frontendIntegration.ts    frontend helpers vs the live contract
deploy/deployScript.ts          deploy to Studionet and read it back
deploy/demoScript.ts            drive every method end-to-end on Studionet
deploy/verifyScript.ts          on-chain audit: every guard plus GEN balance deltas
scripts/studionet.cjs           shared Studionet driver (pacing, receipt checks)
scripts/newWallet.cjs           create a signing wallet (writes key, prints address)
frontend/                       Next.js 16 app (see frontend/AGENTS.md)
gltest.config.yaml              test config (no networks block, by design)
```

## Testing

Four layers, from cheapest to most real:

```bash
# 1. Lint and validate against the pinned GenVM runner
genvm-lint check contracts/sacramentum.py --json

# 2. Direct mode: the contract runs in-process with mocked web + LLM calls
python -m pytest tests -v

# 3. Integration: real leader/validator consensus, real web fetch, real model
gltest tests/integration -v -s --network studionet
gltest tests/integration -v -s -m slow --network studionet   # the model-calling tests

# 4. Frontend: the UI's own helpers, checked against the contract
npm run test:sync            # static: methods, args, constants, statuses in lockstep
npm run test:frontend        # live reads of the deployed contract through the UI readers
npm run test:frontend:write  # adds the write/error path (needs the buyer key)
npm run test:frontend:full   # full happy path: moves 0.01 GEN escrow buyer -> seller
```

The lint step prints a Unicode check mark that a Windows console cannot encode;
`--json` avoids the noise. The direct-mode tests drive the validator function
directly through `direct_vm.run_validator()` to exercise consensus agreement and
disagreement without a network. Integration tests skip cleanly when run under
plain pytest or when no node answers.

The contract pins an exact GenVM runner in its first line. The network rejects
the `test`/`latest` aliases, so that hash is deliberate.

## Deploying to Studionet

```bash
npm run deploy:dry   # prints what it would do, sends nothing
npm run deploy       # deploys and reads the contract back to prove it is real
npm run demo         # deploys fresh and exercises every write path and view
```

The driver lives in `scripts/studionet.cjs` and is used by `deploy/deployScript.ts`.
It exists because Studionet has sharp edges: Cloudflare only lets browser-like
User-Agents through (so the Python SDK cannot reach it), a transaction can reach
FINALIZED and still have rolled back, and the RPC is rate limited. The driver
paces calls, backs off on `retry_after_seconds`, verifies each receipt's hash
against the transaction it submitted, and reads `consensus_data.leader_receipt`
to decide whether the leader actually returned. A deploy is only reported as
successful after the contract is read back.

The deployer key is read from `DEPLOYER_PRIVATE_KEY`, or from the project wallet
at `D:\Genlayer-project\wallet\.env` (its `GENLAYER_DEV_KEY`). Override the wallet
location with `SACRAMENTUM_KEY_FILE`. Keys are never read from a committed file.

The seller key for the buyer/seller scenarios comes from `SACRAMENTUM_SELLER_KEY`,
or from `wallet\seller.env`. Create a fresh signing wallet (writes the key
straight to disk, prints only the address) with:

```bash
node scripts/newWallet.cjs seller
```

`npm run demo` needs two signing accounts (buyer and seller), read as above. It
runs the happy path, a cancellation, a deadline-miss refund, and the full
disputed path through real consensus (`resolve`, `appeal`, `resolve_appeal`,
`finalize`), then prints `get_verdict` for the disputed deal.

`npm run verify` is the stricter companion. It asserts, from the actual account
balances, that every payout path moves exactly the right amount:
`confirm_delivery` pays the seller the escrow, `cancel_deal` and `claim_timeout`
refund the buyer, and `finalize` splits the escrow and settles the appeal bond
(paid to the winner). It also drives every guard and confirms the state
transitions. Each movement is measured against a balance taken immediately
before the call, so nothing else can contaminate the delta.

```bash
npm run verify                                  # deploys fresh, then verifies it
node deploy/verifyScript.ts --address 0x...     # verify an already-deployed one
```

With `--address` (or `SACRAMENTUM_ADDRESS`) the script attaches to the existing
contract instead of deploying. That contract must be empty; the scenario uses
deal ids `d1`..`d4`, and the script refuses to run against one that already
holds deals.

Note the accounting subtlety it encodes: a reverting payable call does not
refund its attached value on Studionet, so the verifier never sends value to a
call it expects to revert.

## Live deployment

```
contract  0x0DA83e6200318ca83C6C9ed77C3dCE6bdec60Bd6
tx        0x65f15e8753607534d4d2bacbea46985609fc569a54e3a9ba9f3568354ec841d0
```

Last verified against that address live (write + read, buyer `0x3958…98E0`,
seller `0x99bF…5Db3`): **39 passed, 0 failed**.
