"use client";

import { AlertTriangle, Check, ExternalLink, Minus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OutcomeBadge } from "@/components/deal/status-badge";
import { bpsToPercent } from "@/lib/format";
import type { DealAudit, Verdict, VerdictRound } from "@/lib/sacramentum";

function CriterionList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "verdigris" | "seal";
  items: string[];
}) {
  if (!items?.length) return null;
  const Icon = tone === "verdigris" ? Check : X;
  return (
    <div>
      <p className="text-[0.68rem] uppercase tracking-wider text-muted">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm">
            <Icon
              className={`mt-0.5 size-3.5 shrink-0 ${tone === "verdigris" ? "text-verdigris" : "text-seal"}`}
            />
            <span className="text-parchment-dim">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoundCard({ round, index }: { round: VerdictRound; index: number }) {
  const label = round.round ?? (index === 0 ? "first" : "appeal");
  return (
    <div className="rounded-sm border border-line-soft bg-ink-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow text-muted">Round {index + 1} · {label}</span>
        <div className="flex items-center gap-2">
          {round.outcome ? <OutcomeBadge outcome={round.outcome} /> : null}
          <span className="font-mono text-xs text-muted">
            release {bpsToPercent(round.release_bps ?? 0)}
          </span>
        </div>
      </div>
      {round.rationale ? (
        <p className="mt-3 text-sm leading-relaxed text-parchment-dim">{round.rationale}</p>
      ) : null}
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[0.68rem] text-muted">
        <span>confidence {round.confidence ?? "—"}</span>
        {round.release_bucket !== undefined ? <span>release bucket {round.release_bucket}</span> : null}
        {round.evidence_chars !== undefined ? <span>evidence {round.evidence_chars} chars</span> : null}
      </dl>
      {round.evidence_sources?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {round.evidence_sources.map((source, i) => (
            <a
              key={`${source}-${i}`}
              href={source}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-xs border border-line px-2 py-0.5 font-mono text-[0.68rem] text-brass-bright transition-colors hover:border-brass"
            >
              <ExternalLink className="size-3" />
              {source.replace(/^https?:\/\//, "").slice(0, 40)}
            </a>
          ))}
        </div>
      ) : null}
      {round.model_output ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[0.68rem] uppercase tracking-wider text-muted">
            Raw model output
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-sm border border-line-soft bg-ink-950/60 p-3 font-mono text-[0.68rem] leading-relaxed text-parchment-dim">
            {round.model_output}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

export function VerdictPanel({
  audit,
  verdict,
  error,
}: {
  audit: DealAudit | null;
  verdict: Verdict | null;
  error?: string | null;
}) {
  const rounds = verdict?.rounds ?? [];
  const hasVerdict = !!audit?.outcome && audit.outcome !== "UNDETERMINED";
  const releaseBps = verdict?.equivalence?.release_bps;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Verdict</CardTitle>
          <p className="mt-1 text-sm text-muted">
            The AI panel judges the committed evidence against the machine-readable terms.
          </p>
        </div>
        {audit?.outcome ? <OutcomeBadge outcome={audit.outcome} /> : null}
      </CardHeader>
      <CardContent className="space-y-5">
        {error && !hasVerdict ? (
          <p className="flex items-center gap-2 text-sm text-seal">
            <AlertTriangle className="size-4" /> Could not read the verdict: {error}
          </p>
        ) : null}
        {!hasVerdict ? (
          error ? null : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Minus className="size-4" /> No verdict has been reached yet.
            </p>
          )
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Release" value={bpsToPercent(audit!.release_bps)} />
              <Stat label="Confidence" value={String(audit!.confidence)} />
              <Stat
                label="Appeal"
                value={audit!.appeal_decided ? "decided" : audit!.appellant && audit!.appellant !== "0x0000000000000000000000000000000000000000" ? "pending" : "none"}
              />
            </div>

            {audit!.rationale ? (
              <p className="border-l-2 border-brass/50 pl-4 text-sm leading-relaxed text-parchment">
                {audit!.rationale}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <CriterionList title="Satisfied" tone="verdigris" items={audit!.satisfied_criteria} />
              <CriterionList title="Unsatisfied" tone="seal" items={audit!.unsatisfied_criteria} />
            </div>

            {audit!.sources?.length ? (
              <div>
                <p className="text-[0.68rem] uppercase tracking-wider text-muted">Committed sources</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {audit!.sources.map((source, i) => (
                    <a
                      key={`${source}-${i}`}
                      href={source}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xs border border-line px-2 py-0.5 font-mono text-[0.68rem] text-brass-bright transition-colors hover:border-brass"
                    >
                      <ExternalLink className="size-3" />
                      {source.replace(/^https?:\/\//, "").slice(0, 40)}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {rounds.length ? (
              <div className="space-y-3">
                <p className="text-[0.68rem] uppercase tracking-wider text-muted">Adjudication rounds</p>
                {rounds.map((round, index) => (
                  <RoundCard key={index} round={round} index={index} />
                ))}
              </div>
            ) : null}

            {verdict ? (
              <p className="font-mono text-[0.68rem] leading-relaxed text-muted">
                consensus: outcome must match exactly
                {releaseBps
                  ? `; release within ±${releaseBps.tolerance_bps ?? 500} bps (${releaseBps.bucket_width_bps ?? 500} bps buckets)`
                  : "; release within tolerance"}
                . Confidence is audit-only and never compared.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.68rem] uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-sm text-parchment">{value}</p>
    </div>
  );
}

export function EvidenceList({
  audit,
  error,
}: {
  audit: DealAudit | null;
  error?: string | null;
}) {
  if (error && !audit?.evidence?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Filed evidence</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="flex items-center gap-2 text-sm text-seal">
            <AlertTriangle className="size-4" /> Could not read the dossier: {error}
          </p>
        </CardContent>
      </Card>
    );
  }
  if (!audit?.evidence?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Filed evidence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {audit.evidence.map((record, index) => (
          <div key={index} className="rounded-sm border border-line-soft bg-ink-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <Badge tone={record.role === "buyer" ? "brass" : "parchment"}>{record.role}</Badge>
              {record.url ? (
                <a
                  href={record.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[0.68rem] text-brass-bright hover:underline"
                >
                  <ExternalLink className="size-3" />
                  {record.url.replace(/^https?:\/\//, "").slice(0, 44)}
                </a>
              ) : null}
            </div>
            {record.statement ? (
              <p className="mt-2 text-sm leading-relaxed text-parchment-dim">{record.statement}</p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
