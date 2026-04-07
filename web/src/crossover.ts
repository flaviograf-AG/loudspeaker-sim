import type { ActiveFilter, CrossoverSlope, CrossoverPoint, SystemTopology, WayInput } from './types';

/** Map a crossover slope to display label */
export const SLOPE_LABELS: Record<CrossoverSlope, string> = {
  '1st': '1st (6 dB/oct)',
  'BW2': 'BW2 (12 dB/oct)',
  'LR2': 'LR2 (12 dB/oct)',
  'LR4': 'LR4 (24 dB/oct)',
};

/** Generate LP and HP active filters for a crossover point */
export function crossoverToFilters(point: CrossoverPoint): { lp: ActiveFilter; hp: ActiveFilter } {
  const f = point.freq_hz;
  switch (point.slope) {
    case '1st':
      return { lp: { type: 'LowPass1', freq_hz: f }, hp: { type: 'HighPass1', freq_hz: f } };
    case 'BW2':
      return { lp: { type: 'LowPass2', freq_hz: f, q: 0.707 }, hp: { type: 'HighPass2', freq_hz: f, q: 0.707 } };
    case 'LR2':
      return { lp: { type: 'LR2LowPass', freq_hz: f }, hp: { type: 'LR2HighPass', freq_hz: f } };
    case 'LR4':
      return { lp: { type: 'LR4LowPass', freq_hz: f }, hp: { type: 'LR4HighPass', freq_hz: f } };
  }
}

/**
 * Assemble the final active_filters for a way by combining:
 * 1. Crossover-generated LP/HP filters
 * 2. Per-way EQ filters (PEQ, shelf, allpass, gain, etc.)
 */
export function assembleActiveFilters(
  wayIndex: number,
  crossoverPoints: CrossoverPoint[],
  perWayEq: ActiveFilter[],
): ActiveFilter[] {
  const xoverFilters: ActiveFilter[] = [];
  for (const pt of crossoverPoints) {
    const { lp, hp } = crossoverToFilters(pt);
    if (pt.low_way_index === wayIndex) xoverFilters.push(lp);
    if (pt.high_way_index === wayIndex) xoverFilters.push(hp);
  }
  return [...xoverFilters, ...perWayEq];
}

/** Build SystemInput with active_filters assembled from crossover + EQ */
export function buildSolverInput(
  system: import('./types').SystemInput,
  crossoverPoints: CrossoverPoint[],
  perWayEq: ActiveFilter[][],
): import('./types').SystemInput {
  return {
    ...system,
    ways: system.ways.map((way, i) => ({
      ...way,
      active_filters: assembleActiveFilters(i, crossoverPoints, perWayEq[i] ?? []),
    })),
  };
}

/** Default crossover points for a given topology */
export function defaultCrossoverPoints(topology: SystemTopology): CrossoverPoint[] {
  switch (topology) {
    case '1-way': return [];
    case '2-way': return [
      { freq_hz: 2500, slope: 'LR4', low_way_index: 0, high_way_index: 1 },
    ];
    case '2.5-way': return [
      { freq_hz: 500, slope: 'LR4', low_way_index: 1, high_way_index: null }, // bass-only woofer LP
      { freq_hz: 2500, slope: 'LR4', low_way_index: 0, high_way_index: 2 },  // woofer <-> tweeter
    ];
    case '3-way': return [
      { freq_hz: 500, slope: 'LR4', low_way_index: 0, high_way_index: 1 },
      { freq_hz: 3000, slope: 'LR4', low_way_index: 1, high_way_index: 2 },
    ];
    case '3.5-way': return [
      { freq_hz: 200, slope: 'LR4', low_way_index: 1, high_way_index: null }, // bass-only woofer LP
      { freq_hz: 500, slope: 'LR4', low_way_index: 0, high_way_index: 2 },
      { freq_hz: 3000, slope: 'LR4', low_way_index: 2, high_way_index: 3 },
    ];
    case '4-way': return [
      { freq_hz: 80, slope: 'LR4', low_way_index: 0, high_way_index: 1 },
      { freq_hz: 500, slope: 'LR4', low_way_index: 1, high_way_index: 2 },
      { freq_hz: 3000, slope: 'LR4', low_way_index: 2, high_way_index: 3 },
    ];
  }
}

/** Detect crossover-like LP/HP pairs from legacy per-way active_filters */
export function extractCrossoverPoints(ways: WayInput[]): {
  points: CrossoverPoint[];
  perWayEq: ActiveFilter[][];
} {
  const perWayEq: ActiveFilter[][] = ways.map(w => [...w.active_filters]);
  const points: CrossoverPoint[] = [];

  // For each pair of adjacent ways, look for matching LP/HP at same frequency
  for (let i = 0; i < ways.length - 1; i++) {
    const lpFilters = perWayEq[i].filter(f =>
      f.type === 'LR4LowPass' || f.type === 'LR2LowPass' || f.type === 'LowPass1' ||
      (f.type === 'LowPass2' && 'q' in f && Math.abs(f.q - 0.707) < 0.01)
    );
    const hpFilters = perWayEq[i + 1].filter(f =>
      f.type === 'LR4HighPass' || f.type === 'LR2HighPass' || f.type === 'HighPass1' ||
      (f.type === 'HighPass2' && 'q' in f && Math.abs(f.q - 0.707) < 0.01)
    );

    for (const lp of lpFilters) {
      if (!('freq_hz' in lp)) continue;
      const lpFreq = lp.freq_hz;
      const matchingHp = hpFilters.find(hp => 'freq_hz' in hp && hp.freq_hz === lpFreq);
      if (matchingHp) {
        let slope: CrossoverSlope = 'LR4';
        if (lp.type === 'LowPass1') slope = '1st';
        else if (lp.type === 'LR2LowPass') slope = 'LR2';
        else if (lp.type === 'LowPass2') slope = 'BW2';

        points.push({ freq_hz: lpFreq, slope, low_way_index: i, high_way_index: i + 1 });
        // Remove from per-way EQ
        perWayEq[i] = perWayEq[i].filter(f => f !== lp);
        perWayEq[i + 1] = perWayEq[i + 1].filter(f => f !== matchingHp);
        break; // one crossover point per adjacent pair
      }
    }
  }

  // Check for LP-only filters (bass-assist woofer)
  for (let i = 0; i < ways.length; i++) {
    const remainingLp = perWayEq[i].find(f =>
      f.type === 'LR4LowPass' || f.type === 'LR2LowPass' || f.type === 'LowPass1' ||
      (f.type === 'LowPass2' && 'q' in f && Math.abs(f.q - 0.707) < 0.01)
    );
    if (remainingLp && 'freq_hz' in remainingLp) {
      // Check if there's already a crossover point for this way as low_way
      const hasPoint = points.some(p => p.low_way_index === i);
      if (!hasPoint) {
        let slope: CrossoverSlope = 'LR4';
        if (remainingLp.type === 'LowPass1') slope = '1st';
        else if (remainingLp.type === 'LR2LowPass') slope = 'LR2';
        else if (remainingLp.type === 'LowPass2') slope = 'BW2';

        points.push({ freq_hz: remainingLp.freq_hz, slope, low_way_index: i, high_way_index: null });
        perWayEq[i] = perWayEq[i].filter(f => f !== remainingLp);
      }
    }
  }

  return { points, perWayEq };
}
