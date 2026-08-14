import type { User } from 'firebase/auth';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../firebase';
import type { TrialSite } from '../types';

/** Small denormalised snapshot — enough to render a saved-trial card even if the trial
 * later drops out of the live "currently recruiting" dataset. */
export interface FavoriteEntry {
  key: string;
  nctId: string;
  cancerType: string;
  briefTitle: string;
  facility: string;
  city: string;
}

export function useFavorites(user: User | null) {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);

  useEffect(() => {
    if (!db || !user) {
      void Promise.resolve().then(() => setFavorites([]));
      return;
    }
    const q = query(collection(db, 'users', user.uid, 'favorites'), orderBy('savedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setFavorites(snap.docs.map((d) => d.data() as FavoriteEntry));
    });
    return unsub;
  }, [user]);

  const isFavorite = useCallback((trial: TrialSite) => favorites.some((f) => f.key === trial.key), [favorites]);

  const toggleFavorite = useCallback(
    (trial: TrialSite) => {
      if (!db || !user) return;
      const ref = doc(db, 'users', user.uid, 'favorites', trial.key);
      if (favorites.some((f) => f.key === trial.key)) {
        deleteDoc(ref).catch((err) => console.warn('[TrialWiz] failed to remove favorite:', err));
      } else {
        setDoc(ref, {
          key: trial.key,
          nctId: trial.nctId,
          cancerType: trial.cancerType,
          briefTitle: trial.briefTitle,
          facility: trial.facility,
          city: trial.city,
          savedAt: serverTimestamp(),
        }).catch((err) => console.warn('[TrialWiz] failed to save favorite:', err));
      }
    },
    [user, favorites],
  );

  return { favorites, isFavorite, toggleFavorite };
}
