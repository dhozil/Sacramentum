import Link from "next/link";
import type { ComponentType } from "react";
import {
  ArrowRight,
  Check,
  Coins,
  FileCheck2,
  Gavel,
  Handshake,
  Lock,
  ScrollText,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  {
    icon: ScrollText,
    who: "Buyer",
    title: "Write the deal as terms",
    body: "Spell out what is owed and the criteria it must meet — a deliverable plus a list of checks. Name the sources the panel may read. These are hashed into a digest and frozen.",
    state: "OPEN",
  },
  {
    icon: Lock,
    who: "Buyer",
    title: "Lock the escrow",
    body: "Send GEN into the contract. The escrow is exactly what you send; nobody custodies it but the contract itself.",
    state: "FUNDED",
  },
  {
    icon: Handshake,
    who: "Seller",
    title: "Accept the terms",
    body: "By accepting, the seller binds to the frozen terms. No negotiation afterwards — what was committed is what is judged.",
    state: "ACCEPTED",
  },
  {
    icon: FileCheck2,
    who: "Seller",
    title: "File the deliverable",
    body: "Record an https:// link to the work, with a short note. The clock starts on the buyer's review window.",
    state: "DELIVERED",
  },
  {
    icon: Gavel,
    who: "Either side",
    title: "Confirm — or contest",
    body: "Happy path: the buyer confirms and the money releases at once. Otherwise either party opens a dispute within one hour and files evidence.",
    state: "DISPUTED",
  },
  {
    icon: ShieldCheck,
    who: "Anyone",
    title: "Verdict, then finality",
    body: "An AI panel reads the committed evidence and decides the outcome and the split. Either side may appeal once with a bond; then anyone can finalize and cash moves.",
    state: "RESOLVED → FINALIZED",
  },
];

