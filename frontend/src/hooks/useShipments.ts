import { useState, useEffect, useRef } from "react";
import { getShipments, Shipment } from "../lib/api";

/**
 * useShipments — polls /api/v1/shipments every 5 seconds
 * Returns { shipments, loading, refresh }
 */
export function useShipments(intervalMs = 5000) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    try {
      const data = await getShipments();
      setShipments(data);
      setError(null);
    } catch {
      setError("Backend unreachable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, intervalMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [intervalMs]);

  return { shipments, loading, error, refresh };
}
