"use client";

import * as React from "react";
import Link from "next/link";
import { Inbox, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DealCard } from "@/components/deal/deal-card";
import { useDealIds, useDeals } from "@/hooks/use-contract";
import { useWallet } from "@/components/wallet/wallet-context";
import { sameAddress } from "@/lib/format";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open", statuses: ["OPEN"] },
  { key: "live", label: "In flight", statuses: ["FUNDED", "ACCEPTED", "DELIVERED"] },
  { key: "disputed", label: "Disputed", statuses: ["DISPUTED", "RESOLVED", "APPEALED"] },
  { key: "settled", label: "Settled", statuses: ["RELEASED", "REFUNDED", "FINALIZED"] },
] as const;

export default function MarketPage() {
  const { address } = useWallet();
  const { data: ids, loading: idsLoading, error: idsError, refresh } = useDealIds();
  const { data: deals, loading, error, refresh: refreshDeals } = useDeals(ids);
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["key"]>("all");
  const [mineOnly, setMineOnly] = React.useState(false);

  const filtered = React.useMemo(() => {
    let list = deals ?? [];
    if (mineOnly && address) {
      list = list.filter((deal) => sameAddress(deal.buyer, address) || sameAddress(deal.seller, address));
    }
    const active = FILTERS.find((item) => item.key === filter);
    if (active && "statuses" in active) {
      list = list.filter((deal) => (active.statuses as readonly string[]).includes(deal.status));
    }
    return [...list].reverse();
  }, [deals, filter, mineOnly, address]);

  const busy = idsLoading || loading;
  const failure = idsError || error;

  return (
    <div className="mx-auto max-w-[1536px] px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow text-brass">Market</p>
          <h1 className="mt-3 text-4xl">Deals on the ledger</h1>
          <p className="mt-3 max-w-xl text-sm text-muted">
            Every deal ever opened on this contract, from funding to final settlement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/open">
            <Button>Open a deal</Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => {
              refresh();
              refreshDeals();
            }}
          >
            <RefreshCw /> Refresh
          </Button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-b border-line-soft pb-4">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
                filter === item.key
                  ? "bg-brass text-ink-950"
                  : "text-muted hover:bg-ink-800 hover:text-parchment"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setMineOnly((value) => !value)}
          disabled={!address}
          className={`inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 text-sm transition-colors disabled:opacity-40 ${
            mineOnly ? "border-brass text-brass-bright" : "border-line text-muted hover:text-parchment"
          }`}
        >
          <Wallet className="size-3.5" /> My deals
        </button>
      </div>

      {busy ? (
        <p className="py-20 text-center text-sm text-muted">Reading the ledger…</p>
      ) : failure ? (
        <div className="py-20 text-center">
          <p className="text-sm text-seal">{failure}</p>
          <Button variant="outline" className="mt-4" onClick={() => { refresh(); refreshDeals(); }}>
            Try again
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <span className="grid size-12 place-items-center rounded-md border border-line bg-ink-900 text-muted">
            <Inbox className="size-5" />
          </span>
          <p className="mt-4 text-sm text-muted">
            {mineOnly ? "You are not party to any deal yet." : "No deals match this view yet."}
          </p>
          <Link href="/open" className="mt-3">
            <Button variant="outline">Open the first deal</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}
