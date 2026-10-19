"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  FileCheck2,
  Gavel,
  Handshake,
  Lock,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { Hero } from "@/components/hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLog, useStats } from "@/hooks/use-contract";
import { formatGen } from "@/lib/format";

const STEPS = [
  { icon: ScrollText, title: "Open", body: "Buyer commits machine-readable terms and a fixed evidence manifest." },
  { icon: Lock, title: "Fund", body: "The buyer locks GEN in escrow held by the contract, not a custodian." },
  { icon: Handshake, title: "Accept", body: "The seller binds to the terms by accepting the deal." },
  { icon: FileCheck2, title: "Deliver", body: "The seller files a deliverable URL for the buyer to review." },
  { icon: Gavel, title: "Adjudicate", body: "A dispute triggers an AI panel that reads only the committed sources." },
  { icon: ShieldCheck, title: "Finalize", body: "One bonded appeal, then value is distributed on-chain. Always." },
];

export default function HomePage() {
  const { data: stats } = useStats();
  const { data: log } = useLog(0, 200);

  const recent = log ? [...log].reverse().slice(0, 10) : [];

  return (
    <div>
      <Hero />

      <section className="mx-auto -mt-px max-w-[1536px] px-5 py-14">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow text-brass">The ledger, live</p>
            <h2 className="mt-3 text-3xl">Escrow as provable state</h2>
          </div>
          <p className="max-w-sm text-sm text-muted">
            Every figure below is read straight from the contract. Held value always equals inflow minus
            outflow.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Deals opened" value={stats ? String(stats.deals) : "—"} />
          <StatTile label="Held in escrow" value={stats ? `${formatGen(stats.held_atto)} GEN` : "—"} tone="brass" />
          <StatTile
            label="Released to sellers"
            value={stats ? `${formatGen(stats.total_released_atto)} GEN` : "—"}
            tone="verdigris"
          />
          <StatTile
            label="Refunded to buyers"
            value={stats ? `${formatGen(stats.total_refunded_atto)} GEN` : "—"}
            tone="verdigris"
          />
        </div>
        {stats ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-muted">
            <span className={`size-2 rounded-full ${stats.conserved ? "bg-verdigris" : "bg-seal"}`} />
            {stats.conserved ? "conservation invariant holds" : "conservation invariant breached"}
            {stats.log_truncated ? " · log truncated" : ""}
          </p>
        ) : null}
      </section>

      <section className="border-y border-line-soft bg-ink-900/40">
        <div className="mx-auto max-w-[1536px] px-5 py-14">
          <p className="eyebrow text-brass">The path of a deal</p>
          <h2 className="mt-3 text-3xl">Six states, one machine</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Card className="h-full p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-sm border border-brass/40 bg-ink-950 text-brass">
                      <step.icon className="size-4" />
                    </span>
                    <span className="font-mono text-xs text-muted">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="mt-4 text-lg">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1536px] gap-8 px-5 py-14 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted">No events recorded yet. Open the first deal.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {recent.map((entry, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex items-center gap-3">
                      <EventDot event={entry.event} />
                      <span className="text-sm text-parchment">{entry.event.replace(/_/g, " ")}</span>
                    </span>
                    {entry.id ? (
                      <Link
                        href={`/deal/${entry.id}`}
                        className="inline-flex items-center gap-1 font-mono text-xs text-brass-bright hover:underline"
                      >
                        {entry.id} <ArrowUpRight className="size-3" />
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col justify-between gap-6 rounded-md border border-line-soft bg-gradient-to-b from-ink-850 to-ink-900 p-7">
          <div>
            <Badge tone="brass">
              <Banknote className="size-3" /> Genlayer Studio Network
            </Badge>
            <h2 className="mt-5 text-2xl text-balance">Trade with strangers, settle with certainty.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Open a deal, commit your terms as evidence, and let the panel do the rest. No intermediary signs
              off on what was promised.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/open">
              <Button>
                Open a deal <ArrowRight />
              </Button>
            </Link>
            <Link href="/market">
              <Button variant="outline">View market</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = "parchment",
}: {
  label: string;
  value: string;
  tone?: "parchment" | "brass" | "verdigris";
}) {
  const color =
    tone === "brass" ? "text-brass-bright" : tone === "verdigris" ? "text-verdigris" : "text-parchment";
  return (
    <Card className="p-5">
      <p className="text-[0.68rem] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-2 font-mono text-2xl ${color}`}>{value}</p>
    </Card>
  );
}

function EventDot({ event }: { event: string }) {
  const tone = /dispute|appeal|refund|undetermined|cancel/.test(event)
    ? "bg-seal"
    : /released|finalized|confirmed|compliant/.test(event)
      ? "bg-verdigris"
      : "bg-brass";
  return <span className={`size-1.5 rounded-full ${tone}`} aria-hidden />;
}
