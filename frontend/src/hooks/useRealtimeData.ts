import { useState, useEffect } from "react";
import { ref, onValue, off } from "firebase/database";
import { rtdb } from "../lib/firebase";

export function useRealtimeData<T>(path: string, initialValue: T | null = null) {
  const [data, setData] = useState<T | null>(initialValue);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!path) return;

    setLoading(true);
    const dbRef = ref(rtdb, path);

    const unsubscribe = onValue(
      dbRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setData(snapshot.val());
        } else {
          setData(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error(`Firebase read error at ${path}:`, error);
        setError(error);
        setLoading(false);
      }
    );

    // Cleanup subscription on unmount
    return () => {
      off(dbRef, "value", unsubscribe);
    };
  }, [path]);

  return { data, loading, error };
}
