import { useCallback, useEffect, useRef, useState } from 'react';
import { runSimulation } from '../solver/wasm-bridge';
import type { SimulationInput, SimulationResult } from '../types';

export function useSolver(input: SimulationInput, debounceMs = 50) {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  const solve = useCallback(() => {
    try {
      const r = runSimulation(inputRef.current);
      setResult(r);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(solve, debounceMs);
    return () => clearTimeout(timeout);
  }, [input, solve, debounceMs]);

  return { result, error };
}
