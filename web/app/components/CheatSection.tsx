'use client';

import { useState } from 'react';
import { Button, SectionHeader, TxLink } from './ui';

type CheatResult = {
  mode: string;
  detail: string;
  txHash: string;
  status: number;
  revertReason: string | null;
  explorerUrl: string;
  policyId?: string;
};

export function CheatSection() {
  const [busy, setBusy] = useState<'fabricate' | 'inflate' | null>(null);
  const [results, setResults] = useState<CheatResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function cheat(mode: 'fabricate' | 'inflate') {
    setBusy(mode); setError(null);
    try {
      const res = await fetch('/api/cheat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setResults((r) => [data as CheatResult, ...r]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <SectionHeader
        index="04"
        title="Try to Cheat"
        blurb="Go ahead. Forge a repayment, or inflate the claim. Every attempt is broadcast on-chain — and every failure below is the protocol's own revert, mined forever as evidence."
      />
      <div className="flex flex-wrap gap-3">
        <Button tone="danger" onClick={() => cheat('fabricate')} disabled={busy !== null}>
          {busy === 'fabricate' ? 'Broadcasting forgery…' : 'Fabricate a repayment'}
        </Button>
        <Button tone="danger" onClick={() => cheat('inflate')} disabled={busy !== null}>
          {busy === 'inflate' ? 'Broadcasting inflated claim…' : 'Inflate the claim'}
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-room-red">{error}</p>}

      <div className="mt-4 grid gap-4">
        {results.map((r) => (
          <div key={r.txHash} className="room-alarm rounded-xl p-5">
            <div className="flex items-center gap-2">
              <span className="text-room-red text-lg" aria-label="caught">✕</span>
              <span className="font-semibold text-room-red uppercase tracking-widest text-sm">
                {r.mode === 'fabricate' ? 'Fabrication rejected' : 'Inflation rejected'}
              </span>
              <span className="room-mono text-xs">status {r.status}</span>
            </div>
            <p className="mt-3 text-sm text-room-text/90 leading-relaxed">{r.detail}</p>
            <div className="mt-3 rounded-lg bg-room-bg/80 border border-room-red/40 p-3">
              <div className="text-xs uppercase tracking-widest text-room-red/80">on-chain revert</div>
              <div className="room-mono mt-1 text-sm text-room-red">
                {r.revertReason ?? 'execution reverted'}
              </div>
            </div>
            <p className="mt-3 text-xs">
              The reverted transaction is the evidence: <TxLink hash={r.txHash} />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
