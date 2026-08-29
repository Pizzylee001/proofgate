'use client';

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  const short = `${hash.slice(0, 10)}…${hash.slice(-8)}`;
  return (
    <a
      href={`https://creditcoin-testnet.blockscout.com/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className="room-mono underline decoration-room-border underline-offset-4 hover:text-room-text transition-colors"
    >
      {label ?? short}
    </a>
  );
}

export function Card({ children, tone }: { children: React.ReactNode; tone?: 'default' | 'proven' }) {
  const border = tone === 'proven' ? 'border-room-green/60' : 'border-room-border';
  return (
    <div className={`room-in rounded-xl border ${border} bg-room-panel p-5`}>{children}</div>
  );
}

export function SectionHeader({ index, title, blurb }: { index: string; title: string; blurb: string }) {
  return (
    <div className="mb-6">
      <div className="text-sm room-mono tracking-widest uppercase">{index}</div>
      <h2 className="text-2xl font-semibold mt-1">{title}</h2>
      <p className="text-room-mono mt-2 max-w-2xl text-sm leading-relaxed">{blurb}</p>
    </div>
  );
}

export function Button({
  children, onClick, disabled, tone = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  const styles =
    tone === 'danger'
      ? 'border-room-red text-room-red hover:bg-room-red/10'
      : 'border-room-green/70 text-room-green hover:bg-room-green/10';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles}`}
    >
      {children}
    </button>
  );
}
