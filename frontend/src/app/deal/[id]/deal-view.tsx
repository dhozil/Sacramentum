"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, OutcomeBadge } from "@/components/deal/status-badge";
import { ActionPanel } from "@/components/deal/action-panel";
import { EvidenceList, VerdictPanel } from "@/components/deal/verdict-panel";
import { useAudit, useDeal, useTerms, useVerdict } from "@/hooks/use-contract";
import { useWallet } from "@/components/wallet/wallet-context";
import { formatGen, formatUnix, relativeTime, sameAddress } from "@/lib/format";
import { roleOf, roleOfLabel, type Criterion } from "@/lib/sacramentum";

export default function DealView() {
  const params = useParams();
  const id = String(params.id ?? "");
  const deal = useDeal(id);
  const terms = useTerms(id);
  const audit = useAudit(id);
  const verdict = useVerdict(id);
  const { address } = useWallet();

  const refreshAll = React.useCallback(() => {
    deal.refresh();
    terms.refresh();
    audit.refresh();
    verdict.refresh();
  }, [deal, terms, audit, verdict]);

  if (deal.loading && !deal.data) {
    return <Centered>Reading deal {id}…</Centered>;
  }
  if (deal.error || !deal.data) {
    return (
      <Centered>
        <span className="flex items-center gap-2 text-sm text-seal">
          <AlertTriangle className="size-4" /> {deal.error ?? `Deal ${id} was not found on this contract.`}
        </span>
        <Link href="/market" className="mt-4 inline-block">
          <Button variant="outline">
            <ArrowLeft /> Back to market
          </Button>
        </Link>
      </Centered>
    );
  }

  const dealData = deal.data;
  const role = roleOf(dealData, address);
  const hasEscrow = BigInt(dealData.escrow_atto) > 0n;

  return (
    <div className="mx-auto max-w-[1536px] px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/market"
          className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-parchment"
        >
          <ArrowLeft className="size-4" /> Market
        </Link>
        <Button variant="ghost" size="sm" onClick={refreshAll}>
          <RefreshCw /> Refresh
        </Button>
      </div>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-6 border-b border-line-soft pb-8">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">{dealData.id}</span>
            <StatusBadge status={dealData.status} />
            {dealData.outcome ? <OutcomeBadge outcome={dealData.outcome} /> : null}
            {dealData.final ? <Badge tone="parchment">final</Badge> : null}
          </div>
          <h1 className="mt-3 text-4xl text-balance">{dealData.title || "Untitled deal"}</h1>
          <p className="mt-3 text-sm text-muted">
            Buyer <Actor address={dealData.buyer} you={sameAddress(dealData.buyer, address)} /> · Seller{" "}
            <Actor address={dealData.seller} you={sameAddress(dealData.seller, address)} />
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.68rem] uppercase tracking-wider text-muted">Escrow</p>
          <p className="mt-1 font-mono text-3xl text-brass-bright">
            {hasEscrow ? `${formatGen(dealData.escrow_atto)} GEN` : "—"}
          </p>
          {dealData.outcome ? (
            <p className="mt-1 text-xs text-muted">
              release {dealData.release_bps / 100}% · confidence {dealData.confidence}
            </p>
          ) : null}
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Terms &amp; dossier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Meta label="Deadline">
                  {formatUnix(dealData.deadline_unix)}{" "}
                  <span className="text-muted">({relativeTime(dealData.deadline_unix)})</span>
                </Meta>
                <Meta label="Terms digest">
                  <span className="font-mono text-xs">{dealData.terms_digest.slice(0, 22)}…</span>
                </Meta>
                <Meta label="Delivery">
                  {dealData.delivery_url ? (
                    <a
                      href={dealData.delivery_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-brass-bright hover:underline"
                    >
                      {dealData.delivery_url.replace(/^https?:\/\//, "").slice(0, 32)}…
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span className="text-muted">not delivered</span>
                  )}
                </Meta>
                <Meta label="Delivered">
                  {dealData.delivered_at_unix ? formatUnix(dealData.delivered_at_unix) : "—"}
                </Meta>
                {dealData.appeal_deadline_unix ? (
                  <Meta label="Appeal window">
                    {formatUnix(dealData.appeal_deadline_unix)}{" "}
                    <span className="text-muted">({relativeTime(dealData.appeal_deadline_unix)})</span>
                  </Meta>
                ) : null}
                {BigInt(dealData.appeal_bond_atto) > 0n ? (
                  <Meta label="Appeal bond">{formatGen(dealData.appeal_bond_atto)} GEN</Meta>
                ) : null}
              </dl>

              <div className="border-t border-line-soft pt-5">
                <p className="text-[0.68rem] uppercase tracking-wider text-muted">Deliverable</p>
                {terms.error ? (
                  <p className="mt-2 flex items-center gap-2 text-sm text-seal">
                    <AlertTriangle className="size-4" /> Could not read the terms: {terms.error}
                  </p>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-parchment">
                    {terms.data?.deliverable ?? (terms.loading ? "Reading terms…" : "—")}
                  </p>
                )}
              </div>

              {terms.data?.criteria?.length ? (
                <div>
                  <p className="text-[0.68rem] uppercase tracking-wider text-muted">
                    Criteria the panel judges
                  </p>
                  <ul className="mt-2 space-y-2">
                    {terms.data.criteria.map((criterion: Criterion) => (
                      <li key={criterion.id} className="flex items-start gap-3">
                        <span className="mt-0.5 font-mono text-[0.68rem] text-brass">{criterion.id}</span>
                        <span className="text-sm text-parchment-dim">{criterion.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <VerdictPanel audit={audit.data} verdict={verdict.data} error={audit.error ?? verdict.error} />
          <EvidenceList audit={audit.data} error={audit.error} />
        </div>

        <div className="space-y-6">
          <ActionPanel deal={dealData} role={role} onChanged={refreshAll} />
          <Card>
            <CardHeader>
              <CardTitle>Your standing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-parchment">{roleOfLabel(role)}</p>
              <p className="text-muted">
                {role === "buyer"
                  ? "You fund the escrow and can confirm delivery to release it, or dispute a delivery."
                  : role === "seller"
                    ? "You accept the terms and file the deliverable for the panel to judge."
                    : role === "observer"
                      ? "You are not a party to this deal. Permissionless actions (adjudicate, finalize) remain open to anyone."
                      : "Connect the buyer or seller wallet to act on this deal."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-[1536px] flex-col items-center px-5 py-28 text-center">{children}</div>;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.68rem] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-parchment">{children}</dd>
    </div>
  );
}

function Actor({ address, you }: { address: string; you: boolean }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-parchment-dim">{`${address.slice(0, 6)}…${address.slice(-4)}`}</span>
      {you ? <Badge tone="brass">you</Badge> : null}
      <button
        aria-label="Copy address"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          } catch {
            /* clipboard unavailable */
          }
        }}
        className="text-muted transition-colors hover:text-brass-bright"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  );
}
