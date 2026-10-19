import Link from "next/link";
import { WalletButton } from "@/components/wallet/wallet-button";

function Seal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="6.6" stroke="currentColor" strokeWidth="0.9" opacity="0.6" />
      <path d="M12 6.4v11.2M6.6 12h10.8" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path
        d="M8.4 15.2c0-2 1.6-3.6 3.6-3.6s3.6 1.6 3.6 3.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-ink-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1536px] items-center justify-between gap-6 px-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-sm border border-brass/40 bg-ink-900 text-brass">
            <Seal className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-lg tracking-tight">Sacramentum</span>
            <span className="block text-[0.6rem] uppercase tracking-[0.28em] text-muted">
              Escrow tribunal
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-parchment-dim sm:flex">
          <Link href="/market" className="transition-colors hover:text-brass-bright">
            Market
          </Link>
          <Link href="/open" className="transition-colors hover:text-brass-bright">
            Open a deal
          </Link>
          <Link href="/how-it-works" className="transition-colors hover:text-brass-bright">
            How it works
          </Link>
        </nav>

        <WalletButton />
      </div>
    </header>
  );
}
