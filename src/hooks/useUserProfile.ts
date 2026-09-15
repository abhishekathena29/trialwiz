import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { USERS_COLLECTION } from '../services/profiles';
import type { UserProfile } from '../types';

/** Live view of the signed-in user's `users/{uid}` profile doc (role, approval status, etc). */
export function useUserProfile(user: User | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !user) {
      void Promise.resolve().then(() => {
        setProfile(null);
        setLoading(false);
      });
      return;
    }
    void Promise.resolve().then(() => setLoading(true));
    return onSnapshot(
      doc(db, USERS_COLLECTION, user.uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        setLoading(false);
      },
      (err) => {
        console.warn('[TrialWiz] profile subscription failed:', err);
        setProfile(null);
        setLoading(false);
      },
    );
  }, [user]);

  return { profile, loading };
}
