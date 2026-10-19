import { Badge } from "@/components/ui/badge";
import { OUTCOME_TONE, STATUS_TONE } from "@/lib/sacramentum";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} className={className}>
      {status || "—"}
    </Badge>
  );
}

export function OutcomeBadge({ outcome, className }: { outcome: string; className?: string }) {
  if (!outcome) return null;
  return (
    <Badge tone={OUTCOME_TONE[outcome] ?? "neutral"} className={className}>
      {outcome.replace(/_/g, " ")}
    </Badge>
  );
}
