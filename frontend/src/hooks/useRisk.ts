import { useState, useCallback } from "react";
import { computeRisk, RiskResult } from "../lib/api";

/**
 * useRisk — computes risk score on demand, tracks loading state
 */
export function useRisk() {
  const [riskResult, setRiskResult] = useState<RiskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compute = useCallback(
    async (params: {
      temperature: number;
      delay_minutes: number;
      product_type: string;
      ambient_temp?: number;
      shipment_id?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const result = await computeRisk(params);
        setRiskResult(result);
        return result;
      } catch (e) {
        setError("Risk computation failed");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const reset = () => setRiskResult(null);

  return { riskResult, loading, error, compute, reset };
}
