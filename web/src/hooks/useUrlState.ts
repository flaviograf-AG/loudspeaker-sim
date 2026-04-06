import { useEffect } from 'react';
import type { SimulationInput } from '../types';

/**
 * Encode simulation input into URL hash for sharing.
 * Uses base64-encoded JSON to keep URLs manageable.
 */
export function encodeToUrl(input: SimulationInput): string {
  const json = JSON.stringify(input);
  const encoded = btoa(encodeURIComponent(json));
  return `${window.location.origin}${window.location.pathname}#design=${encoded}`;
}

/**
 * Decode simulation input from URL hash.
 * Returns null if no valid design is in the URL.
 */
export function decodeFromUrl(): SimulationInput | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#design=')) return null;
  try {
    const encoded = hash.slice('#design='.length);
    const json = decodeURIComponent(atob(encoded));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Hook: update URL hash when input changes (debounced).
 */
export function useUrlState(input: SimulationInput) {
  useEffect(() => {
    const timer = setTimeout(() => {
      const json = JSON.stringify(input);
      const encoded = btoa(encodeURIComponent(json));
      window.history.replaceState(null, '', `#design=${encoded}`);
    }, 500);
    return () => clearTimeout(timer);
  }, [input]);
}
