import type { ReactNode } from 'react';
import { Logo } from '../../components/Logo';

export function AdminHeader({ right }: { right?: ReactNode }) {
  return (
    <>
      <div className="conf">
        🔒 <b>INTERNAL — CONFIDENTIAL.</b> Owner / commercial-entity access only. Not part of the public directory.
      </div>
      <header className="top">
        <div className="top-inner">
          <Logo />
          <div className="brand">
            <h1>TrialWiz · Demand Intelligence</h1>
            <p className="byline">by Dr. Veenoo Agarwal</p>
            <p>What India is searching for — the feasibility signal, in aggregate</p>
          </div>
          {right && <div className="who">{right}</div>}
        </div>
      </header>
    </>
  );
}
