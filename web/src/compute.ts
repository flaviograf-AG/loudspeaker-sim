import type {
  DesignState,
  SystemInput,
  WayInput,
  ActiveFilter,
  PassiveFilter,
  CrossoverPoint,
  CrossoverSlope,
  DriverParams,
  WayDesign,
  CabinetDimensions,
} from './types';

const RHO_0 = 1.2041;
const C_0 = 343.21;
const P_REF = 20e-6;

export interface DerivedDriverMetrics {
  qts: number;
  ebp: number;
  cms_m_n: number;
  cms_mm_n: number;
  kms_n_mm: number;
  mms_g: number;
  mmr_g: number;
  mmd_g: number;
  rms_ns_m: number;
  bl_tm: number;
  eta0_pct: number;
  sensitivity_1w_db: number;
  sensitivity_2v83_db: number;
  vd_cm3: number;
  cone_diameter_cm: number;
  r_out_mm: number;
  decay_rate_s_inv: number;
  decay_time_60db_ms: number;
  min_safe_xo_hz: number;
  recommended_enclosure: string;
  zobel: { r_ohm: number; c_farads: number; c_uf: number };
  resonance_notch: { r_ohm: number; l_henries: number; l_mh: number; c_farads: number; c_uf: number };
}

/**
 * Shared single-source-of-truth derivation of all driver electromechanical,
 * enclosure-recommendation, and crossover-compensation metrics from DriverParams.
 * Incorporates Beranek & Mellow / MathWorks `loudspeaker-ThieleSmall-calculator` (`updateTSparam.m`) relations.
 */
export function deriveDriverMetrics(d: DriverParams, targetSplDb = 87): DerivedDriverMetrics {
  const fs = Math.max(1, d.fs_hz);
  const re = Math.max(0.5, d.re_ohm);
  const qes = Math.max(0.05, d.qes);
  const qms = Math.max(0.1, d.qms);
  const vas = Math.max(1e-6, d.vas_m3);
  const sd = Math.max(1e-5, d.sd_m2);
  const xmax = Math.max(0, d.xmax_m);
  const le = Math.max(0, d.le_h);

  const qts = (qes * qms) / (qes + qms);
  const ebp = fs / qes;
  const cms_m_n = vas / (RHO_0 * C_0 * C_0 * sd * sd);
  const cms_mm_n = cms_m_n * 1000;
  const kms_n_mm = 1 / Math.max(1e-9, cms_mm_n);
  const omega_s = 2 * Math.PI * fs;
  const mms_kg = 1 / (omega_s * omega_s * cms_m_n);
  const mms_g = mms_kg * 1000;
  const rms_ns_m = (mms_kg * omega_s) / qms;
  const bl_tm = Math.sqrt((re * mms_kg * omega_s) / qes);

  // Effective piston radius & Beranek/Mellow radiation air mass M_mr = 2 * (8/3) * rho0 * r^3
  const r_eff_m = Math.sqrt(sd / Math.PI);
  const r_out_mm = r_eff_m * 1000;
  const mmr_kg = (16 / 3) * RHO_0 * Math.pow(r_eff_m, 3);
  const mmr_g = mmr_kg * 1000;
  const mmd_g = Math.max(0.01, mms_g - mmr_g);

  // MathWorks thieleSmallCalc transient decay rate: sigma = (2*pi*fs) / (2*Qts) = pi * fs / Qts
  const decay_rate_s_inv = (Math.PI * fs) / Math.max(0.01, qts);
  const decay_time_60db_ms = (6.9078 / decay_rate_s_inv) * 1000;

  const eta0 = (4 * Math.PI * Math.PI * Math.pow(fs, 3) * vas) / (Math.pow(C_0, 3) * qes);
  const eta0_pct = eta0 * 100;
  const sensitivity_1w_db = 112.1 + 10 * Math.log10(Math.max(1e-6, eta0));
  const sensitivity_2v83_db = 112.1 + 10 * Math.log10(Math.max(1e-6, eta0 * (8.0 / re)));

  const vd_cm3 = sd * xmax * 1e6;
  const cone_diameter_cm = 2 * Math.sqrt((sd * 1e4) / Math.PI);

  // Excursion-limited safe HP crossover frequency
  const pTarget = P_REF * Math.pow(10, targetSplDb / 20);
  const fDisp = xmax > 0 ? Math.sqrt(pTarget / (Math.PI * RHO_0 * sd * xmax)) : 0;
  const min_safe_xo_hz = Math.round(Math.max(fs * 2.2, fDisp));

  let recommended_enclosure = 'Sealed or Vented';
  if (qts > 0.65) recommended_enclosure = 'Open Baffle / Infinite Baffle / Large Sealed';
  else if (ebp < 50) recommended_enclosure = 'Sealed Box / Passive Radiator';
  else if (ebp <= 90) recommended_enclosure = 'Vented / Sealed / Transmission Line';
  else recommended_enclosure = 'Vented / Horn / Bandpass';

  // Zobel impedance-flattening network (R = Re, C = Le / Re²)
  const c_zobel = le > 0 ? le / (re * re) : 10e-6;

  // Conjugate parallel RLC notch at Fs
  const r_notch = re * (1 + qes / qms);
  const l_notch = (qes * re) / omega_s;
  const c_notch = 1 / (omega_s * omega_s * Math.max(1e-9, l_notch));

  return {
    qts,
    ebp,
    cms_m_n,
    cms_mm_n,
    kms_n_mm,
    mms_g,
    mmr_g,
    mmd_g,
    rms_ns_m,
    bl_tm,
    eta0_pct,
    sensitivity_1w_db,
    sensitivity_2v83_db,
    vd_cm3,
    cone_diameter_cm,
    r_out_mm,
    decay_rate_s_inv,
    decay_time_60db_ms,
    min_safe_xo_hz,
    recommended_enclosure,
    zobel: {
      r_ohm: Number(re.toFixed(2)),
      c_farads: c_zobel,
      c_uf: Number((c_zobel * 1e6).toFixed(2)),
    },
    resonance_notch: {
      r_ohm: Number(r_notch.toFixed(2)),
      l_henries: l_notch,
      l_mh: Number((l_notch * 1e3).toFixed(2)),
      c_farads: c_notch,
      c_uf: Number((c_notch * 1e6).toFixed(1)),
    },
  };
}

