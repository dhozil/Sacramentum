"use client";

import * as React from "react";
import { useWallet } from "@/components/wallet/wallet-context";
import type { GenLayer } from "@/lib/genlayer";
import * as S from "@/lib/sacramentum";

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/** A read that never settles would otherwise leave the page spinning forever. */
const READ_TIMEOUT_MS = 20000;
const READ_TIMEOUT_MESSAGE =
  "The node did not answer in time. Check your connection, then refresh.";

function useRead<T>(run: (client: GenLayer) => Promise<T>, key: string): AsyncState<T> {
  const { read } = useWallet();
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  const runRef = React.useRef(run);
  React.useEffect(() => {
    runRef.current = run;
  });

  React.useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(READ_TIMEOUT_MESSAGE)), READ_TIMEOUT_MS);
    });

    Promise.race([runRef.current(read), timeout])
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(S.humanizeError(err));
      });

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [read, key, nonce]);

  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading: data === null && error === null, refresh };
}

export function useStats(): AsyncState<S.Stats> {
  return useRead((client) => S.getStats(client), "");
}

export function useDealIds(): AsyncState<string[]> {
  return useRead((client) => S.getDealIds(client), "");
}

export function useDeals(ids: string[] | null): AsyncState<S.Deal[]> {
  const key = ids ? ids.join(",") : "";
  return useRead(async (client) => {
    if (!ids || ids.length === 0) return [];
    return Promise.all(ids.map((id) => S.getDeal(client, id)));
  }, key);
}

export function useDeal(id: string | null): AsyncState<S.Deal> {
  return useRead((client) => (id ? S.getDeal(client, id) : Promise.resolve(null as never)), id ?? "");
}

export function useTerms(id: string | null): AsyncState<S.DealTerms> {
  return useRead((client) => (id ? S.getTerms(client, id) : Promise.resolve(null as never)), id ?? "");
}

export function useAudit(id: string | null): AsyncState<S.DealAudit> {
  return useRead((client) => (id ? S.getAudit(client, id) : Promise.resolve(null as never)), id ?? "");
}

export function useVerdict(id: string | null): AsyncState<S.Verdict> {
  return useRead((client) => (id ? S.getVerdict(client, id) : Promise.resolve(null as never)), id ?? "");
}

export function useLog(start = 0, count = 60): AsyncState<S.LogEntry[]> {
  return useRead((client) => S.getLog(client, start, count), `${start}:${count}`);
}
