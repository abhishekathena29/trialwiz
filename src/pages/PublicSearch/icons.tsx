export function CancerTypeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.5" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 20l3.5-6 3.5 6h-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <rect x="14" y="15" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function CentreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="11" r="2.4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20l-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="11" r="2.4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 7l7.5 6 7.5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8.5" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15.5 6a3 3 0 0 1 0 5.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16.5 14c2 .5 3.5 2.2 4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function XCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function FlaskIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M9.5 3.5h5M10 4v5.5L5.5 18a2 2 0 0 0 1.8 3h9.4a2 2 0 0 0 1.8-3L14 9.5V4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.5 15h9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}>
      <path
        d="M12 20.5s-7.5-4.6-9.7-9.4C1 7.7 2.7 4.5 6 4c2-.3 3.7.6 6 2.9C14.3 4.6 16 3.7 18 4c3.3.5 5 3.7 3.7 7.1C19.5 15.9 12 20.5 12 20.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
