import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase';

/** On a rejected / revoked account: sign up again with the same email under the right role
 * (e.g. registered as a Trial Team Doctor but is really a coordinator). The old account is
 * replaced by the new, unapproved one once they confirm with the same password. */
export function SignUpAgain({ email }: { email: string }) {
  const navigate = useNavigate();
  return (
    <div className="note" style={{ margin: '14px 0' }}>
      <b>Signed up as the wrong kind of account?</b> You can register again with this same email — choose the right
      account type and use your current password. It will need approval again.
      <div style={{ marginTop: 10 }}>
        <button
          className="btn primary"
          type="button"
          onClick={async () => {
            if (auth) await signOut(auth);
            navigate(`/login?mode=signup&email=${encodeURIComponent(email)}`);
          }}
        >
          Sign up again with this email
        </button>
      </div>
    </div>
  );
}
