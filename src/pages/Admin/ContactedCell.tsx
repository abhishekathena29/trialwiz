import { useState } from 'react';
import { setAdminContact, type AdminContactMark } from '../../services/adminContacts';
import { formatTimestamp } from '../../utils/timestamps';

/** Admin outreach tracker for one account: a "Contacted" checkbox, when it was ticked, and a
 * short private note ("called 12 Nov — will claim RGCI trials"). */
export function ContactedCell({ uid, mark, adminEmail }: { uid: string; mark?: AdminContactMark; adminEmail: string }) {
  const [busy, setBusy] = useState(false);
  const contacted = Boolean(mark?.contacted);

  async function save(patch: { contacted?: boolean; note?: string }) {
    setBusy(true);
    try {
      await setAdminContact(uid, patch, adminEmail);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  function editNote() {
    const next = window.prompt('Private note (only admins see this):', mark?.note ?? '');
    if (next !== null) void save({ note: next });
  }

  return (
    <div className={`contacted-cell${contacted ? ' on' : ''}`}>
      <label title={contacted ? 'You marked this person as contacted' : 'Tick once you have contacted them'}>
        <input type="checkbox" checked={contacted} disabled={busy} onChange={(e) => save({ contacted: e.target.checked })} />
        <span>{contacted ? 'Contacted' : 'Not yet'}</span>
      </label>
      {contacted && mark?.contactedAt != null && <div className="sup">{formatTimestamp(mark.contactedAt)}</div>}
      <button type="button" className="linkbtn contacted-note" onClick={editNote} disabled={busy}>
        {mark?.note ? `📝 ${mark.note}` : '+ note'}
      </button>
    </div>
  );
}
