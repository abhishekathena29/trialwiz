import { useEffect, useMemo, useState } from 'react';
import { authorizePi, canPiAuthorize, subscribeHospitalPiAuthorizations } from '../../services/piAuthorization';
import type { PiAuthorization, UserProfile } from '../../types';
import { formatTimestamp, timestampMs } from '../../utils/timestamps';
import './Portal.css';

interface Props {
  /** The signed-in, verified Principal Investigator. */
  me: UserProfile;
  /** Every PI profile at `me`'s hospital (including `me`). */
  hospitalPis: UserProfile[];
}

function statusPill(p: UserProfile) {
  if (p.status === 'approved') return <span className="pill approved">Verified</span>;
  if (p.status === 'rejected') return <span className="pill rejected">Not approved</span>;
  return <span className="pill pending">Pending</span>;
}

/**
 * A verified PI's view of the other Principal Investigators registered at the same hospital.
 * They can authorize pending ones — same hospital only, enforced by firestore.rules — and see the
 * hospital's authorization history.
 */
export function HospitalPisSection({ me, hospitalPis }: Props) {
  const [history, setHistory] = useState<PiAuthorization[]>([]);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => subscribeHospitalPiAuthorizations(me.facility ?? '', setHistory), [me.facility]);

  const others = useMemo(() => hospitalPis.filter((p) => p.uid !== me.uid), [hospitalPis, me.uid]);
  const pending = others.filter((p) => p.status === 'pending');
  const decided = others.filter((p) => p.status !== 'pending');
  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => (timestampMs(b.authorizedAt) ?? 0) - (timestampMs(a.authorizedAt) ?? 0)),
    [history],
  );

  async function handleAuthorize(pi: UserProfile) {
    if (
      !window.confirm(
        `Authorize ${pi.name} (${pi.email}) as a Principal Investigator at ${me.facility}?\n\n` +
          'They will be able to claim and close trials, approve coordinators, and authorize other PIs at this hospital. ' +
          'Your name is recorded as the authorizer.',
      )
    )
      return;
    setBusyUid(pi.uid);
    setFeedback(null);
    try {
      await authorizePi(pi, { uid: me.uid, name: me.name, email: me.email, role: 'pi', facility: me.facility });
      setFeedback({ ok: true, text: `${pi.name} is now a verified Principal Investigator.` });
    } catch (e) {
      console.error('[TrialWiz] PI authorization failed:', e);
      setFeedback({
        ok: false,
        text:
          e instanceof Error && /permission/i.test(e.message)
            ? 'Not permitted — you can only authorize pending Principal Investigators at your own hospital.'
            : e instanceof Error
              ? e.message
              : 'Authorization failed.',
      });
    } finally {
      setBusyUid(null);
    }
  }

  if (!me.facility?.trim()) {
    return (
      <div className="card full">
        <div className="sup">
          Your profile has no hospital set, so there are no same-hospital Principal Investigators to show. Contact
          TrialWiz admin to add your hospital.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="sechead2" style={{ marginTop: 0 }}>
        <h2>Principal Investigators at {me.facility}</h2>
        <span className="sup">
          As a verified PI you can authorize other Principal Investigators who registered at your hospital. PIs at other
          hospitals are verified by their own hospital's PIs or by TrialWiz admin.
        </span>
      </div>

      {feedback && (
        <div
          className="note"
          style={
            feedback.ok
              ? { background: '#e3f7e9', color: '#16794b', borderColor: '#a3e6b7' }
              : { background: 'var(--red-w)', color: 'var(--red)', borderStyle: 'solid' }
          }
        >
          {feedback.ok ? '✓ ' : ''}
          {feedback.text}
        </div>
      )}

      <div className="sechead2">
        <h2>Awaiting authorization ({pending.length})</h2>
      </div>
      <div className="card full">
        {pending.length === 0 ? (
          <div className="sup">No Principal Investigators at your hospital are waiting for authorization.</div>
        ) : (
          pending.map((p) => (
            <div className="reqrow" key={p.uid}>
              <div className="reqinfo">
                <b>{p.name}</b>
                <span>
                  {p.email}
                  {p.specialization && ` · ${p.specialization}`}
                  {' · registered '}
                  {formatTimestamp(p.createdAt)}
                </span>
              </div>
              <div className="reqactions">
                <button
                  className="btn primary"
                  disabled={busyUid === p.uid || !canPiAuthorize(me, p)}
                  onClick={() => handleAuthorize(p)}
                >
                  {busyUid === p.uid ? 'Authorizing…' : 'Authorize PI'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="sechead2">
        <h2>Other PIs at your hospital ({decided.length})</h2>
      </div>
      <div className="card full">
        {decided.length === 0 ? (
          <div className="sup">You're the only verified Principal Investigator registered at this hospital so far.</div>
        ) : (
          decided.map((p) => (
            <div className="reqrow" key={p.uid}>
              <div className="reqinfo">
                <b>{p.name}</b>
                <span>
                  {p.email}
                  {p.specialization && ` · ${p.specialization}`}
                  {p.status === 'approved' && p.authorizedByRole && (
                    <>
                      {' · authorized by '}
                      {p.authorizedByRole === 'admin' ? 'TrialWiz admin' : p.authorizedByName}
                      {p.authorizedAt ? ` on ${formatTimestamp(p.authorizedAt)}` : ''}
                    </>
                  )}
                </span>
              </div>
              {statusPill(p)}
            </div>
          ))
        )}
      </div>

      <div className="sechead2">
        <h2>Authorization history</h2>
        <span className="sup">Who authorized each Principal Investigator at your hospital, and when</span>
      </div>
      <div className="card full">
        {sortedHistory.length === 0 ? (
          <div className="sup">No authorizations recorded for your hospital yet.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Principal Investigator</th>
                  <th>Authorized by</th>
                </tr>
              </thead>
              <tbody>
                {sortedHistory.map((h) => (
                  <tr key={h.id}>
                    <td>{formatTimestamp(h.authorizedAt)}</td>
                    <td>
                      <b>{h.piName}</b>
                      <div className="sup">{h.piEmail}</div>
                    </td>
                    <td>
                      {h.authorizedByRole === 'admin' ? 'TrialWiz admin' : h.authorizedByName}
                      {h.authorizedByUid === me.uid && <span className="sup"> (you)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
