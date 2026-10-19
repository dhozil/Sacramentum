import type { Metadata } from "next";
import { Archivo, Fraunces, IBM_Plex_Mono } from "next/font/google";
import { WalletProvider } from "@/components/wallet/wallet-context";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ParticleField } from "@/components/particle-field";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const body = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sacramentum — on-chain escrow tribunal",
  description:
    "Agentic commerce, settled without trust. GEN escrow releases only when a deliverable passes machine-readable terms, judged by an AI panel with one bonded appeal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-ink-950 text-parchment">
        <ParticleField />
        <div className="relative z-10 flex min-h-full flex-col">
          <WalletProvider>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </WalletProvider>
        </div>
      </body>
    </html>
  );
}
