import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth } from '../firebase';

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      void Promise.resolve().then(() => setLoading(false));
      return;
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  return { user, loading };
}
