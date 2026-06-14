import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import api from "../lib/api";

export function useRealtimeData<T>(path: string, initialValue: T | null = null) {
  const [data, setData] = useState<T | null>(initialValue);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!path) return;
    try {
      if (path === '/active_shipments') {
        const res = await api.get('/api/v1/shipments?status_filter=active');
        const map = res.data.reduce((acc: any, s: any) => {
          acc[s.shipment_code] = {
            stage: s.status === 'active' ? 'IN_TRANSIT' : s.status.toUpperCase(),
            risk_score: s.current_risk?.risk_score ? s.current_risk.risk_score * 100 : 0,
            risk_category: s.current_risk?.risk_category || 'LOW',
            spoilage_window_min: s.current_risk?.time_to_spoil_minutes || 9999,
            current_location: s.current_location,
          };
          return acc;
        }, {});
        setData(map as any);
      }
      else if (path === '/alerts_live') {
        const res = await api.get('/api/v1/alerts');
        setData(res.data as any);
      }
      else if (path.startsWith('/live_tracking/')) {
        const code = path.split('/')[2];
        const res = await api.get(`/api/v1/tracking/${code}`);
        setData(res.data as any);
      }
      else if (path.startsWith('/risk_scores/')) {
        const code = path.split('/')[2];
        const res = await api.get(`/api/v1/interventions/${code}/risk-detail`);
        setData(res.data as any);
      }
    } catch (err: any) {
      setError(err);
    }
  }, [path]);

  useEffect(() => {
    fetchData();
    if (!path) return;

    // Supabase Realtime Subscription
    const channel = supabase.channel(`custom-channel-${path.replace(/\//g, '-')}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (_payload) => {
          // Event-driven refetch
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, path]);


  return { data, loading, error };
}
