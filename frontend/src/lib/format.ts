export const ATTO = 10n ** 18n;

/** Render an atto amount as GEN, trimming trailing zeros. Precision-safe for bigints. */
export function formatGen(atto: string | bigint, decimals = 4): string {
  const value = BigInt(atto);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / ATTO;
  const frac = abs % ATTO;
  const fracStr = frac
    .toString()
    .padStart(18, "0")
    .slice(0, decimals)
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fracStr ? `.${fracStr}` : ""}`;
}

export function gen(wholeOrDecimal: string | number): bigint {
  const text = String(wholeOrDecimal).trim();
  const [whole, frac = ""] = text.split(".");
  const padded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * ATTO + BigInt(padded || "0");
}

export function shortAddress(address?: string, size = 4): string {
  if (!address) return "";
  const clean = address.trim();
  if (clean.length <= size * 2 + 2) return clean;
  return `${clean.slice(0, size + 2)}…${clean.slice(-size)}`;
}

export function sameAddress(
  a?: string | null,
  b?: string | null,
): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function formatUnix(seconds: number | string): string {
  const value = Number(seconds);
  if (!value) return "—";
  return new Date(value * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** "in 3h" / "12m ago" — coarse, for deadlines and windows. */
export function relativeTime(seconds: number | string, now = Date.now() / 1000): string {
  const target = Number(seconds);
  if (!target) return "—";
  const delta = target - now;
  const abs = Math.abs(delta);
  const unit =
    abs < 60
      ? ["s", 1]
      : abs < 3600
        ? ["m", 60]
        : abs < 86400
          ? ["h", 3600]
          : ["d", 86400];
  const amount = Math.round(abs / (unit[1] as number));
  return delta >= 0 ? `in ${amount}${unit[0]}` : `${amount}${unit[0]} ago`;
}

export function bpsToPercent(bps: number | string): string {
  const value = Number(bps);
  const percent = value / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
