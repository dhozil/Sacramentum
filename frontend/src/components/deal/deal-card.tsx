import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge, OutcomeBadge } from "@/components/deal/status-badge";
import { bpsToPercent, formatGen, relativeTime, shortAddress } from "@/lib/format";
import type { Deal } from "@/lib/sacramentum";

export function DealCard({ deal }: { deal: Deal }) {
  const hasEscrow = BigInt(deal.escrow_atto) > 0n;
  return (
    <Link href={`/deal/${deal.id}`} className="group block">
      <Card className="h-full p-5 transition-colors group-hover:border-brass/60">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[0.68rem] uppercase tracking-wider text-muted">{deal.id}</p>
            <h3 className="mt-1 truncate text-lg text-parchment">{deal.title || "Untitled deal"}</h3>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatusBadge status={deal.status} />
            {deal.outcome ? <OutcomeBadge outcome={deal.outcome} /> : null}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-[0.68rem] uppercase tracking-wider text-muted">Escrow</dt>
            <dd className="mt-0.5 font-mono text-parchment">
              {hasEscrow ? `${formatGen(deal.escrow_atto)} GEN` : "unfunded"}
            </dd>
          </div>
          <div>
            <dt className="text-[0.68rem] uppercase tracking-wider text-muted">Release</dt>
            <dd className="mt-0.5 font-mono text-parchment">
              {deal.outcome ? bpsToPercent(deal.release_bps) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[0.68rem] uppercase tracking-wider text-muted">Buyer</dt>
            <dd className="mt-0.5 font-mono text-parchment-dim">{shortAddress(deal.buyer)}</dd>
          </div>
          <div>
            <dt className="text-[0.68rem] uppercase tracking-wider text-muted">Seller</dt>
            <dd className="mt-0.5 font-mono text-parchment-dim">{shortAddress(deal.seller)}</dd>
          </div>
        </dl>

        <div className="mt-5 flex items-center justify-between border-t border-line-soft pt-3 text-xs text-muted">
          <span>Deadline {relativeTime(deal.deadline_unix)}</span>
          <span className="inline-flex items-center gap-1 text-brass-bright opacity-0 transition-opacity group-hover:opacity-100">
            Inspect <ArrowUpRight className="size-3.5" />
          </span>
        </div>
      </Card>
    </Link>
  );
}