const FAQ = [
  {
    q: "Do I have to trust the AI panel?",
    a: "Validators must agree on the outcome exactly, and on the release split within a small tolerance — otherwise no verdict is written. If you still disagree, you can appeal once and a second panel decides.",
  },
  {
    q: "What if the seller never delivers?",
    a: "Once the deadline passes, anyone can trigger a timeout and the buyer is refunded in full. Funds are never stuck.",
  },
  {
    q: "What if nobody disputes a delivery?",
    a: "After the one-hour dispute window closes uncontested, the escrow releases to the seller automatically through the same timeout backstop.",
  },
  {
    q: "What is the panel allowed to read?",
    a: "Only the sources committed at open time, plus the evidence both sides file. Nothing outside the manifest counts, so the buyer cannot move the goalposts.",
  },
  {
    q: "Can the buyer back out?",
    a: "Yes — before a delivery is filed, the buyer can cancel and recover the full escrow. After delivery, the dispute process takes over.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-[1536px] px-6 py-14">
      <header className="max-w-3xl">
        <p className="eyebrow text-brass">How it works</p>
        <h1 className="mt-3 text-5xl leading-[1.05]">A promise becomes money, in six moves</h1>
        <p className="mt-5 text-base leading-relaxed text-parchment-dim">
          You do not have to trust the other side, or a middleman. The buyer commits terms and funds escrow;
          the seller delivers; if they disagree, an AI panel reads the committed evidence and settles it. This
          is the whole path, start to finish.
        </p>
      </header>

      <section className="mt-12 grid gap-5 md:grid-cols-2">
        <Card className="p-6">
          <Badge tone="brass">Buyer</Badge>
          <h2 className="mt-4 text-2xl">The one who pays</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-parchment-dim">
            {[
              "Commits the terms and the evidence manifest.",
              "Funds the escrow and can cancel before delivery.",
              "Confirms a good delivery to release instantly.",
              "Contests a bad one and files evidence.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-brass" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-6">
          <Badge tone="parchment">Seller</Badge>
          <h2 className="mt-4 text-2xl">The one who delivers</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-parchment-dim">
            {[
              "Accepts the frozen terms to bind the deal.",
              "Files the deliverable against those terms.",
              "Files evidence if the buyer disputes.",
              "Gets paid the moment a verdict clears.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-brass" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="mt-16">
        <div className="flex items-center gap-3">
          <Users className="size-5 text-brass" />
          <h2 className="text-3xl">The path, step by step</h2>
        </div>
        <ol className="mt-8 space-y-4">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Card className="flex flex-col gap-5 p-6 sm:flex-row">
                <div className="flex items-center gap-4 sm:w-44 sm:shrink-0 sm:flex-col sm:items-start">
                  <span className="grid size-11 place-items-center rounded-sm border border-brass/40 bg-ink-950 text-brass">
                    <step.icon className="size-5" />
                  </span>
                  <div>
                    <p className="font-mono text-xs text-muted">
                      Step {String(index + 1).padStart(2, "0")}
                    </p>
                    <Badge tone="neutral" className="mt-1">
                      {step.who}
                    </Badge>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xl">{step.title}</h3>
                    <span className="font-mono text-[0.68rem] uppercase tracking-wider text-brass-bright">
                      {step.state}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-5 text-brass" />
          <h2 className="text-3xl">Under the hood</h2>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          None of this is a promise an operator keeps. Every move is a call to the contract on the Genlayer
          Studio Network, and the timings and rules below are the contract&apos;s own constants.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { value: "1 hour", label: "to dispute a delivery" },
            { value: "30 min", label: "to file evidence once a dispute opens" },
            { value: "1 hour", label: "to appeal the first verdict" },
          ].map((item) => (
            <Card key={item.label} className="p-5">
              <p className="font-mono text-2xl text-brass-bright">{item.value}</p>
              <p className="mt-1 text-sm text-muted">{item.label}</p>
            </Card>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <Gavel className="size-5 text-brass" />
            <h3 className="mt-3 text-base">Validators must agree</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              The verdict must match exactly; the split must land within a small tolerance. If the panel cannot
              agree, no verdict is written and the dispute stays open — a later call can try again.
            </p>
          </Card>
          <Card className="p-5">
            <Lock className="size-5 text-brass" />
            <h3 className="mt-3 text-base">Who may run each step</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              The buyer funds, cancels and confirms; the seller accepts and delivers; either side disputes and
              files evidence. Adjudicating, finalizing and claiming a timeout are open to anyone.
            </p>
          </Card>
          <Card className="p-5">
            <Coins className="size-5 text-brass" />
            <h3 className="mt-3 text-base">The split is integer basis points</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              A verdict names an outcome and a release share in basis points — compliant pays the seller in
              full, non-compliant refunds the buyer, partial splits it. An appeal bond is 25% of the escrow.
            </p>
          </Card>
        </div>
      </section>

      <section className="mt-16 grid gap-5 lg:grid-cols-3">
        <Card className="p-6">
          <ScrollText className="size-5 text-brass" />
          <h3 className="mt-3 text-lg">Judged on a digest</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Your terms are canonicalised and hashed the moment the deal opens. The panel judges the delivery
            against exactly those criteria — not against anything said later.
          </p>
        </Card>
        <Card className="p-6">
          <Gavel className="size-5 text-brass" />
          <h3 className="mt-3 text-lg">One clear verdict</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The panel returns an outcome — compliant, non-compliant, or partial — and a split of the escrow.
            Validators must agree, or no verdict is written.
          </p>
        </Card>
        <Card className="p-6">
          <Coins className="size-5 text-brass" />
          <h3 className="mt-3 text-lg">Money you can trace</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Every release and refund is a transferable on-chain event. Held value always equals inflow minus
            outflow — the books balance, publicly.
          </p>
        </Card>
      </section>

      <section className="mt-16">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Timer className="size-5 text-brass" /> A landing page that goes wrong
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted">
            <p>
              A buyer posts a deal: a responsive landing page, with criteria the panel can check (loads under
              two seconds, matches the brand kit). They lock escrow and name the URL where the page must live.
            </p>
            <p>
              The seller accepts and points the deliverable at a live URL. The buyer inspects it, decides it
              does not match the brand kit, and disputes within the hour with a note and a screenshot link.
            </p>
            <p>
              Both sides file their evidence. The panel reads only those sources, finds one criterion met and
              one not, and splits the escrow — say 40% to the seller. The buyer disagrees and appeals once,
              posting the bond. A second panel reaches the same reading; the verdict is final. Anyone finalizes
              and the two parties are paid their share.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-16">
        <h2 className="text-3xl">Guarantees</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Guarantee icon={ShieldCheck} title="No custodian" body="The contract holds the escrow, not a person." />
          <Guarantee icon={Coins} title="Conserved" body="Held = inflow − outflow, always." />
          <Guarantee icon={Timer} title="Never stuck" body="Timeouts refund or release automatically." />
          <Guarantee icon={Gavel} title="Contestable" body="One bonded appeal before a verdict is final." />
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-3xl">Common questions</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {FAQ.map((item) => (
            <Card key={item.q} className="p-5">
              <h3 className="text-base">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.a}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-16 flex flex-wrap items-center justify-between gap-6 rounded-md border border-line-soft bg-gradient-to-b from-ink-850 to-ink-900 p-8">
        <div>
          <Badge tone="brass">Genlayer Studio Network</Badge>
          <h2 className="mt-4 text-2xl">Ready to run one?</h2>
          <p className="mt-2 max-w-md text-sm text-muted">
            Open a deal with your own terms and watch each state land on-chain.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/open">
            <Button size="lg">
              Open a deal <ArrowRight />
            </Button>
          </Link>
          <Link href="/market">
            <Button size="lg" variant="outline">
              Browse the market
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function Guarantee({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Card className="p-5">
      <Icon className="size-5 text-brass" />
      <h3 className="mt-3 text-base">{title}</h3>
      <p className="mt-1.5 text-sm text-muted">{body}</p>
    </Card>
  );
}