/**
 * MathWorks `updateTSparam.m` truncated-cone effective piston area formula:
 *   If inner radius r_in > 1 mm: Sd = (pi / 3) * (r_out^2 + r_out * r_in + r_in^2)
 *   Else: Sd = pi * r_out^2
 * Returns Sd in cm².
 */
export function computeTruncatedConeSdCm2(r_out_mm: number, r_in_mm = 0): number {
  const ro = Math.max(1, r_out_mm) / 1000; // meters
  const ri = Math.max(0, r_in_mm) / 1000;  // meters
  const sd_m2 =
    ri > 0.001
      ? (Math.PI / 3) * (ro * ro + ro * ri + ri * ri)
      : Math.PI * ro * ro;
  return Number((sd_m2 * 1e4).toFixed(2));
}

/**
 * Bidirectional conversion from Physical Lumped Component Parameters (Bl, Mms, Cms, Rms, Sd)
 * to Thiele-Small Parameters (Fs, Qms, Qes, Vas, Sd) per MathWorks `updateTSparam.m`
 * and Beranek & Mellow, "Acoustics: Sound Fields and Transducers".
 */
export function driverFromPhysicalParams(
  base: DriverParams,
  updates: {
    bl_tm?: number;
    mms_g?: number;
    cms_mm_n?: number;
    rms_ns_m?: number;
    sd_cm2?: number;
  }
): DriverParams {
  const cur = deriveDriverMetrics(base);
  const re = Math.max(0.5, base.re_ohm);
  const bl = Math.max(0.1, updates.bl_tm ?? cur.bl_tm);
  const mms_kg = Math.max(0.05, updates.mms_g ?? cur.mms_g) / 1000;
  const cms_m_n = Math.max(0.001, updates.cms_mm_n ?? cur.cms_mm_n) / 1000;
  const rms = Math.max(0.01, updates.rms_ns_m ?? cur.rms_ns_m);
  const sd_m2 = updates.sd_cm2 !== undefined ? Math.max(0.5, updates.sd_cm2) * 1e-4 : base.sd_m2;

  // 1. Resonance frequency: fs = 1 / (2*pi * sqrt(Mms * Cms))
  const fs_hz = 1 / (2 * Math.PI * Math.sqrt(mms_kg * cms_m_n));
  // 2. Mechanical Q: Qms = sqrt(Mms / Cms) / Rms
  const mech_z = Math.sqrt(mms_kg / cms_m_n);
  const qms = mech_z / rms;
  // 3. Electrical Q: Qes = (Re / Bl^2) * sqrt(Mms / Cms)
  const qes = (re / (bl * bl)) * mech_z;
  // 4. Equivalent compliance volume: Vas = Cms * Sd^2 * rho0 * c^2
  const vas_m3 = cms_m_n * sd_m2 * sd_m2 * RHO_0 * C_0 * C_0;

  return {
    ...base,
    fs_hz: Number(Math.max(5, fs_hz).toFixed(2)),
    qms: Number(Math.max(0.1, qms).toFixed(3)),
    qes: Number(Math.max(0.05, qes).toFixed(3)),
    vas_m3: Number(Math.max(1e-6, vas_m3).toFixed(6)),
    sd_m2: Number(sd_m2.toFixed(6)),
  };
}

