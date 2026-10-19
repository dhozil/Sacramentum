"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, Lock, Scale, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const Tribunal3D = dynamic(() => import("@/components/ui/escrow-armillary-3d"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-xs uppercase tracking-[0.28em] text-muted">
      assembling the tribunal…
    </div>
  ),
});

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-line-soft">
      <div className="drafting-grid absolute inset-0 opacity-60" aria-hidden />
      <div className="relative h-[86vh] min-h-[560px] w-full">
        <Tribunal3D embed height="100%" />
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#0a0d10_0%,rgba(10,13,16,0.94)_22%,rgba(10,13,16,0.5)_38%,rgba(10,13,16,0)_58%)]"
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 flex items-center">
          <div className="mx-auto w-full max-w-[1536px] px-5">
            <div className="pointer-events-auto max-w-lg">
              <p className="eyebrow text-brass">Agentic commerce · GenLayer</p>
              <h1 className="mt-4 text-balance text-5xl leading-[1.02] tracking-tight sm:text-6xl">
                Escrow that settles <span className="text-brass-bright">without trust</span>.
              </h1>
              <p className="mt-5 max-w-md text-balance text-base leading-relaxed text-parchment-dim">
                A buyer locks GEN against machine-readable terms. When a deliverable is filed, an AI panel
                reads the committed sources and releases value — with one bonded appeal before it is final.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
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
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted">
                <li className="inline-flex items-center gap-2">
                  <Lock className="size-3.5 text-brass" /> Funds held, never custodied
                </li>
                <li className="inline-flex items-center gap-2">
                  <Scale className="size-3.5 text-brass" /> Verdicts by validator panel
                </li>
                <li className="inline-flex items-center gap-2">
                  <Sparkles className="size-3.5 text-brass" /> Bonded single appeal
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
