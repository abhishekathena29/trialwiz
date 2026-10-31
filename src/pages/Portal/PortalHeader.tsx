import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/Logo';

export function PortalHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="top">
      <div className="top-inner">
        <Logo />
        <div className="brand">
          <h1>
            <Link to="/" className="homelink">
              TrialWiz · Provider Portal
            </Link>
          </h1>
          <p className="byline">by Dr. Veenoo Agarwal</p>
          <p>Add and manage clinical trials — for doctors and their approved trial coordinators</p>
        </div>
        {right && <div className="who">{right}</div>}
      </div>
    </header>
  );
}