/**
 * Parse Dayton Audio DATS / LA Loudspeaker Analyzer export or pasted datasheet text
 * into DriverParams (supporting both T/S and physical Mms/Cms/Bl/Rms inputs).
 */
export function parseAnalyzerOrDatasheetText(text: string, fallback: DriverParams): DriverParams {
  const numAfter = (regex: RegExp): number | undefined => {
    const m = text.match(regex);
    if (!m) return undefined;
    const v = parseFloat(m[1].replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };

  let next: DriverParams = { ...fallback };

  const fs = numAfter(/\b(?:Fs|f_s|Resonance(?:\s+Frequency)?)\s*[:=]?\s*([0-9]+[.,]?[0-9]*)/i);
  const re = numAfter(/\b(?:Re|R_e|DCR|DC\s+Resistance)\s*[:=]?\s*([0-9]+[.,]?[0-9]*)/i);
  const le = numAfter(/\b(?:Le|L_e|Inductance)\s*[:=]?\s*([0-9]+[.,]?[0-9]*)/i);
  const qms = numAfter(/\b(?:Qms|Q_ms)\s*[:=]?\s*([0-9]+[.,]?[0-9]*)/i);
  const qes = numAfter(/\b(?:Qes|Q_es)\s*[:=]?\s*([0-9]+[.,]?[0-9]*)/i);
  const vas = numAfter(/\b(?:Vas|V_as)\s*[:=]?\s*([0-9]+[.,]?[0-9]*)/i);
  const sd = numAfter(/\b(?:Sd|S_d)\s*[:=]?\s*([0-9]+[.,]?[0-9]*)/i);
  const xmax = numAfter(/\b(?:Xmax|X_max)\s*[:=]?\s*([0-9]+[.,]?[0-9]*)/i);

  if (fs !== undefined) next.fs_hz = fs;
  if (re !== undefined) next.re_ohm = re;
  if (le !== undefined) next.le_h = le > 0.05 ? le / 1000 : le;
  if (qms !== undefined) next.qms = qms;
  if (qes !== undefined) next.qes = qes;
  if (vas !== undefined) next.vas_m3 = vas > 0.2 ? vas / 1000 : vas;
  if (sd !== undefined) next.sd_m2 = sd > 1 ? sd * 1e-4 : sd;
  if (xmax !== undefined) next.xmax_m = xmax > 0.05 ? xmax / 1000 : xmax;

  // Also check physical component parameters (Bl, Mms, Cms, Rms) if provided in analyzer file
  const bl = numAfter(/\b(?:Bl|BL|B\*l|Force\s+Factor)\s*[:=]?\s*([0-9]+[.,]?[0-9]*)/i);
  const mms = numAfter(/\b(?:Mms|M_ms|Moving\s+Mass)\s*[:=]?\s*([0-9]+[.,]?[0-9]*)/i);
  const cms = numAfter(/\b(?:Cms|C_ms)\s*[:=]?\s*([0-9]+[.,]?[0-9]*)/i);
  const rms = numAfter(/\b(?:Rms|R_ms)\s*[:=]?\s*([0-9]+[.,]?[0-9]*)/i);

  if (
    (bl !== undefined || mms !== undefined || cms !== undefined || rms !== undefined) &&
    (fs === undefined || qes === undefined || vas === undefined)
  ) {
    next = driverFromPhysicalParams(next, {
      bl_tm: bl,
      mms_g: mms,
      cms_mm_n: cms,
      rms_ns_m: rms,
    });
  }

  return next;
}

/**
 * Compute Baffle Step frequency and passive RL / active Shelf parameters
 * from the shared Cabinet width (cm) and driver Re (Ω).
 */
export function computeBaffleStepParams(width_cm: number, re_ohm: number, attenuation_db = 4.5) {
  const width_m = Math.max(0.08, width_cm / 100);
  // Olson / Linkwitz half-space transition frequency: f_3 = 115 / W_m
  const f_bsc_hz = Math.round(115 / width_m);
  const ratio = Math.pow(10, Math.max(0.5, Math.min(6.0, attenuation_db)) / 20);
  const r_bsc_ohm = re_ohm * (ratio - 1);
  const l_bsc_henries = (re_ohm * r_bsc_ohm) / ((re_ohm + r_bsc_ohm) * Math.PI * f_bsc_hz);
  return {
    f_bsc_hz,
    r_bsc_ohm: Number(r_bsc_ohm.toFixed(2)),
    l_bsc_henries,
    l_bsc_mh: Number((l_bsc_henries * 1000).toFixed(2)),
    attenuation_db,
  };
}

/**
 * Synthesize passive LP or HP ladder blocks for a given frequency, slope, and load impedance.
 */
export function synthesizePassiveCrossoverBlocks(
  kind: 'lp' | 'hp',
  freq_hz: number,
  slope: CrossoverSlope,
  re_ohm: number,
): PassiveFilter[] {
  const w = 2 * Math.PI * Math.max(20, freq_hz);
  const r = Math.max(1, re_ohm);

  if (kind === 'lp') {
    switch (slope) {
      case '1st':
        return [{ type: 'SeriesL', henries: r / w, dcr_ohms: 0.15 }];
      case 'BW2':
        return [
          { type: 'SeriesL', henries: (r * Math.SQRT2) / w, dcr_ohms: 0.2 },
          { type: 'ShuntC', farads: 1 / (r * Math.SQRT2 * w) },
        ];
      case 'LR2':
        return [
          { type: 'SeriesL', henries: (2 * r) / w, dcr_ohms: 0.2 },
          { type: 'ShuntC', farads: 1 / (2 * r * w) },
        ];
      case 'LR4':
        return [
          { type: 'SeriesL', henries: (r * 1.4142) / w, dcr_ohms: 0.2 },
          { type: 'ShuntC', farads: 1.4142 / (r * w) },
          { type: 'SeriesL', henries: (r * 0.7071) / w, dcr_ohms: 0.15 },
          { type: 'ShuntC', farads: 0.3536 / (r * w) },
        ];
    }
  } else {
    switch (slope) {
      case '1st':
        return [{ type: 'SeriesC', farads: 1 / (r * w) }];
      case 'BW2':
        return [
          { type: 'SeriesC', farads: 1 / (r * Math.SQRT2 * w) },
          { type: 'ShuntL', henries: (r * Math.SQRT2) / w, dcr_ohms: 0.25 },
        ];
      case 'LR2':
        return [
          { type: 'SeriesC', farads: 1 / (2 * r * w) },
          { type: 'ShuntL', henries: (2 * r) / w, dcr_ohms: 0.25 },
        ];
      case 'LR4':
        return [
          { type: 'SeriesC', farads: 1 / (r * 1.4142 * w) },
          { type: 'ShuntL', henries: r / (1.4142 * w), dcr_ohms: 0.25 },
          { type: 'SeriesC', farads: 1 / (r * 0.7071 * w) },
          { type: 'ShuntL', henries: r / (0.3536 * w), dcr_ohms: 0.3 },
        ];
    }
  }
}

/**
 * Populate passive_filters on all ways from the shared crossover_points and driver parameters
 * (including Zobel compensation on inductive drivers and L-Pad level matching on higher-sensitivity ways).
 */
export function populatePassiveFiltersFromPoints(
  ways: WayDesign[],
  points: CrossoverPoint[],
  options?: { includeZobel?: boolean; includeLPad?: boolean },
): WayDesign[] {
  const includeZobel = options?.includeZobel ?? true;
  const includeLPad = options?.includeLPad ?? true;

  // Compute reference sensitivity (lowest way sensitivity, usually the woofer)
  const metrics = ways.map(w => deriveDriverMetrics(w.driver));
  const refSens = metrics[0]?.sensitivity_2v83_db ?? 87;

  return ways.map((way, idx) => {
    const blocks: PassiveFilter[] = [];
    const re = Math.max(1, way.driver.re_ohm);

    // 1. Add HP filters for this way
    for (const pt of points) {
      if (pt.high_way_index === idx) {
        blocks.push(...synthesizePassiveCrossoverBlocks('hp', pt.freq_hz, pt.slope, re));
      }
    }
    // 2. Add LP filters for this way
    for (const pt of points) {
      if (pt.low_way_index === idx) {
        blocks.push(...synthesizePassiveCrossoverBlocks('lp', pt.freq_hz, pt.slope, re));
      }
    }

    // 3. Add L-Pad if this way is > 1.0 dB more sensitive than the woofer
    if (includeLPad && idx > 0) {
      const diffDb = metrics[idx].sensitivity_2v83_db - refSens;
      if (diffDb > 1.0) {
        const attenDb = Math.min(12, Number(diffDb.toFixed(1)));
        const ratio = Math.pow(10, attenDb / 20);
        const series_ohms = Number((re * (ratio - 1) / ratio).toFixed(2));
        const shunt_ohms = Number((re / (ratio - 1)).toFixed(2));
        blocks.push({ type: 'LPad', series_ohms, shunt_ohms });
      }
    }

    // 4. Add Zobel impedance flattening on woofers/midranges with Le >= 0.15 mH
    if (includeZobel && way.driver.le_h >= 0.15e-3) {
      blocks.push({
        type: 'ZobelShunt',
        ohms: metrics[idx].zobel.r_ohm,
        farads: metrics[idx].zobel.c_farads,
      });
    }

    return {
      ...way,
      passive_filters: blocks,
      // When L-Pad is synthesized in passive mode, reset active gain_db to 0 so attenuation isn't doubled
      gain_db: includeLPad && idx > 0 ? 0 : way.gain_db,
    };
  });
}

/**
 * Assemble active filters for one way from crossover points + per-way EQ.
 */
function assembleFilters(
  wayIndex: number,
  points: CrossoverPoint[],
  eq: ActiveFilter[],
  includeCrossoverPoints: boolean,
): ActiveFilter[] {
  const filters: ActiveFilter[] = [];

  if (includeCrossoverPoints) {
    for (const pt of points) {
      if (pt.low_way_index === wayIndex) {
        filters.push(makeLowPass(pt.freq_hz, pt.slope));
      }
      if (pt.high_way_index === wayIndex) {
        filters.push(makeHighPass(pt.freq_hz, pt.slope));
      }
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
 * Respects `design.crossover_mode` ('active' | 'passive' | 'hybrid') so active and passive
 * crossover filters never unintentionally stack on top of each other.
 */
export function buildSolverInput(design: DesignState): SystemInput {
  const mode = design.crossover_mode ?? 'active';

  return {
    ways: design.ways.map((w, i): WayInput => {
      const activeEq = (design.per_way_eq[i] ?? []).filter(f => !f.bypassed);
      const userPassive = w.passive_filters.filter(pf => !pf.bypassed);

      let passive_filters: PassiveFilter[] = [];
      let active_filters: ActiveFilter[] = [];

      if (mode === 'active') {
        // Active DSP mode: crossover_points + per_way_eq (plus any explicitly added passive components)
        active_filters = assembleFilters(i, design.crossover_points, activeEq, true);
        passive_filters = userPassive;
      } else if (mode === 'passive') {
        // Passive RLC mode: use user's passive_filters (or auto-synthesize from crossover_points if empty)
        if (userPassive.length > 0) {
          passive_filters = userPassive;
        } else {
          const synthesized = populatePassiveFiltersFromPoints(design.ways, design.crossover_points, {
            includeZobel: true,
            includeLPad: false,
          });
          passive_filters = synthesized[i]?.passive_filters ?? [];
        }
        // Only include explicit per-way EQ if any, NOT duplicate active crossover points
        active_filters = assembleFilters(i, design.crossover_points, activeEq, false);
      } else {
        // Hybrid mode: both active crossover points + EQ and passive filters
        active_filters = assembleFilters(i, design.crossover_points, activeEq, true);
        passive_filters = userPassive;
      }

      return {
        name: w.name,
        driver: w.driver,
        enclosure: w.enclosure,
        passive_filters,
        active_filters,
        gain_db: w.gain_db,
        delay_s: w.delay_s,
        inverted: w.inverted,
        z_offset_m: w.z_offset_m,
        enabled: w.enabled,
        measured: w.measured,
        source_impedance_ohm: design.source_impedance_ohm,
      };
    }),
    freq_start_hz: design.freq_start_hz,
    freq_end_hz: design.freq_end_hz,
    freq_points: design.freq_points,
    drive_voltage_rms: design.drive_voltage_rms,
  };
}

/** Compute Golden Ratio external cabinet dimensions (cm) for a given net internal volume (L). */
export function computeGoldenCabinetDimensions(
  netVolumeLiters: number,
  wallThicknessMm = 18,
  bracingVolumeLiters = 0.8,
  driverDisplacementLiters = 0.5,
): CabinetDimensions {
  const grossInternalL = Math.max(1, netVolumeLiters + bracingVolumeLiters + driverDisplacementLiters);
  const grossInternalCm3 = grossInternalL * 1000;
  // Golden ratios: H : W : D = 1.618 : 1.0 : 0.618 => product = 1.0
  // Internal W = cbrt(grossInternalCm3 / (1.618 * 0.8)) using practical 1.6 : 1.0 : 0.8 ratio
  const intW = Math.cbrt(grossInternalCm3 / (1.6 * 0.85));
  const intH = intW * 1.6;
  const intD = intW * 0.85;
  const wallCm = (wallThicknessMm / 10) * 2;

  return {
    width_cm: Number((intW + wallCm).toFixed(1)),
    height_cm: Number((intH + wallCm).toFixed(1)),
    depth_cm: Number((intD + wallCm).toFixed(1)),
    wall_thickness_mm: wallThicknessMm,
    bracing_volume_l: bracingVolumeLiters,
    driver_displacement_l: driverDisplacementLiters,
    sync_with_enclosure: true,
  };
}

/** Default 2-way design for fresh start. */
export function defaultDesign(): DesignState {
  return {
    version: 2,
    topology: '2-way',
    crossover_mode: 'active',
    cabinet: computeGoldenCabinetDimensions(18, 18, 0.8, 0.5),
    ways: [
      {
        name: 'Woofer',
        preset_name: 'SB Acoustics SB17NRX2C35-8 (6.5" Woofer)',
        driver: { fs_hz: 37, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5, vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3 },
        enclosure: { type: 'Sealed', volume_m3: 18e-3, ql: 7 },
        passive_filters: [], gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
      },
      {
        name: 'Tweeter',
        preset_name: 'SEAS 27TDFC (1" Dome Tweeter)',
        driver: { fs_hz: 800, re_ohm: 5.5, le_h: 0.05e-3, qes: 0.5, qms: 2.0, vas_m3: 0.5e-3, sd_m2: 8e-4, xmax_m: 1e-3 },
        enclosure: { type: 'Sealed', volume_m3: 0.5e-3, ql: 7 },
        passive_filters: [], gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
      },
    ],
    crossover_points: [{ freq_hz: 2500, slope: 'LR4' as const, low_way_index: 0, high_way_index: 1 }],
    per_way_eq: [[], []],
    freq_start_hz: 20, freq_end_hz: 20000, freq_points: 300, drive_voltage_rms: 2.83, source_impedance_ohm: 0.35,
  };
}
