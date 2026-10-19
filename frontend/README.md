# Sacramentum — frontend

A Next.js 16 (App Router, Tailwind v4) console for the Sacramentum escrow
tribunal on **Genlayer Studio Network**. It talks to the deployed contract with
[`genlayer-js`](https://www.npmjs.com/package/genlayer-js) and signs through a
wallet the user picks via **EIP-6963**, so MetaMask and Rabby never fight over
`window.ethereum`.

## Configure

`.env.local` (see `.env.example`):

```
NEXT_PUBLIC_SACRAMENTUM_ADDRESS=0x0DA83e6200318ca83C6C9ed77C3dCE6bdec60Bd6
```

Studionet is baked in: chain id `61999` (`0xf22f`), RPC
`https://studio.genlayer.com/api`, GEN with 18 decimals.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

## What's here

| Route         | Purpose                                                              |
| ------------- | -------------------------------------------------------------------- |
| `/`           | Landing: 3D tribunal hero, live `get_stats`, lifecycle, recent events |
| `/market`     | Every deal, filtered by state and by "mine"                           |
| `/deal/[id]`  | Deal dossier, terms, verdict rounds, and a role-aware action panel    |
| `/open`       | Compose machine-readable terms and commit them as the buyer           |

## Layout
- `src/lib/genlayer.ts` — clients (`read` always available, `write` bound to the
  chosen provider) and chain add/switch helpers.
- `src/lib/sacramentum.ts` — typed contract surface: readers, writers, status
  model, protocol constants, `appealBondFor`.
- `src/lib/eip6963.ts` — multi-wallet discovery.
- `src/components/wallet/*` — discovery, chooser dialog, account menu.
- `src/hooks/*` — `useRead`-based data hooks, `useTx` write state, `useNow`.
- `src/components/deal/*` — cards, verdict panel, action panel.
- `src/components/ui/escrow-armillary-3d.tsx` — the interactive 3D instrument
  (procedural three.js) — the "Escrow Armillary".

## Notes

- Reads go through our own same-origin proxy (`src/app/api/rpc/route.ts`), which
  forwards to the RPC host. In the browser the client uses `/api/rpc`; in Node
  (tests/scripts) it hits the RPC directly. This avoids the CORS dependency on
  the deployed origin.
- A reverting write still costs the caller any attached `value`; the UI only
  attaches value to `fund_deal` and `appeal`.
- Never commit `.env.local`.
