import { useState } from 'react';
import { telHref } from '../utils/format';

/** True on phones/tablets — devices where a `tel:` link places a call. On a desktop browser it
 * hands off to FaceTime / Skype / a "pick an app" prompt instead, which nobody wants. */
function canPlaceCalls(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPod|Mobile|Windows Phone/i.test(ua)) return true;
  // iPadOS reports itself as a Mac; tell it apart by touch support.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/**
 * "Call nearest site". Always reveals the phone number on the button; on a phone it also dials it.
 * On a computer it never opens FaceTime — the number is shown (with a copy button) instead.
 */
export function CallSiteButton({ phone, onUse }: { phone: string; onUse?: () => void }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const tel = telHref(phone);

  function click() {
    onUse?.();
    setShown(true);
    if (canPlaceCalls()) window.location.href = `tel:${tel}`;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the number is on screen to copy by hand.
    }
  }

  if (!shown) {
    return (
      <button type="button" className="btn primary" onClick={click}>
        Call nearest site
      </button>
    );
  }
  return (
    <span className="btn primary callshown">
      <a href={`tel:${tel}`} onClick={(e) => !canPlaceCalls() && e.preventDefault()}>
        📞 {phone}
      </a>
      <button type="button" className="copybtn" onClick={copy} aria-label="Copy phone number">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}
