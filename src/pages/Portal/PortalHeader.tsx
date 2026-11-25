import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/Logo';

export function PortalHeader({
  right,
  title = 'TrialWiz · Provider Portal',
  subtitle = 'Add and manage clinical trials — for doctors and their approved trial coordinators',
}: {
  right?: ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <header className="top">
      <div className="top-inner">
        <Logo />
        <div className="brand">
          <h1>
            <Link to="/" className="homelink">
              {title}
            </Link>
          </h1>
          <p className="byline">by Dr. Veenoo Agarwal &amp; Yashika Agarwal</p>
          <p>{subtitle}</p>
        </div>
        {right && (
          <div className="who">
            {/* Jump straight to the public Trial Finder's Search tab from any signed-in portal page. */}
            <Link to="/?tab=search" className="lockpill searchlink" title="Search all recruiting trials in the Trial Finder">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Search trials
            </Link>
            {right}
          </div>
        )}
      </div>
    </header>
  );
}
