'use client';

import { Card, SectionHeader } from './ui';

export type ProvenRepayment = {
  amountPgusd: string;
  blockHeight: number;
  txHash: string;
  explorerUrl: string;
};

export function HistorySection({ history }: { history: ProvenRepayment[] }) {
  return (
    <section>
      <SectionHeader
        index="02"
        title="The Proven History"
        blurb="Three repayments on Ethereum Sepolia — not claimed, cryptographically proven. Each was verified by the Attestcoin Protocol's Native Query Verifier precompile, synchronously, on Creditcoin."
      />
      <Card>
        <ul className="divide-y divide-room-border">
          {history.map((r) => (
            <li key={r.txHash} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
              <span className="text-room-green text-lg leading-none" aria-label="proven">✓</span>
              <span className="font-semibold text-room-green">{r.amountPgusd} PGUSD</span>
              <span className="room-mono">Sepolia block {r.blockHeight}</span>
              <a
                href={r.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="room-mono underline decoration-room-border underline-offset-4 hover:text-room-text transition-colors"
              >
                {r.txHash.slice(0, 10)}…{r.txHash.slice(-8)}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-room-border pt-3 text-xs tracking-wide text-room-green">
          Verified by the Attestcoin Protocol.
        </p>
      </Card>
    </section>
  );
}
