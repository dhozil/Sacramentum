# AGENTS.md — Sacramentum

Durable project notes for agents working in this repo. Read this first.

## What this is
GenLayer "agentic escrow tribunal". GEN is released only when a deliverable
passes machine-readable terms, adjudicated by AI validators with one bonded
appeal round. Repo folder stays
`D:\Genlayer-project\Agentic-marketplace-disputes` (do not rename it).

## Layout
- `contracts/sacramentum.py` — the intelligent contract (class `Sacramentum`).
- `deploy/` — `deployScript.ts`, `demoScript.ts`, `verifyScript.ts`.
- `scripts/` — `studionet.cjs` (RPC driver), `newWallet.cjs`.
- `tests/` — Python direct/integration tests, plus the Node frontend checks
  `frontendSync.ts` (static) and `frontendIntegration.ts` (live).
- `frontend/` — Next.js 16 app (see `frontend/AGENTS.md` for Next-specific rules).

## Commands (Windows, PowerShell 7)
- Lint contract: `genvm-lint check contracts/sacramentum.py --json` (always
  `--json`; the human output crashes on U+2713 in cp1252).
- Direct tests: `python -m pytest tests -q`.
- Deploy: `npm run deploy` (`npm run deploy:dry` for a dry run).
- Demo: `npm run demo` (exit 0).
- Verify on-chain: `npm run verify`
  (or `node deploy/verifyScript.ts --address <0x…>` to attach to a deployment).
- Frontend ↔ contract sync (no network, fast): `npm run test:sync`.
- Frontend ↔ live contract (read-only): `npm run test:frontend`
  (`npm run test:frontend:write` adds the error-path write; `--full` adds a real
  `open_deal` round-trip that creates one OPEN deal).
- Frontend: in `frontend/` run `npm run lint`, `npm run build`, `npm run dev`.

## Durable facts / decisions
- First line of the contract pins the runner:
  `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`
  (the network rejects `test`/`latest`).
- 21 methods = 8 view + 13 write. `open_deal` ids are `d` + count, so `d1..dN`.
- Consensus via `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`. Equivalence
  compares ONLY `outcome` (exact) + `release_bps` (exact except PARTIAL,
  tolerance 500). `confidence` is audit-only — comparing it caused frequent
  `contract_error`. rationale/satisfied/model_output are audit-only too.
- `get_deal` has NO `appellant`/`first_release_bps`; those live in
  `get_deal_audit`. `get_verdict(deal_id)` returns `rounds[]` (slot 0 first,
  slot 1 appeal) + a static `equivalence` block; stored in
  `deal_reports: TreeMap[str, DynArray[str]]`.
- `get_log` returns a canonical JSON array of JSON-encoded strings — callers must
  parse twice.
- Integers only: `int(...)` then `//`. Never float.
- Protocol constants: `MIN_ESCROW_ATTO=1`, `DISPUTE_WINDOW_SEC=3600`,
  `EVIDENCE_WINDOW_SEC=1800`, `APPEAL_BOND_BPS=2500`,
  `MIN_APPEAL_BOND_ATTO=10**15`, `MAX_SOURCES=3`, `MAX_CRITERIA=12`,
  `MAX_EVIDENCE_PER_PARTY=3`, `STATEMENT_CLIP=1200`, `MAX_LOG=500`.
- Terms JSON must have a non-empty `deliverable` string and a `criteria` list of
  `{id,text}` objects; canonicalised then digested.

## Studionet
- Chain id `61999` (`0xf22f`), RPC `https://studio.genlayer.com/api`, GEN 18
  decimals, `isStudio:true` → `writeContract` returns an EVM tx hash. No gas
  observed (balance deltas exact).
- Cloudflare blocks non-browser User-Agent, so the Python SDK / gltest cannot
  reach the RPC — use genlayer-js / Node (`scripts/studionet.cjs`).
- RPC limits ~30/min, ~500/hr (−32029 + `retry_after_seconds`).
- A FINALIZED tx can still have rolled back — inspect
  `consensus_data.leader_receipt`.
- A reverting payable call does NOT refund attached value → never send `value`
  to a call expected to revert.
- The RPC returns `Access-Control-Allow-Origin` for localhost, so the browser
  frontend talks to it directly (no proxy needed).

## Live deployment
- Canonical contract: `0x0DA83e6200318ca83C6C9ed77C3dCE6bdec60Bd6`
  (deploy tx `0x65f15e8753607534d4d2bacbea46985609fc569a54e3a9ba9f3568354ec841d0`).
- Verified against it (not a fresh deploy): **39 passed, 0 failed**. Buyer =
  `wallet/.env` `GENLAYER_DEV_KEY` = `0x3958A649b41cd7C8561F4233cC0F5b0469Bc98E0`;
  seller = `wallet/seller.env` = `0x99bF44395CaC814E671ADFF8b69d968Fac4e5Db3`.
  Deals `d1..d4` are live on it.
- Wallet folder `D:\Genlayer-project\wallet`: `.env` (buyer key), `seller.env` +
  `seller.json` (new seller), `address.txt`, `recipient.json` (older seller,
  fallback). Never commit keys.
- 12 reverts in a verify run are intentional guard tests.

