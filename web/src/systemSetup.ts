import type { SystemTopology, WayTemplate, WayInput, EnclosureType, EnclosureConfig } from './types';

export const TOPOLOGY_TEMPLATES: Record<SystemTopology, WayTemplate[]> = {
  '1-way': [
    { name: 'Full Range', role: 'full-range', defaultEnclosureType: 'Sealed' },
  ],
  '2-way': [
    { name: 'Woofer', role: 'woofer', defaultEnclosureType: 'Sealed' },
    { name: 'Tweeter', role: 'tweeter', defaultEnclosureType: 'Sealed' },
  ],
  '2.5-way': [
    { name: 'Woofer', role: 'woofer', defaultEnclosureType: 'Sealed' },
    { name: 'Woofer (bass)', role: 'woofer-bass-only', defaultEnclosureType: 'Sealed' },
    { name: 'Tweeter', role: 'tweeter', defaultEnclosureType: 'Sealed' },
  ],
  '3-way': [
    { name: 'Woofer', role: 'woofer', defaultEnclosureType: 'Sealed' },
    { name: 'Midrange', role: 'midrange', defaultEnclosureType: 'Sealed' },
    { name: 'Tweeter', role: 'tweeter', defaultEnclosureType: 'Sealed' },
  ],
  '3.5-way': [
    { name: 'Woofer', role: 'woofer', defaultEnclosureType: 'Sealed' },
    { name: 'Woofer (bass)', role: 'woofer-bass-only', defaultEnclosureType: 'Sealed' },
    { name: 'Midrange', role: 'midrange', defaultEnclosureType: 'Sealed' },
    { name: 'Tweeter', role: 'tweeter', defaultEnclosureType: 'Sealed' },
  ],
  '4-way': [
    { name: 'Sub', role: 'sub', defaultEnclosureType: 'Vented' },
    { name: 'Woofer', role: 'woofer', defaultEnclosureType: 'Sealed' },
    { name: 'Midrange', role: 'midrange', defaultEnclosureType: 'Sealed' },
    { name: 'Tweeter', role: 'tweeter', defaultEnclosureType: 'Sealed' },
  ],
};

// Default driver params per role
const DEFAULT_DRIVERS: Record<string, { fs_hz: number; re_ohm: number; le_h: number; qes: number; qms: number; vas_m3: number; sd_m2: number; xmax_m: number }> = {
  'full-range': { fs_hz: 55, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.45, qms: 3.5, vas_m3: 15e-3, sd_m2: 132e-4, xmax_m: 5e-3 },
  'woofer': { fs_hz: 37, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5, vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3 },
  'woofer-bass-only': { fs_hz: 37, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5, vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3 },
  'midrange': { fs_hz: 120, re_ohm: 6.0, le_h: 0.2e-3, qes: 0.45, qms: 3.0, vas_m3: 2e-3, sd_m2: 50e-4, xmax_m: 3e-3 },
  'tweeter': { fs_hz: 800, re_ohm: 5.5, le_h: 0.05e-3, qes: 0.5, qms: 2.0, vas_m3: 0.5e-3, sd_m2: 8e-4, xmax_m: 1e-3 },
  'sub': { fs_hz: 22, re_ohm: 3.5, le_h: 1.0e-3, qes: 0.38, qms: 5.0, vas_m3: 80e-3, sd_m2: 350e-4, xmax_m: 12e-3 },
};

// Default enclosure config per type — single source of truth.
// Values chosen for a typical 6.5" woofer (Sd=132cm², fs=37Hz, Vas=18L).
export const DEFAULT_ENCLOSURES: Record<EnclosureType, EnclosureConfig> = {
  Sealed: { type: 'Sealed', volume_m3: 18e-3, ql: 7 },
  Vented: { type: 'Vented', volume_m3: 30e-3, port_area_m2: 20e-4, port_length_m: 0.15, num_ports: 1, port_flanged: true, ql: 7, port_shape: { type: 'Circular' } },
  // λ/4 at 37Hz = 2.32m → 2.0m gives ~43Hz quarter-wave, good starting point
  TransmissionLine: { type: 'TransmissionLine', length_m: 2.0, area_driver_m2: 132e-4, area_mouth_m2: 132e-4, num_segments: 20, stuffing_density_kg_m3: 5, flow_resistivity_pa_s_m2: 0, open_end: true, driver_position: 0, taper_profile: { type: 'Straight' }, stuffing_zones: [], mouth_termination: { type: 'Flush' }, num_folds: 0 },
  // Throat = driver Sd, mouth = 15× expansion, 2π sr = half-space radiation
  Horn: { type: 'Horn', segments: [{ area_start_m2: 132e-4, area_end_m2: 2000e-4, length_m: 0.60, profile: { type: 'Exponential' }, cutoff_hz: 200 }], rear_chamber: { type: 'Sealed', volume_m3: 10e-3, depth_m: 0.15, flow_resistivity_pa_s_m2: 0, lining_thickness_m: 0, ql: 7 }, throat_chamber: null, radiation_angle_sr: 2 * Math.PI, num_tmm_segments: 30, stuffing_zones: [] },
  Bandpass: { type: 'Bandpass', rear_volume_m3: 15e-3, front_volume_m3: 20e-3, port_area_m2: 20e-4, port_length_m: 0.12, port_flanged: true, rear_ql: 7, front_ql: 7 },
  // PR tuning ≈ 1/(2π√(Cms×Mms)) = 35.6Hz with default values
  PassiveRadiator: { type: 'PassiveRadiator', volume_m3: 20e-3, pr_sd_m2: 200e-4, pr_cms: 1e-3, pr_mms_kg: 0.02, pr_rms: 1, ql: 7 },
  OpenBaffle: { type: 'OpenBaffle', width_m: 0.40, height_m: 0.60, driver_offset_m: 0.1 },
};

/**
 * Generate a complete WayInput[] from a topology + per-way enclosure overrides.
 */
export function buildWaysFromSetup(
  topology: SystemTopology,
  enclosureOverrides: EnclosureType[],
): WayInput[] {
  const templates = TOPOLOGY_TEMPLATES[topology];
  return templates.map((tpl, i) => {
    const encType = enclosureOverrides[i] ?? tpl.defaultEnclosureType;
    return {
      name: tpl.name,
      driver: { ...DEFAULT_DRIVERS[tpl.role] },
      enclosure: { ...DEFAULT_ENCLOSURES[encType] },
      passive_filters: [],
      active_filters: [], // crossover filters are generated from CrossoverPoints
      gain_db: 0,
      delay_s: 0,
      inverted: false,
      z_offset_m: 0,
      enabled: true,
    };
  });
}

/** Enclosure types available per role (Horn/TL unlikely for tweeter) */
export const ENCLOSURE_TYPES_FOR_ROLE: Record<string, EnclosureType[]> = {
  'full-range': ['Sealed', 'Vented', 'TransmissionLine', 'Horn', 'Bandpass', 'PassiveRadiator', 'OpenBaffle'],
  'woofer': ['Sealed', 'Vented', 'TransmissionLine', 'Horn', 'Bandpass', 'PassiveRadiator', 'OpenBaffle'],
  'woofer-bass-only': ['Sealed', 'Vented', 'TransmissionLine', 'Bandpass', 'PassiveRadiator'],
  'midrange': ['Sealed', 'Vented', 'Horn', 'OpenBaffle'],
  'tweeter': ['Sealed', 'Horn', 'OpenBaffle'],
  'sub': ['Sealed', 'Vented', 'Bandpass', 'PassiveRadiator'],
};
