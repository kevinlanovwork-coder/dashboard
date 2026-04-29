import { useEffect } from 'react';

// Schedule the next refresh at the next 15-minute wall-clock boundary + 60s grace
// so we land just after the new scrape has written its rows.
export function msUntilNextRefresh() {
  const now = new Date();
  const next = new Date(now);
  const slot = (Math.floor(now.getMinutes() / 15) + 1) * 15;
  next.setMinutes(slot, 60, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

// Healthy: next 15-min boundary; errored: 60s retry until success.
export function useLiveRefresh(onTick: () => void, errored: boolean) {
  useEffect(() => {
    let cycleTimeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const ms = errored ? 60_000 : msUntilNextRefresh();
      cycleTimeout = setTimeout(() => {
        onTick();
        schedule();
      }, ms);
    };
    schedule();
    return () => clearTimeout(cycleTimeout);
  }, [onTick, errored]);
}
