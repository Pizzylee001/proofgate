'use client';

import { useState } from 'react';
import { Button, Card, SectionHeader, TxLink } from './ui';

const DEFAULT_TEXT =
  'Lend up to 75 PGUSD to anyone with 3 or more completed repayments to my vault on Ethereum Sepolia, paid in PGUSD.';

type Compiled = {
  maxLoanAmount: string;
  minCompletedRepayments: number;
  requiredSourceChainId: number;
  requiredSourceChainKey: number;
  requiredSourceToken: string;
  vaultAddress: string;
  rationale: string;
};

export function PolicySection({ onCommitted }: { onCommitted: (policyId: string) => void }) {
  const [english, setEnglish] = useState(DEFAULT_TEXT);
  const [busy, setBusy] = useState<'compile' | 'commit' | null>(null);
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [commit, setCommit] = useState<{ policyId: string; txHash: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  async function doCompile() {
    setBusy('compile'); setError(null); setCommit(null);
    try {
      const data = await post('/api/compile', { englishText: english });
      setCompiled(data.policy);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  async function doCommit() {
    setBusy('commit'); setError(null);
    try {
      const data = await post('/api/commit', { englishText: english });
      setCompiled(data.policy);
      setCommit({ policyId: data.policyId, txHash: data.txHash });
      onCommitted(data.policyId);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <section>
      <SectionHeader
        index="01"
        title="The Policy"
        blurb="The lender writes rules in plain English. The AI compiles them into a machine-readable policy — committed on-chain before any borrower applies, immutable forever after."
      />
      <Card>
        <textarea
          value={english}
          onChange={(e) => { setEnglish(e.target.value); setCompiled(null); setCommit(null); }}
          rows={3}
          className="w-full rounded-lg border border-room-border bg-room-bg p-3 text-sm leading-relaxed outline-none focus:border-room-green/60"
        />
        <div className="mt-3 flex gap-3">
          <Button onClick={doCompile} disabled={busy !== null}>
            {busy === 'compile' ? 'Compiling…' : 'Compile with AI'}
          </Button>
          <Button onClick={doCommit} disabled={busy !== null || !compiled}>
            {busy === 'commit' ? 'Committing on-chain…' : 'Commit policy on-chain'}
          </Button>
        </div>
        {error && <p className="mt-3 text-sm text-room-red">{error}</p>}
      </Card>

      {compiled && (
        <div className="mt-4">
          <Card tone="proven">
            <div className="grid gap-2 text-sm">
              <Row k="maxLoanAmount" v={`${compiled.maxLoanAmount} PGUSD`} />
              <Row k="minCompletedRepayments" v={String(compiled.minCompletedRepayments)} />
              <Row k="sourceChain" v={`Sepolia (${compiled.requiredSourceChainId} / chainKey ${compiled.requiredSourceChainKey})`} />
              <Row k="requiredSourceToken" v={compiled.requiredSourceToken} mono />
              <Row k="vaultAddress" v={compiled.vaultAddress} mono />
            </div>
            <p className="mt-3 border-t border-room-border pt-3 text-sm leading-relaxed text-room-text/90">
              <span className="text-room-green">AI rationale — </span>{compiled.rationale}
            </p>
            {commit && (
              <p className="mt-3 border-t border-room-border pt-3 text-sm">
                Committed as <span className="text-room-green font-semibold">policy #{commit.policyId}</span>
                {' — '}<TxLink hash={commit.txHash} />
              </p>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <span className="w-44 shrink-0 text-room-mono">{k}</span>
      <span className={mono ? 'room-mono break-all' : ''}>{v}</span>
    </div>
  );
}
