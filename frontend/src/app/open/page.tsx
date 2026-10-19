"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, ScrollText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import { useTx } from "@/hooks/use-tx";
import { useNow } from "@/hooks/use-now";
import { useWallet } from "@/components/wallet/wallet-context";
import * as S from "@/lib/sacramentum";

interface CriterionDraft {
  id: string;
  text: string;
}

function defaultDeadline(): string {
  const date = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest.toString().padStart(2, "0")}s`;
}

function OpenForm() {
  const router = useRouter();
  const { read, address } = useWallet();
  const { busy, phase, error, run, canSign } = useTx();

  const [seller, setSeller] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [deadline, setDeadline] = React.useState(defaultDeadline);
  const [deliverable, setDeliverable] = React.useState("");
  const [criteria, setCriteria] = React.useState<CriterionDraft[]>([
    { id: "c1", text: "" },
    { id: "c2", text: "" },
  ]);
  const [sources, setSources] = React.useState("");
  const [startedAt, setStartedAt] = React.useState<number | null>(null);

  const updateCriterion = (index: number, patch: Partial<CriterionDraft>) =>
    setCriteria((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const addCriterion = () =>
    setCriteria((rows) =>
      rows.length >= S.PROTOCOL.maxCriteria ? rows : [...rows, { id: `c${rows.length + 1}`, text: "" }],
    );

  const removeCriterion = (index: number) =>
    setCriteria((rows) => rows.filter((_, i) => i !== index));

  const sourceList = React.useMemo(
    () =>
      sources
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, S.PROTOCOL.maxSources),
    [sources],
  );

  const cleanedCriteria = criteria
    .map((row) => ({ id: row.id.trim(), text: row.text.trim() }))
    .filter((row) => row.id && row.text);

  const deadlineUnix = Math.floor(new Date(deadline).getTime() / 1000);
  const now = useNow(1000);
  const elapsed = startedAt ? Math.max(0, now - startedAt) : 0;
  const problems: string[] = [];
  if (!/^0x[a-fA-F0-9]{40}$/.test(seller.trim())) problems.push("Seller must be a 0x… address.");
  if (address && seller.trim().toLowerCase() === address.toLowerCase()) {
    problems.push("Buyer and seller must differ.");
  }
  if (!title.trim()) problems.push("A title is required.");
  if (title.trim().length > S.PROTOCOL.maxTitle) {
    problems.push(`Keep the title under ${S.PROTOCOL.maxTitle} characters.`);
  }
  if (!(deadlineUnix > now)) problems.push("The deadline must be in the future.");
  if (!deliverable.trim()) problems.push("Name the deliverable.");
  if (cleanedCriteria.length === 0) problems.push("Add at least one criterion.");
  const duplicate = new Set(cleanedCriteria.map((row) => row.id)).size !== cleanedCriteria.length;
  if (duplicate) problems.push("Criterion ids must be unique.");
  if (sourceList.some((url) => !url.startsWith("https://"))) problems.push("Evidence URLs must start with https://.");

  const submit = async () => {
    if (busy) return;
    setStartedAt(Math.floor(Date.now() / 1000));
    const termsJson = JSON.stringify({ deliverable: deliverable.trim(), criteria: cleanedCriteria });
    try {
      const result = await run((client, onPhase) =>
        S.openDeal(
          client,
          {
            seller: seller.trim(),
            title: title.trim(),
            termsJson,
            deadlineUnix,
            evidenceUrls: sourceList,
          },
          onPhase,
        ),
      );
      if (result?.ok && read) {
        try {
          const ids = await S.getDealIds(read);
          const latest = ids[ids.length - 1];
          if (latest) router.push(`/deal/${latest}`);
        } catch {
          router.push("/market");
        }
      }
    } finally {
      setStartedAt(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-sm border border-brass/40 bg-ink-900 text-brass">
          <ScrollText className="size-5" />
        </span>
        <div>
          <p className="eyebrow text-brass">Open a deal</p>
          <h1 className="mt-1 text-3xl">Commit machine-readable terms</h1>
        </div>
      </div>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
        You are the buyer. These terms are hashed into a digest and cannot change afterwards. Declare the
        sources the panel may read up front — nothing outside them counts.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Parties &amp; window</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Seller address" htmlFor="seller" hint={address ? `Your buyer address: ${address}` : "Connect a wallet as buyer."}>
              <Input
                id="seller"
                value={seller}
                onChange={(event) => setSeller(event.target.value)}
                placeholder="0x…"
              />
            </Field>
            <Field label="Deadline" htmlFor="deadline" hint="After this, an undelivered deal refunds the buyer.">
              <Input
                id="deadline"
                type="datetime-local"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Title" htmlFor="title">
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Design a landing page for the launch"
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="Deliverable" htmlFor="deliverable" hint="One sentence: what exactly is owed.">
            <Textarea
              id="deliverable"
              value={deliverable}
              onChange={(event) => setDeliverable(event.target.value)}
              placeholder="A responsive marketing page deployed to the given URL, matching the brand kit."
            />
          </Field>

          <div>
            <div className="flex items-center justify-between">
              <Label>Criterion</Label>
              <span className="text-xs text-muted">
                {cleanedCriteria.length}/{S.PROTOCOL.maxCriteria}
              </span>
            </div>
            <div className="space-y-3">
              {criteria.map((row, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Input
                    aria-label={`Criterion ${index + 1} id`}
                    className="w-20 shrink-0 font-mono text-xs"
                    value={row.id}
                    onChange={(event) => updateCriterion(index, { id: event.target.value })}
                  />
                  <Input
                    aria-label={`Criterion ${index + 1} text`}
                    value={row.text}
                    onChange={(event) => updateCriterion(index, { text: event.target.value })}
                    placeholder="The page loads under 2s on 3G."
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label="Remove criterion"
                    disabled={criteria.length <= 1}
                    onClick={() => removeCriterion(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={criteria.length >= S.PROTOCOL.maxCriteria}
              onClick={addCriterion}
            >
              <Plus /> Add criterion
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Evidence manifest</CardTitle>
        </CardHeader>
        <CardContent>
          <Field
            label={`Sources (max ${S.PROTOCOL.maxSources})`}
            hint="One https:// URL per line. The panel reads only these."
          >
            <Textarea
              value={sources}
              onChange={(event) => setSources(event.target.value)}
              placeholder={"https://ipfs.io/ipfs/…\nhttps://example.com/spec.pdf"}
            />
          </Field>
          <p className="mt-2 text-xs text-muted">
            {sourceList.length} source{sourceList.length === 1 ? "" : "s"} will be committed.
          </p>
        </CardContent>
      </Card>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs text-muted">
          {problems.length ? (
            <ul className="space-y-1 text-seal">
              {problems.map((problem) => (
                <li key={problem}>• {problem}</li>
              ))}
            </ul>
          ) : (
            <p>Ready to commit.</p>
          )}
        </div>
        <Button size="lg" disabled={busy || problems.length > 0 || !canSign} aria-busy={busy} onClick={submit}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" />
              {phase === "signing" ? "Signing…" : "Waiting for consensus…"}
            </>
          ) : (
            "Open deal"
          )}
        </Button>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="mt-3">
        {busy ? (
          <p className="text-xs text-muted">
            {phase === "signing"
              ? "Confirm in your wallet."
              : `Validators are reaching consensus — this can take a few minutes${
                  elapsed ? ` (${formatElapsed(elapsed)})` : ""
                }. Keep this page open; it will not fail early.`}
          </p>
        ) : null}
      </div>
      {!canSign ? <p className="mt-3 text-xs text-muted">Connect a wallet to open a deal.</p> : null}
      {error ? <p className="mt-3 text-sm text-seal">{error}</p> : null}
    </div>
  );
}

export default function OpenDealPage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-5 py-28 text-center text-sm text-muted">Loading…</div>
      }
    >
      <OpenForm />
    </React.Suspense>
  );
}
