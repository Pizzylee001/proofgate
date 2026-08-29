'use client';

import { useEffect, useState } from 'react';
import { PolicySection } from './components/PolicySection';
import { HistorySection, type ProvenRepayment } from './components/HistorySection';
import { DecisionSection } from './components/DecisionSection';
import { CheatSection } from './components/CheatSection';

export default function Home() {
  const [history, setHistory] = useState<ProvenRepayment[]>([]);
  const [policyId, setPolicyId] = useState<string>('');
  const [balance, setBalance] = useState<string>('');

  useEffect(() => {
    fetch('/api/state')
      .then((r) => r.json())
      .then((d) => {
        setHistory(d.provenHistory ?? []);
        setPolicyId(String(d.policyCount ?? ''));
        setBalance(d.borrowerBalance ?? '');
      })
      .catch(() => {});
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
            <path d="M19 53 V29 A13 12 0 0 1 45 29 V53" fill="none" stroke="#EDF2F7" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M25 34.5 L30 39.5 L39.5 28.5" fill="none" stroke="#2EE6A8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="text-lg font-bold tracking-tight">ProofGate</div>
        </div>
        <a
          href="https://github.com/Pizzylee001/proofgate"
          target="_blank"
          rel="noreferrer"
          className="room-mono text-xs underline decoration-room-border underline-offset-4 hover:text-room-text"
        >
          github.com/Pizzylee001/proofgate
        </a>
      </header>

      <section className="py-14">
        <div className="room-mono text-xs uppercase tracking-[0.3em]">The Protocol Room</div>
        <h1 className="mt-4 text-4xl font-bold leading-tight">
          The AI interprets the policy.<br />The contract enforces it.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-room-mono">
          A lender writes lending rules in plain English. An AI agent compiles them into a
          policy committed on-chain before anyone applies. Credit moves only when the
          Attestcoin Protocol has cryptographically proven the borrower's history.
        </p>
        {balance && (
          <p className="mt-4 text-xs room-mono">
            borrower PGC balance on Creditcoin testnet: <span className="text-room-green">{balance}</span>
          </p>
        )}
      </section>

      <div className="grid gap-16">
        <PolicySection onCommitted={(id) => setPolicyId(id)} />
        <HistorySection history={history} />
        <DecisionSection policyId={policyId} onBalance={setBalance} />
        <CheatSection />
      </div>

      <footer className="mt-24 border-t border-room-border pt-6 text-xs room-mono">
        Creditcoin CC3 testnet · Attestcoin Protocol · every hash on this page is a real transaction
      </footer>
    </main>
  );
}
