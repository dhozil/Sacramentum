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

const ROLES = [
  { key: "all", label: "Everyone" },
  { key: "seller", label: "As seller" },
  { key: "buyer", label: "As buyer" },
] as const;

type RoleFilter = (typeof ROLES)[number]["key"];

export default function MarketPage() {
  const { address } = useWallet();
  const { data: ids, loading: idsLoading, error: idsError, refresh } = useDealIds();
  const { data: deals, loading, error, refresh: refreshDeals } = useDeals(ids);
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["key"]>("all");
  const [role, setRole] = React.useState<RoleFilter>("all");

  const statusFiltered = React.useMemo(() => {
    const active = FILTERS.find((item) => item.key === filter);
    const list = deals ?? [];
    if (active && "statuses" in active) {
      return list.filter((deal) => (active.statuses as readonly string[]).includes(deal.status));
    }
    return list;
  }, [deals, filter]);

  const counts = React.useMemo(() => {
    let seller = 0;
    let buyer = 0;
    for (const deal of statusFiltered) {
      if (address && sameAddress(deal.seller, address)) seller += 1;
      if (address && sameAddress(deal.buyer, address)) buyer += 1;
    }
    return { all: statusFiltered.length, seller, buyer };
  }, [statusFiltered, address]);

  const filtered = React.useMemo(() => {
    let list = statusFiltered;
    if (address && role === "seller") list = list.filter((deal) => sameAddress(deal.seller, address));
    if (address && role === "buyer") list = list.filter((deal) => sameAddress(deal.buyer, address));
    return [...list].reverse();
  }, [statusFiltered, role, address]);

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
        <div className="inline-flex items-center gap-1 rounded-sm border border-line p-0.5">
          <span className="ml-1.5 mr-0.5 inline-flex items-center gap-1 text-xs text-muted">
            <Wallet className="size-3.5" /> Role
          </span>
          {ROLES.map((item) => {
            const disabled = item.key !== "all" && !address;
            const count = item.key === "all" ? counts.all : item.key === "seller" ? counts.seller : counts.buyer;
            return (
              <button
                key={item.key}
                onClick={() => setRole(item.key)}
                disabled={disabled}
                title={disabled ? "Connect a wallet to filter by your role" : undefined}
                className={`rounded-sm px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  role === item.key
                    ? "bg-brass text-ink-950"
                    : "text-muted hover:bg-ink-800 hover:text-parchment"
                }`}
              >
                {item.label}
                {address && item.key !== "all" ? (
                  <span className={`ml-1.5 font-mono text-xs ${role === item.key ? "text-ink-950/70" : "text-muted"}`}>
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {role !== "all" && !address ? (
        <p className="mt-3 text-xs text-muted">Connect a wallet to see the deals addressed to you.</p>
      ) : null}

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
            {role !== "all" && address
              ? `No deals list you as ${role} in this view.`
              : "No deals match this view yet."}
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
