import { ADDRESS } from "@/lib/sacramentum";
import { shortAddress } from "@/lib/format";

export function SiteFooter() {
  return (
    <footer className="border-t border-line-soft bg-ink-950">
      <div className="mx-auto flex max-w-[1536px] flex-col gap-3 px-5 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono">
          contract {shortAddress(ADDRESS, 6)} · Genlayer Studio Network
        </p>
        <p>
          held value always equals inflow minus outflow. Every release and refund is transferable, auditable, and
          one click away.
        </p>
      </div>
    </footer>
  );
}
