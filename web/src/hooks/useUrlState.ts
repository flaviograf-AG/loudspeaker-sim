import { useEffect } from 'react';
import type { SimulationInput, SystemInput, DesignState } from '../types';
import { extractCrossoverPoints } from '../crossover';

/**
 * Encode design state into URL hash for sharing.
 */
export function encodeToUrl(design: DesignState): string {
  const json = JSON.stringify(design);
  const encoded = btoa(encodeURIComponent(json));
  return `${window.location.origin}${window.location.pathname}#design=${encoded}`;
}

/**
 * Decode design state from URL hash.
 * Handles legacy SimulationInput, legacy SystemInput, and new DesignState formats.
 */
export function decodeFromUrl(): DesignState | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#design=')) return null;
  try {
    const encoded = hash.slice('#design='.length);
    const json = decodeURIComponent(atob(encoded));
    const parsed = JSON.parse(json);

    // New DesignState format (has crossover_points)
    if ('crossover_points' in parsed && 'system' in parsed) {
      return parsed as DesignState;
    }

    // Legacy SystemInput format (has ways but no crossover_points)
    if ('ways' in parsed && !('crossover_points' in parsed)) {
      const sys = parsed as SystemInput;
      const { points, perWayEq } = extractCrossoverPoints(sys.ways);
      return {
        system: { ...sys, ways: sys.ways.map(w => ({ ...w, active_filters: [] })) },
        crossover_points: points,
        per_way_eq: perWayEq,
        preset_names: sys.ways.map(w => w.preset_name),
      };
    }

    // Legacy SimulationInput format (has driver, no ways)
    if ('driver' in parsed && !('ways' in parsed)) {
      const legacy = parsed as SimulationInput;
      return {
        system: {
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
        },
        crossover_points: [],
        per_way_eq: [[]],
        preset_names: [undefined],
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Hook: update URL hash when design state changes (debounced).
 */
export function useUrlState(design: DesignState) {
  useEffect(() => {
    const timer = setTimeout(() => {
      const json = JSON.stringify(design);
      const encoded = btoa(encodeURIComponent(json));
      window.history.replaceState(null, '', `#design=${encoded}`);
    }, 500);
    return () => clearTimeout(timer);
  }, [design]);
}
