import { useState, useEffect, useRef, useCallback } from 'react';
import { runSystemSimulation } from '../solver/wasm-bridge';
import type { SystemInput, SystemResult } from '../types';

export function useSystemSolver(input: SystemInput | null, ready: boolean, debounceMs = 80) {
  const [result, setResult] = useState<SystemResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  const solve = useCallback(() => {
    if (!ready || !inputRef.current) return;
    try {
      const r = runSystemSimulation(inputRef.current);
      setResult(r);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [ready]);

  useEffect(() => {
    if (!ready || !input) return;
    const timer = setTimeout(solve, debounceMs);
    return () => clearTimeout(timer);
  }, [input, ready, solve, debounceMs]);

  return { result, error };
}
