'use client';

import { useState } from 'react';
import { Button, Card, SectionHeader, TxLink } from './ui';

const BORROWER = '0x7Fe2d9F882544d2EE23fc0A4719B4DB95Db5d27B';

type Phase = 'idle' | 'proving' | 'thinking' | 'executing' | 'done' | 'declined' | 'error';

type Receipt = {
  releasedAmount: string;
  claimedAmount: string;
  rationaleHash: string;
  proofsUsed: number;
};

const STEPS: Array<{ key: Phase; label: string }> = [
  { key: 'proving', label: 'proving' },
  { key: 'thinking', label: 'thinking' },
  { key: 'executing', label: 'executing' },
];

export function DecisionSection({ policyId, onBalance }: { policyId: string; onBalance: (b: string) => void }) {
  const [ask, setAsk] = useState('50');
  const [phase, setPhase] = useState<Phase>('idle');
  const [proofProgress, setProofProgress] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [rationale, setRationale] = useState('');
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState<string | null>(null);

  const stepIndex = phase === 'proving' ? 0 : phase === 'thinking' ? 1 : phase === 'executing' ? 2 : phase === 'done' || phase === 'declined' ? 3 : -1;

  async function run() {
    setPhase('proving'); setError(null); setReceipt(null); setRationale(''); setTxHash(''); setProofProgress('');
    try {
      const res = await fetch('/api/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policyId, borrower: BORROWER, askAmount: ask }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.phase === 'proving') {
            setPhase('proving');
            setProofProgress(`${evt.done}/${evt.total} proofs verified on-chain`);
          } else if (evt.phase === 'thinking') setPhase('thinking');
          else if (evt.phase === 'executing') setPhase('executing');
          else if (evt.phase === 'declined') { setPhase('declined'); setRationale(evt.rationale); }
          else if (evt.phase === 'done') {
            setPhase('done');
            setReceipt(evt.receipt);
            setRationale(evt.rationale);
            setTxHash(evt.txHash);
            if (evt.balanceAfter) onBalance(evt.balanceAfter);
          } else if (evt.phase === 'error') { setPhase('error'); setError(evt.message); }
        }
      }
    } catch (e) {
      setPhase('error');
      setError((e as Error).message);
    }
  }

  const busy = phase === 'proving' || phase === 'thinking' || phase === 'executing';

  return (
    <section>
      <SectionHeader
        index="03"
        title="The Decision"
        blurb="The agent reads the committed policy and the proven history, decides within the policy, and executes. The contract releases the decoded, proven total, never the claim."
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">
            <span className="text-room-mono">policy</span>
            <span className="room-mono rounded-lg border border-room-border bg-room-bg px-3 py-2">#{policyId}</span>
          </label>
          <label className="grid gap-1">
            <span className="text-room-mono">borrower</span>
            <span className="room-mono rounded-lg border border-room-border bg-room-bg px-3 py-2">
              {BORROWER.slice(0, 8)}…{BORROWER.slice(-6)}
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-room-mono">ask (PGUSD)</span>
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              className="w-28 rounded-lg border border-room-border bg-room-bg px-3 py-2 outline-none focus:border-room-green/60"
            />
          </label>
          <Button onClick={run} disabled={busy || !policyId}>
            {busy ? 'Agent at work…' : 'Ask the agent'}
          </Button>
        </div>

        {phase !== 'idle' && (
          <div className="mt-4 flex items-center gap-2 text-xs room-mono">
            {STEPS.map((s, i) => (
              <span key={s.key} className="flex items-center gap-2">
                <span className={i < stepIndex ? 'text-room-green' : i === stepIndex ? 'text-room-text' : 'text-room-mono/50'}>
                  {i < stepIndex ? '✓ ' : ''}{s.label}
                </span>
                {i < STEPS.length - 1 && <span className="text-room-mono/40">→</span>}
              </span>
            ))}
            {proofProgress && phase === 'proving' && <span className="ml-2">{proofProgress}</span>}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-room-red">{error}</p>}
      </Card>

      {phase === 'declined' && (
        <div className="mt-4">
          <Card>
            <p className="text-sm font-semibold">The agent declined.</p>
            <p className="mt-2 text-sm leading-relaxed text-room-text/90">{rationale}</p>
          </Card>
        </div>
      )}

      {phase === 'done' && receipt && (
        <div className="mt-4">
          <Card tone="proven">
            <div className="flex flex-wrap items-baseline gap-x-10 gap-y-2">
              <div>
                <div className="text-xs uppercase tracking-widest text-room-mono">released (decoded, proven)</div>
                <div className="text-4xl font-bold text-room-green mt-1">{receipt.releasedAmount} PGC</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-room-mono">claimed (what the AI said)</div>
                <div className="text-2xl font-semibold mt-2">{receipt.claimedAmount} PGC</div>
              </div>
            </div>
            <p className="mt-4 border-t border-room-border pt-3 text-sm leading-relaxed text-room-text/90">{rationale}</p>
            <div className="mt-3 grid gap-1 text-xs">
              <div className="flex gap-2 flex-wrap">
                <span className="text-room-mono w-28 shrink-0">rationaleHash</span>
                <span className="room-mono break-all">{receipt.rationaleHash}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-room-mono w-28 shrink-0">proofsUsed</span>
                <span className="room-mono">{receipt.proofsUsed}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-room-mono w-28 shrink-0">tx</span>
                <TxLink hash={txHash} />
              </div>
            </div>
            <p className="mt-3 text-xs text-room-green">The decision receipt: the AI's reasoning, hashed on-chain next to what the proofs supported.</p>
          </Card>
        </div>
      )}
    </section>
  );
}
