import type { DesignStateV2, SystemInput, WayInput, ActiveFilter, CrossoverPoint, CrossoverSlope } from './types';

/**
 * Assemble active filters for one way from crossover points + per-way EQ.
 * This is the ONLY place active_filters are constructed.
 */
function assembleFilters(
  wayIndex: number,
  points: CrossoverPoint[],
  eq: ActiveFilter[],
): ActiveFilter[] {
  const filters: ActiveFilter[] = [];

  for (const pt of points) {
    if (pt.low_way_index === wayIndex) {
      filters.push(makeLowPass(pt.freq_hz, pt.slope));
    }
    if (pt.high_way_index === wayIndex) {
      filters.push(makeHighPass(pt.freq_hz, pt.slope));
    }
  }

  filters.push(...eq);
  return filters;
}

function makeLowPass(freq: number, slope: CrossoverSlope): ActiveFilter {
  switch (slope) {
    case '1st': return { type: 'LowPass1', freq_hz: freq };
    case 'BW2': return { type: 'LowPass2', freq_hz: freq, q: 0.707 };
    case 'LR2': return { type: 'LR2LowPass', freq_hz: freq };
    case 'LR4': return { type: 'LR4LowPass', freq_hz: freq };
  }
}

function makeHighPass(freq: number, slope: CrossoverSlope): ActiveFilter {
  switch (slope) {
    case '1st': return { type: 'HighPass1', freq_hz: freq };
    case 'BW2': return { type: 'HighPass2', freq_hz: freq, q: 0.707 };
    case 'LR2': return { type: 'LR2HighPass', freq_hz: freq };
    case 'LR4': return { type: 'LR4HighPass', freq_hz: freq };
  }
}

/**
 * Build solver input from design state.
 * One pure function, one direction, no reverse path.
 */
export function buildSolverInput(design: DesignStateV2): SystemInput {
  return {
    ways: design.ways.map((w, i): WayInput => ({
      name: w.name,
      driver: w.driver,
      enclosure: w.enclosure,
      passive_filters: w.passive_filters,
      active_filters: assembleFilters(i, design.crossover_points, design.per_way_eq[i] ?? []),
      gain_db: w.gain_db,
      delay_s: w.delay_s,
      inverted: w.inverted,
      z_offset_m: w.z_offset_m,
      enabled: w.enabled,
      measured: w.measured,
    })),
    freq_start_hz: design.freq_start_hz,
    freq_end_hz: design.freq_end_hz,
    freq_points: design.freq_points,
    drive_voltage_rms: design.drive_voltage_rms,
  };
}

/** Default 2-way design for fresh start. */
export function defaultDesign(): DesignStateV2 {
  return {
    version: 2,
    topology: '2-way',
    ways: [
      {
        name: 'Woofer',
        driver: { fs_hz: 37, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5, vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3 },
        enclosure: { type: 'Sealed', volume_m3: 18e-3, ql: 7 },
        passive_filters: [], gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
      },
      {
        name: 'Tweeter',
        driver: { fs_hz: 800, re_ohm: 5.5, le_h: 0.05e-3, qes: 0.5, qms: 2.0, vas_m3: 0.5e-3, sd_m2: 8e-4, xmax_m: 1e-3 },
        enclosure: { type: 'Sealed', volume_m3: 0.5e-3, ql: 7 },
        passive_filters: [], gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
      },
    ],
    crossover_points: [{ freq_hz: 2500, slope: 'LR4' as const, low_way_index: 0, high_way_index: 1 }],
    per_way_eq: [[], []],
    freq_start_hz: 20, freq_end_hz: 20000, freq_points: 300, drive_voltage_rms: 2.83,
  };
}
