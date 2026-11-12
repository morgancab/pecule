import { useEffect, useMemo, useState } from 'react';
import type { Account } from '../types';
import { buildSeries } from './analytics';
import { fetchMarket, referenceOf, type MarketData } from './market';

let cache: { key: string; data: MarketData } | null = null;

/** Série du patrimoine + données de marché publiques correspondant aux références des comptes. */
export function useMarket(accounts: Account[]) {
  const series = useMemo(() => buildSeries(accounts), [accounts]);
  const symbols = useMemo(() => [...new Set(accounts.map(referenceOf).filter(Boolean).map((r) => r!.ticker))].sort(), [accounts]);
  const from = series[0]?.date ?? '';
  const key = `${symbols.join(',')}|${from}`;
  const [market, setMarket] = useState<MarketData | null>(cache?.key === key ? cache.data : null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!from) return;
    if (cache?.key === key) {
      setMarket(cache.data);
      return;
    }
    let alive = true;
    fetchMarket(symbols, from)
      .then((d) => {
        cache = { key, data: d };
        if (alive) setMarket(d);
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [key, from, symbols]);
  return { series, market, error, loading: !market && !error && !!from };
}
