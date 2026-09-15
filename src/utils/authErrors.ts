/** Maps a raw Firebase Auth error message to a friendly, user-facing one. Shared by every
 * email/password sign-in/sign-up form (public accounts, doctor/coordinator portal). */
export function friendlyAuthError(message: string): string {
  if (message.includes('auth/email-already-in-use')) return 'An account with this email already exists — try signing in instead.';
  if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) return 'Incorrect email or password.';
  if (message.includes('auth/user-not-found')) return 'No account found with this email — try creating one instead.';
  if (message.includes('auth/weak-password')) return 'Password should be at least 6 characters.';
  if (message.includes('auth/invalid-email')) return "That doesn't look like a valid email address.";
  if (message.includes('auth/too-many-requests')) return 'Too many attempts — wait a moment and try again.';
  if (message.includes('auth/network-request-failed')) return 'Could not reach the server — check your connection and try again.';
  if (message.includes('auth/operation-not-allowed'))
    return "Email/password sign-up isn't enabled for this app yet — contact support.";
  if (message.includes('auth/unauthorized-domain'))
    return "This site isn't authorised for sign-up yet — contact support.";
  return 'Something went wrong — please try again.';
}
