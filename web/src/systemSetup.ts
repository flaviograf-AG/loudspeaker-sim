import type { SystemTopology, WayTemplate, WayInput, EnclosureType, EnclosureConfig, DriverParams } from './types';

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

const C0 = 343.21; // speed of sound m/s

/**
 * Compute physically sensible enclosure defaults from driver T/S parameters.
 * Each enclosure type derives dimensions from fs, Vas, Sd, Qts.
 */
export function computeDefaultEnclosure(driver: DriverParams, type: EnclosureType): EnclosureConfig {
  const { fs_hz, sd_m2, vas_m3, qes, qms } = driver;
  const qts = (qes * qms) / (qes + qms);

  switch (type) {
    case 'Sealed': {
      // Target Qtc = 0.707 (Butterworth): Vb = Vas / ((Qtc/Qts)^2 - 1)
      const qtc = 0.707;
      const ratio = (qtc / qts) ** 2 - 1;
      const vb = ratio > 0 ? vas_m3 / ratio : vas_m3;
      return { type: 'Sealed', volume_m3: Math.max(vb, 0.5e-3), ql: 7 };
    }
    case 'Vented': {
      // Vb ≈ Vas for B4-like alignment, Fb ≈ Fs
      const vb = vas_m3;
      const portArea = sd_m2 / 3; // port area ~ Sd/3 to keep velocity low
      // Port length for Fb = Fs: L = c²·Sp/(4π²·Fb²·Vb) - end correction
      const fb = fs_hz;
      const portRadius = Math.sqrt(portArea / Math.PI);
      const endCorrection = 0.85 * portRadius * 2; // flanged both ends
      const rawLength = (C0 ** 2 * portArea) / (4 * Math.PI ** 2 * fb ** 2 * vb) - endCorrection;
      const portLength = Math.max(rawLength, 0.02);
      return {
        type: 'Vented', volume_m3: Math.max(vb, 1e-3), port_area_m2: portArea,
        port_length_m: portLength, num_ports: 1, port_flanged: true, ql: 7,
        port_shape: { type: 'Circular' },
      };
    }
    case 'TransmissionLine': {
      // Length = c / (4 * Fs) = quarter wavelength at Fs
      // Cross-section at driver = Sd
      const length = C0 / (4 * fs_hz);
      return {
        type: 'TransmissionLine', length_m: Math.min(length, 4.0),
        area_driver_m2: sd_m2, area_mouth_m2: sd_m2,
        num_segments: 20, stuffing_density_kg_m3: 5, flow_resistivity_pa_s_m2: 0,
        open_end: true, driver_position: 0, taper_profile: { type: 'Straight' },
        stuffing_zones: [], mouth_termination: { type: 'Flush' }, num_folds: 0,
      };
    }
    case 'Horn': {
      // Throat = Sd, mouth circumference >= wavelength at cutoff
      // Cutoff ~ Fs, mouth area = (c / (2*Fc))^2 / pi for circular wavefront
      const cutoff = Math.max(fs_hz, 50);
      const lambda = C0 / cutoff;
      const mouthArea = Math.max((lambda * lambda) / (4 * Math.PI), sd_m2 * 10);
      // Length ~ lambda/4 at cutoff (minimum for useful loading)
      const hornLength = Math.min(lambda / 4, 2.0);
      return {
        type: 'Horn',
        segments: [{ area_start_m2: sd_m2, area_end_m2: mouthArea, length_m: hornLength,
          profile: { type: 'Exponential' }, cutoff_hz: cutoff }],
        rear_chamber: { type: 'Sealed', volume_m3: vas_m3 * 0.3,
          depth_m: 0.15, flow_resistivity_pa_s_m2: 0, lining_thickness_m: 0, ql: 7 },
        throat_chamber: null, radiation_angle_sr: 2 * Math.PI,
        num_tmm_segments: 30, stuffing_zones: [],
      };
    }
    case 'Bandpass': {
      // Rear = sealed volume (Qtc=0.707), Front ≈ 1.5× rear, port tuned to Fs
      const qtc = 0.707;
      const ratio = (qtc / qts) ** 2 - 1;
      const rearVol = ratio > 0 ? vas_m3 / ratio : vas_m3;
      const frontVol = rearVol * 1.5;
      const portArea = sd_m2 / 3;
      const portRadius = Math.sqrt(portArea / Math.PI);
      const endCorr = 0.85 * portRadius * 2;
      const rawLen = (C0 ** 2 * portArea) / (4 * Math.PI ** 2 * fs_hz ** 2 * frontVol) - endCorr;
      return {
        type: 'Bandpass', rear_volume_m3: Math.max(rearVol, 1e-3),
        front_volume_m3: Math.max(frontVol, 1e-3),
        port_area_m2: portArea, port_length_m: Math.max(rawLen, 0.02),
        port_flanged: true, rear_ql: 7, front_ql: 7,
      };
    }
    case 'PassiveRadiator': {
      // Box = sealed volume, PR Sd ≈ driver Sd, tune PR to Fs
      // f_pr = 1/(2π√(Cms·Mms)), solve for Mms given target Cms
      const qtc = 0.707;
      const ratio = (qtc / qts) ** 2 - 1;
      const vb = ratio > 0 ? vas_m3 / ratio : vas_m3;
      const prSd = sd_m2 * 1.5; // PR slightly larger than driver
      // Target PR tuning = Fs: Mms = 1/(Cms·(2πFs)²)
      const cms = 1e-3; // typical compliance
      const mms = 1 / (cms * (2 * Math.PI * fs_hz) ** 2);
      return {
        type: 'PassiveRadiator', volume_m3: Math.max(vb, 1e-3),
        pr_sd_m2: prSd, pr_cms: cms, pr_mms_kg: Math.max(mms, 0.005),
        pr_rms: 1, ql: 7,
      };
    }
    case 'OpenBaffle': {
      // Baffle width ≈ 3× driver diameter for reasonable baffle step
      const driverDia = 2 * Math.sqrt(sd_m2 / Math.PI);
      const width = Math.max(driverDia * 3, 0.25);
      return {
        type: 'OpenBaffle', width_m: width, height_m: width * 1.5,
        driver_offset_m: width * 0.15,
      };
    }
  }
}

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
    const driver = { ...DEFAULT_DRIVERS[tpl.role] };
    return {
      name: tpl.name,
      driver,
      enclosure: computeDefaultEnclosure(driver, encType),
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
