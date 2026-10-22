"use client";

import * as React from "react";
import { Gavel, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useTx, type TxRun } from "@/hooks/use-tx";
import { useNow } from "@/hooks/use-now";
import { gen, formatGen, relativeTime } from "@/lib/format";
import {
  acceptDeal,
  appeal,
  appealBondFor,
  cancelDeal,
  claimTimeout,
  confirmDelivery,
  finalize,
  fundDeal,
  PROTOCOL,
  raiseDispute,
  resolve,
  resolveAppeal,
  submitDelivery,
  submitEvidence,
  type Deal,
  type Role,
} from "@/lib/sacramentum";

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest.toString().padStart(2, "0")}s`;
}

function ActionButton({
  submit,
  children,
  variant = "primary",
  size = "md",
  onChanged,
  disabled,
  note,
  className,
}: {
  submit: TxRun;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  onChanged?: () => void;
  disabled?: boolean;
  note?: React.ReactNode;
  className?: string;
}) {
  const { busy, phase, error, run, result, canSign } = useTx();
  const done = result?.ok === true;
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const tick = useNow(busy ? 1000 : 60000);
  const elapsed = startedAt ? Math.max(0, tick - startedAt) : 0;

  return (
    <div className={className}>
      <Button
        variant={variant}
        size={size}
        disabled={busy || disabled || !canSign}
        aria-busy={busy}
        onClick={async () => {
          setStartedAt(Math.floor(Date.now() / 1000));
          const res = await run(submit);
          setStartedAt(null);
          if (res?.ok) onChanged?.();
        }}
      >
        {busy ? (
          <>
            <Loader2 className="animate-spin" />
            {phase === "signing"
              ? "Signing…"
              : phase === "confirming"
                ? "Confirming state…"
                : "Waiting for consensus…"}
          </>
        ) : (
          children
        )}
      </Button>
      <div role="status" aria-live="polite" aria-atomic="true">
        {busy ? (
          <p className="mt-2 text-xs text-muted">
            {phase === "signing"
              ? "Confirm in your wallet."
              : phase === "confirming"
                ? "Consensus is in. Reading the ledger back to confirm the state actually changed."
                : `Validators are reaching consensus — this can take a few minutes${
                    elapsed ? ` (${formatElapsed(elapsed)})` : ""
                  }. Leave this page open; it will not fail early.`}
          </p>
        ) : null}
      </div>
      {!canSign ? (
        <p className="mt-2 text-xs text-muted">Connect a wallet to sign.</p>
      ) : null}
      {note ? <div className="mt-2 text-xs text-muted">{note}</div> : null}
      {error ? <p className="mt-2 text-xs text-seal">{error}</p> : null}
      {done && !error ? (
        phase === "accepted" ? (
          <p className="mt-2 text-xs text-brass">
            Accepted by consensus, but the ledger has not shown the state change yet. Refresh in a
            moment to confirm it before treating it as settled.
          </p>
        ) : (
          <p className="mt-2 text-xs text-verdigris">State change confirmed on-chain.</p>
        )
      ) : null}
    </div>
  );
}

function Section({
  title,
  tone = "brass",
  children,
}: {
  title: string;
  tone?: "brass" | "seal" | "verdigris";
  children: React.ReactNode;
}) {
  const border =
    tone === "seal" ? "border-seal/40" : tone === "verdigris" ? "border-verdigris/40" : "border-brass/40";
  return (
    <div className={`rounded-sm border-l-2 ${border} pl-4`}>
      <p className="eyebrow text-muted">{title}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function FundForm({ deal, onChanged }: { deal: Deal; onChanged: () => void }) {
  const [amount, setAmount] = React.useState(() => (BigInt(deal.escrow_atto) > 0n ? formatGen(deal.escrow_atto) : "1"));
  const parsed = (() => {
    try {
      return gen(amount);
    } catch {
      return 0n;
    }
  })();
  const valid = parsed > 0n;
  return (
    <Section title="Fund the escrow">
      <Field label="Escrow (GEN)" hint="The contract holds whatever you send. Released only by verdict or cancellation.">
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="1.0"
        />
      </Field>
      <ActionButton
        submit={(client, onPhase) => fundDeal(client, deal.id, parsed, onPhase)}
        disabled={!valid}
        onChanged={onChanged}
      >
        Lock {valid ? `${formatGen(parsed)} GEN` : "escrow"}
      </ActionButton>
    </Section>
  );
}

function DeliveryForm({ deal, onChanged }: { deal: Deal; onChanged: () => void }) {
  const [url, setUrl] = React.useState("");
  const [note, setNote] = React.useState("");
  const now = useNow();
  const pastDeadline = now > deal.deadline_unix;
  const valid = url.trim().startsWith("https://") && !pastDeadline;
  return (
    <Section title="Submit the deliverable">
      <Field
        label="Delivery URL"
        hint="Must be https://. Delivered before the deadline, the panel reads it alongside the committed manifest and any evidence URLs either party files in a dispute."
      >
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://ipfs.io/ipfs/…"
        />
      </Field>
      <Field label="Delivery note">
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What was delivered and where to look."
        />
      </Field>
      {pastDeadline ? (
        <p className="text-xs text-seal">
          The deadline passed. Delivery is closed and the buyer can claim a refund; a late
          submission can no longer move the escrow.
        </p>
      ) : (
        <p className="text-xs text-muted">Deliver before {relativeTime(deal.deadline_unix)}.</p>
      )}
      <ActionButton
        submit={(client, onPhase) => submitDelivery(client, deal.id, url.trim(), note, onPhase)}
        disabled={!valid}
        onChanged={onChanged}
      >
        Record delivery
      </ActionButton>
    </Section>
  );
}

function DisputeForm({ deal, onChanged }: { deal: Deal; onChanged: () => void }) {
  const [reason, setReason] = React.useState("");
  const valid = reason.trim().length > 0;
  return (
    <Section title="Raise a dispute" tone="seal">
      <Field label="Reason" hint="Either party may contest the delivery before the window closes.">
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What about the delivery does not meet the terms?"
        />
      </Field>
      <ActionButton
        variant="danger"
        submit={(client, onPhase) => raiseDispute(client, deal.id, reason.trim(), onPhase)}
        disabled={!valid}
        onChanged={onChanged}
      >
        <Gavel /> Open dispute
      </ActionButton>
    </Section>
  );
}

function EvidenceForm({ deal, onChanged }: { deal: Deal; onChanged: () => void }) {
  const [url, setUrl] = React.useState("");
  const [statement, setStatement] = React.useState("");
  const urlOk = url.trim() === "" || url.trim().startsWith("https://");
  const valid = statement.trim().length > 0 && urlOk;
  return (
    <Section title="File evidence" tone="seal">
      <Field label="Evidence URL (optional)">
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…"
        />
      </Field>
      <Field label="Statement" hint={`Up to ${PROTOCOL.maxEvidencePerParty} filings per party.`}>
        <Textarea
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          placeholder="Argue your case against the terms."
        />
      </Field>
      <ActionButton
        submit={(client, onPhase) => submitEvidence(client, deal.id, url.trim(), statement.trim(), onPhase)}
        disabled={!valid}
        onChanged={onChanged}
      >
        File evidence
      </ActionButton>
      {!urlOk ? <p className="text-xs text-seal">Evidence URL must start with https://.</p> : null}
    </Section>
  );
}

function AppealForm({ deal, onChanged }: { deal: Deal; onChanged: () => void }) {
  const required = appealBondFor(deal.escrow_atto);
  return (
    <Section title="Appeal the verdict" tone="seal">
      <p className="text-sm text-muted">
        Stake a bond to demand a second panel. The loser forfeits it. Required bond:{" "}
        <span className="font-mono text-parchment">{formatGen(required)} GEN</span>.
      </p>
      <ActionButton
        variant="danger"
        submit={(client, onPhase) => appeal(client, deal.id, required, onPhase)}
        onChanged={onChanged}
      >
        Appeal · stake {formatGen(required)} GEN
      </ActionButton>
      <p className="text-xs text-muted">
        Window closes {relativeTime(deal.appeal_deadline_unix)}.
      </p>
    </Section>
  );
}

export function ActionPanel({
  deal,
  role,
  onChanged,
}: {
  deal: Deal;
  role: Role;
  onChanged: () => void;
}) {
  const now = useNow();
  const status = deal.status;
  const isParty = role === "buyer" || role === "seller";
  const appealOpen = now <= deal.appeal_deadline_unix;
  const disputeOpen = now <= deal.delivered_at_unix + PROTOCOL.disputeWindowSec;
  const deadlinePassed = now > deal.deadline_unix;
  const disputeWindowPassed = now > deal.delivered_at_unix + PROTOCOL.disputeWindowSec;
  const recoveryOpen = deal.recovery_at_unix > 0 && now >= deal.recovery_at_unix;

  const blocks: React.ReactNode[] = [];

  if (status === "OPEN" && role === "buyer") {
    blocks.push(<FundForm key="fund" deal={deal} onChanged={onChanged} />);
  }
  if (status === "FUNDED" && role === "seller") {
    blocks.push(
      <Section key="accept" title="Accept the terms">
        <p className="text-sm text-muted">
          Accepting binds the deal. Then deliver against the committed manifest.
        </p>
        <ActionButton submit={(client, onPhase) => acceptDeal(client, deal.id, onPhase)} onChanged={onChanged}>
          Accept deal
        </ActionButton>
      </Section>,
    );
  }
  if ((status === "FUNDED" || status === "ACCEPTED") && role === "buyer") {
    blocks.push(
      <Section key="cancel" title="Cancel before delivery" tone="seal">
        <p className="text-sm text-muted">Recover the full escrow. Only available before a delivery is filed.</p>
        <ActionButton
          variant="outline"
          submit={(client, onPhase) => cancelDeal(client, deal.id, onPhase)}
          onChanged={onChanged}
        >
          Cancel &amp; refund
        </ActionButton>
      </Section>,
    );
  }
  if (status === "ACCEPTED" && role === "seller") {
    blocks.push(<DeliveryForm key="delivery" deal={deal} onChanged={onChanged} />);
  }
  if (status === "DELIVERED" && role === "buyer") {
    blocks.push(
      <Section key="confirm" title="Confirm delivery" tone="verdigris">
        <p className="text-sm text-muted">Happy path: accept the deliverable and release the escrow at once.</p>
        <ActionButton
          variant="verdigris"
          submit={(client, onPhase) => confirmDelivery(client, deal.id, onPhase)}
          onChanged={onChanged}
        >
          Release to seller
        </ActionButton>
      </Section>,
    );
  }
  if (status === "DELIVERED" && isParty && disputeOpen) {
    blocks.push(<DisputeForm key="dispute" deal={deal} onChanged={onChanged} />);
  }
  if (status === "DISPUTED" && isParty) {
    blocks.push(<EvidenceForm key="evidence" deal={deal} onChanged={onChanged} />);
  }
  if (status === "DISPUTED") {
    blocks.push(
      <Section key="resolve" title="Adjudicate">
        <p className="text-sm text-muted">
          Permissionless. Runs the AI panel once both parties have filed or the evidence window lapsed.
        </p>
        <ActionButton submit={(client, onPhase) => resolve(client, deal.id, onPhase)} onChanged={onChanged}>
          Run adjudication
        </ActionButton>
        {deal.recovery_at_unix > 0 ? (
          <p className="text-xs text-muted">
            If the panel stays undetermined, a neutral recovery opens{" "}
            {relativeTime(deal.recovery_at_unix)}.
          </p>
        ) : null}
      </Section>,
    );
  }
  if (
    status === "DISPUTED" &&
    recoveryOpen &&
    (deal.outcome === "UNDETERMINED" || deal.outcome === "")
  ) {
    blocks.push(
      <Section key="recover-dispute" title="Recover an unresolved dispute" tone="verdigris">
        <p className="text-sm text-muted">
          The panel has not reached a verdict within the recovery window. Permissionless: close the
          deal on a neutral 50/50 split so the escrow cannot stay locked.
        </p>
        <ActionButton
          variant="verdigris"
          submit={(client, onPhase) => claimTimeout(client, deal.id, onPhase)}
          onChanged={onChanged}
        >
          Split &amp; close
        </ActionButton>
      </Section>,
    );
  }
  if (status === "RESOLVED" && isParty && appealOpen && !deal.final) {
    blocks.push(<AppealForm key="appeal" deal={deal} onChanged={onChanged} />);
  }
  if (status === "RESOLVED" && (deal.final || !appealOpen)) {
    blocks.push(
      <Section key="finalize" title="Finalize settlement" tone="verdigris">
        <p className="text-sm text-muted">
          Distribute escrow and any bond per the standing verdict. Permissionless.
        </p>
        <ActionButton
          variant="verdigris"
          submit={(client, onPhase) => finalize(client, deal.id, onPhase)}
          onChanged={onChanged}
        >
          Finalize
        </ActionButton>
      </Section>,
    );
  }
  if (status === "APPEALED") {
    blocks.push(
      <Section key="appeal-resolve" title="Re-adjudicate appeal" tone="seal">
        <p className="text-sm text-muted">A second panel reads the evidence. Its verdict is final.</p>
        <ActionButton
          variant="danger"
          submit={(client, onPhase) => resolveAppeal(client, deal.id, onPhase)}
          onChanged={onChanged}
        >
          Decide appeal
        </ActionButton>
        {deal.recovery_at_unix > 0 ? (
          <p className="text-xs text-muted">
            If the appeal stays undecided, a recovery opens {relativeTime(deal.recovery_at_unix)}.
          </p>
        ) : null}
      </Section>,
    );
  }
  if (status === "APPEALED" && recoveryOpen) {
    blocks.push(
      <Section key="recover-appeal" title="Recover an unresolved appeal" tone="verdigris">
        <p className="text-sm text-muted">
          The second panel has not decided within the recovery window. Permissionless: uphold the
          first verdict and return the bond to the appellant, so neither the escrow nor the bond can
          stay locked.
        </p>
        <ActionButton
          variant="verdigris"
          submit={(client, onPhase) => claimTimeout(client, deal.id, onPhase)}
          onChanged={onChanged}
        >
          Uphold &amp; close
        </ActionButton>
      </Section>,
    );
  }
  if (
    (status === "FUNDED" || status === "ACCEPTED") && deadlinePassed
  ) {
    blocks.push(
      <Section key="timeout-fund" title="Claim timeout">
        <p className="text-sm text-muted">The deadline passed with no delivery. Refund the buyer.</p>
        <ActionButton
          variant="outline"
          submit={(client, onPhase) => claimTimeout(client, deal.id, onPhase)}
          onChanged={onChanged}
        >
          Refund buyer
        </ActionButton>
      </Section>,
    );
  }
  if (status === "DELIVERED" && disputeWindowPassed) {
    blocks.push(
      <Section key="timeout-delivered" title="Claim timeout">
        <p className="text-sm text-muted">The dispute window passed uncontested. Release to the seller.</p>
        <ActionButton
          variant="outline"
          submit={(client, onPhase) => claimTimeout(client, deal.id, onPhase)}
          onChanged={onChanged}
        >
          Release to seller
        </ActionButton>
      </Section>,
    );
  }

  const done = blocks.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Actions</CardTitle>
        <Badge tone={role === "observer" || role === "disconnected" ? "neutral" : "brass"}>
          {role === "disconnected" ? "not connected" : `you are the ${role}`}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        {blocks}
        {done ? (
          <p className="text-sm text-muted">
            No action is available to you in this state. This deal is {status.toLowerCase()}
            {deal.final ? " and final" : ""}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
