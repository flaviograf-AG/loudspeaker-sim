import { useEffect } from 'react';
import type { SimulationInput, SystemInput } from '../types';

/**
 * Encode system input into URL hash for sharing.
 * Uses base64-encoded JSON to keep URLs manageable.
 */
export function encodeToUrl(system: SystemInput): string {
  const json = JSON.stringify(system);
  const encoded = btoa(encodeURIComponent(json));
  return `${window.location.origin}${window.location.pathname}#design=${encoded}`;
}

/**
 * Decode system input from URL hash.
 * Handles both new SystemInput format and legacy SimulationInput format.
 * Returns null if no valid design is in the URL.
 */
export function decodeFromUrl(): SystemInput | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#design=')) return null;
  try {
    const encoded = hash.slice('#design='.length);
    const json = decodeURIComponent(atob(encoded));
    const parsed = JSON.parse(json);
    // Handle legacy format (SimulationInput without ways)
    if ('driver' in parsed && !('ways' in parsed)) {
      const legacy = parsed as SimulationInput;
      return {
        ways: [{
          name: 'Full Range',
          driver: legacy.driver,
          enclosure: legacy.enclosure,
          passive_filters: [],
          active_filters: [],
          gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
        }],
        freq_start_hz: legacy.freq_start_hz,
        freq_end_hz: legacy.freq_end_hz,
        freq_points: legacy.freq_points,
        drive_voltage_rms: legacy.drive_voltage_rms,
      };
    }
    return parsed as SystemInput;
  } catch {
    return null;
  }
}

/**
 * Hook: update URL hash when system input changes (debounced).
 */
export function useUrlState(system: SystemInput) {
  useEffect(() => {
    const timer = setTimeout(() => {
      const json = JSON.stringify(system);
      const encoded = btoa(encodeURIComponent(json));
      window.history.replaceState(null, '', `#design=${encoded}`);
    }, 500);
    return () => clearTimeout(timer);
  }, [system]);
}
