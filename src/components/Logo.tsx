import { Link } from 'react-router-dom';

/** Top-left brand mark — always links back to the public Trial Finder home. */
export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" className="logo" onClick={onClick} aria-label="TrialWiz home">
      <img src="/logo.jpeg" alt="TrialWiz" />
    </Link>
  );
}