## Frontend (Next.js 16 @ `frontend/`)
- Next 16.4.2, React 19.3, Tailwind v4, TS, src-dir, alias `@/*`.
  `tsconfig.target` is ES2020 (BigInt literals). `cacheComponents: true`.
- Wallets: EIP-6963 chooser only — never `window.ethereum`, never
  `client.connect()`. Clients via `lib/genlayer.ts`; contract surface via
  `lib/sacramentum.ts`.
- Next 16 requires a `<Suspense>` around client `useParams()` / current-time
  reads under `cacheComponents` (`/deal/[id]` wraps `deal-view.tsx`; `/open`
  wraps its form).
- Routes: `/`, `/market`, `/deal/[id]`, `/open`, `/how-it-works` (user-facing
  explainer; header nav says "How it works" — internal, not the GenLayer docs).
  Page containers are `max-w-[1536px]` (header→footer) so the full-bleed 3D hero
  has room.
- Site-wide background motes: `frontend/src/components/particle-field.tsx` is a
  fixed `<canvas>` (`z-0`) mounted in `layout.tsx`; all content sits in a
  `relative z-10` wrapper above it. Drifting/twinkling brass dots echoing the 3D
  motes; density scales with area, pauses when the tab is hidden, and renders a
  static field under `prefers-reduced-motion`.
- Brand mark = the `Seal` in `site-header.tsx` (brass ring + cross + arch).
  Favicon set generated from it, all under `frontend/src/app/`: `icon.svg`
  (source of truth), `favicon.ico` (16/32/48 PNG frames), `apple-icon.png`
  (180, full-bleed square). Regenerate with sharp from `icon.svg`
  (`frontend/node_modules/sharp`); the `.ico` is a hand-built PNG-in-ICO
  container. Colours: ink `#0e141a`→`#0a0d10`, brass `#c9a25b`/`#e6c683`.
- 3D hero is an original scene:
  `frontend/src/components/ui/escrow-armillary-3d.tsx` ("Escrow Armillary" — a
  brass vault with five orbiting stations market/escrow/delivery/tribunal/
  settlement). It replaces the earlier borrowed factory scene (deleted). Keep
  its public surface: default export, props `height|className|embed|onStation|
  onReady`, exports `StationId`, `MachineMode`, `MachineCamera`, `MachineApi`,
  and `window.__machine`. `hero.tsx` dynamic-imports it (`ssr:false`, `embed`)
  behind a left-to-right ink scrim.
- Hero composition: on wide embeds the instrument is nudged right of centre by
  a camera lens shift (`camera.setViewOffset`, `LENS_SHIFT=0.17` — also
  `LENS_LIFT=0.08` up), NOT by moving the machine+camera together (that cancels
  out). The scrim is a tuned `linear-gradient` (#0a0d10 → transparent by ~58%)
  so the copy stays legible.
- The scene has its own bottom-right controls (pause/resume rotation + reset
  view). Clicking a station focuses it and pauses rotation; clicking the same
  station, empty space, or the pause button resumes. Scene auto-rotate is
  suppressed during a camera-goal lerp and restored after.
- Zoom is opt-in. `controls.enableZoom` starts false, so a plain wheel over the
  hero scrolls the page; it flips true only while Ctrl/Cmd/Shift is held, so
  wheel-zoom is deliberate. The control chrome also carries `+`/`−` buttons
  (`dolly()`, clamped to `minDistance`/`maxDistance` 6.5–16). Only drag orbits.
- Station iconography (user-tuned): Escrow is a sealed strongbox with a hanging
  padlock + wax seal (never a dial/spoked wheel); Delivery is a strapped
  shipping crate with a barcode manifest label (never a gift-wrapped box).
- Env: `frontend/.env.local` + `.env.example` →
  `NEXT_PUBLIC_SACRAMENTUM_ADDRESS`.
- Verified: lint clean, build succeeds, `next start` 200s for
  `/`, `/market`, `/open`, `/how-it-works`, `/deal/d1` (with the Armillary hero).

## Frontend tx hardening & tests
- All writes go through `submit()` in `lib/sacramentum.ts` and every wrapper
  takes an optional `onPhase` reporter (`"signing" | "waiting" | "confirmed"`)
  that drives the button copy and the live-status line.
- Consensus wait is `CONSENSUS_WAIT = { intervalMs: 5000, retries: 120 }`
  (~10 min) — deliberately long so a slow panel settles instead of failing
  early; `waitForReceipt` retries transient RPC noise (rate limit/5xx/HTML) up
  to twice and never on a revert.
- A receipt is only trusted when its own hash matches the submitted hash
  (stale-receipt guard, mirrors `studionet.cjs`). `humanizeError` maps wallet
  rejection, wrong network, rate limit, insufficient funds, and timeout.
- Double-submit is blocked by a ref guard in `useTx` (a second click can beat
  the re-render), plus `aria-busy` and a disabled button.
- `useRead` has a 20 s timeout so a hung read becomes an error, not an endless
  spinner; read errors are surfaced in `deal-view.tsx` / `verdict-panel.tsx`.
- `PROTOCOL` mirrors the contract constants (now incl. `maxTitle`,
  `statementClip`, `appealWindowSec`, `releaseBucketBps`,
  `releaseToleranceBps`, `minEscrowAtto`); `npm run test:sync` fails if any
  method, arg count, constant, status, or outcome drifts from the contract.
