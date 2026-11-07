import { useState } from 'react';
import type { SystemResult, SimulationResult, CabinetDimensions, WayDesign, CrossoverPoint, CrossoverSlope } from '../types';
import type { OverlayData } from './ImportOverlay';
import { FrequencyPlot } from './FrequencyPlot';
import { InfoTooltip } from './InfoTooltip';

const WAY_COLORS = ['#00809E', '#c0392b', '#27ae60', '#8e44ad', '#d4a017', '#e67e22'];
const SNAP_COLORS = ['#95a5a6', '#7f8c8d', '#bdc3c7', '#9b59b6', '#1abc9c', '#f39c12'];
const CHART_GROUP = 'system-response';
const C0 = 343.21;

/** First-order Bessel J1(x) / x * 2 circular piston directivity amplitude ratio */
function jincDirectivityDb(kaSinTheta: number): number {
  const x = Math.abs(kaSinTheta);
  if (x < 1e-4) return 0;
  // Polynomial / asymptotic approximation of 2 * J1(x) / x
  let val: number;
  if (x < 3.8317) {
    const x2 = x * x;
    val = 1 - x2 / 8 + (x2 * x2) / 192 - (x2 * x2 * x2) / 9216 + (x2 * x2 * x2 * x2) / 737280;
  } else {
    // Past first null, envelope decays as sqrt(2 / (pi * x^3))
    val = Math.sqrt(2 / (Math.PI * x * x * x)) * Math.abs(Math.cos(x - (3 * Math.PI) / 4));
  }
  const clamped = Math.max(Math.abs(val), 0.063); // floor at -24 dB
  return 20 * Math.log10(clamped);
}

/** Olson / Linkwitz 2pi -> 4pi baffle step loss in dB at frequency f for baffle width W (m) */
function baffleStepLossDb(f: number, baffleWidthM: number): number {
  const fStep = 115 / Math.max(baffleWidthM, 0.08);
  const r2 = (f / fStep) ** 2;
  return 10 * Math.log10((0.25 + r2) / (1 + r2));
}

// Linear interpolation of overlay data onto the simulation frequency grid
function interpolateOverlay(overlayFreqs: number[], overlayValues: number[], simFreqs: number[]): number[] {
  return simFreqs.map(f => {
    if (f <= overlayFreqs[0]) return overlayValues[0];
    if (f >= overlayFreqs[overlayFreqs.length - 1]) return overlayValues[overlayValues.length - 1];
    let lo = 0, hi = overlayFreqs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (overlayFreqs[mid] <= f) lo = mid; else hi = mid;
    }
    const t = (f - overlayFreqs[lo]) / (overlayFreqs[hi] - overlayFreqs[lo]);
    return overlayValues[lo] + t * (overlayValues[hi] - overlayValues[lo]);
  });
}

/** Ideal acoustic target filter magnitude in dB for LP or HP at f_xo */
function computeTargetSlopeGainDb(f: number, fxo: number, slope: CrossoverSlope, kind: 'lp' | 'hp'): number {
  const r = kind === 'lp' ? f / Math.max(fxo, 1) : Math.max(fxo, 1) / Math.max(f, 1);
  const r2 = r * r;
  let magSq = 1;
  switch (slope) {
    case '1st':
      magSq = 1 / (1 + r2);
      break;
    case 'BW2':
      magSq = 1 / (1 + r2 * r2);
      break;
    case 'LR2':
      magSq = 1 / ((1 + r2) * (1 + r2));
      break;
    case 'LR4':
      magSq = 1 / ((1 + r2 * r2) * (1 + r2 * r2));
      break;
  }
  return Math.max(-55, 10 * Math.log10(Math.max(magSq, 1e-12)));
}

/** Find low-frequency roll-off point (e.g., F3 = -3 dB, F6 = -6 dB, F10 = -10 dB) relative to reference passband SPL */
function findLowFreqCutoffHz(freqs: number[], spl: number[], refSpl: number, dropDb: number): number | null {
  const target = refSpl - dropDb;
  // Find first index from low frequency upward where SPL reaches target
  for (let i = 0; i < freqs.length; i++) {
    if (spl[i] >= target) {
      if (i === 0) return null; // already above target at lowest frequency
      const s0 = spl[i - 1];
      const s1 = spl[i];
      const f0 = freqs[i - 1];
      const f1 = freqs[i];
      const frac = Math.abs(s1 - s0) > 1e-6 ? (target - s0) / (s1 - s0) : 0.5;
      return f0 + Math.max(0, Math.min(1, frac)) * (f1 - f0);
    }
  }
  return null;
}

interface Props {
  result: SystemResult | null;
  /** Supplementary single-driver result for displacement/port velocity (fallback) */
  supplement?: SimulationResult | null;
  xmaxMm?: number;
  wayXmaxMm?: number[];
  overlay?: OverlayData;
  snapshots?: { name: string; spl: number[]; freqs: number[] }[];
  viewFocus?: 'all' | 'enclosure' | 'crossover';
  cabinet?: CabinetDimensions;
  ways?: WayDesign[];
  crossoverPoints?: CrossoverPoint[];
}

export function SystemPlotArea({
  result,
  supplement,
  xmaxMm,
  wayXmaxMm,
  overlay,
  snapshots,
  viewFocus = 'all',
  cabinet,
  ways,
  crossoverPoints,
}: Props) {
  const [showPolarBaffle, setShowPolarBaffle] = useState(false);
  const [showTargetSlopes, setShowTargetSlopes] = useState(false);

  if (!result) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--graf-warm-400)' }}>
        <p className="graf-lead">Configure ways to see system response.</p>
      </div>
    );
  }

  const isSingleWay = result.ways.length === 1;
  const baffleWidthM = (cabinet?.width_cm ?? 24) / 100;
  const fStepHz = Math.round(115 / Math.max(baffleWidthM, 0.08));
  // Effective radiating piston radius at each frequency (uses highest-frequency active way or single way)
  const effectivePistonRadiusForFreq = (f: number): number => {
    if (!ways || ways.length === 0) return 0.065;
    if (ways.length === 1) return Math.sqrt(Math.max(ways[0].driver.sd_m2, 1e-4) / Math.PI);
    // Weight piston radius by each way's linear acoustic contribution at frequency f
    let weightSum = 0;
    let rWeighted = 0;
    const fIdx = result.frequencies_hz.indexOf(f);
    ways.forEach((w, i) => {
      const rWay = Math.sqrt(Math.max(w.driver.sd_m2, 1e-4) / Math.PI);
      const spl = fIdx >= 0 && result.ways[i] ? result.ways[i].spl_db[fIdx] : 80;
      const amp = Math.pow(10, (spl - 80) / 20);
      weightSum += amp;
      rWeighted += amp * rWay;
    });
    return weightSum > 0 ? rWeighted / weightSum : Math.sqrt(Math.max(ways[0].driver.sd_m2, 1e-4) / Math.PI);
  };

  const polarOverlaySeries = showPolarBaffle
    ? [
        {
          label: `0° Free-Space (Baffle W=${Math.round(baffleWidthM * 100)}cm)`,
          data: result.frequencies_hz.map((f, idx) => result.system_spl_db[idx] + baffleStepLossDb(f, baffleWidthM)),
          color: '#16a085',
          dash: true,
        },
        {
          label: '30° Off-Axis',
          data: result.frequencies_hz.map((f, idx) => {
            const a = effectivePistonRadiusForFreq(f);
            const kaSin = ((2 * Math.PI * f) / C0) * a * Math.sin((30 * Math.PI) / 180);
            return result.system_spl_db[idx] + baffleStepLossDb(f, baffleWidthM) + jincDirectivityDb(kaSin);
          }),
          color: '#e67e22',
          dash: true,
        },
        {
          label: '60° Off-Axis',
          data: result.frequencies_hz.map((f, idx) => {
            const a = effectivePistonRadiusForFreq(f);
            const kaSin = ((2 * Math.PI * f) / C0) * a * Math.sin((60 * Math.PI) / 180);
            return result.system_spl_db[idx] + baffleStepLossDb(f, baffleWidthM) + jincDirectivityDb(kaSin);
          }),
          color: '#8e44ad',
          dash: true,
        },
      ]
    : [];

  // Multi-angle measured Off-Axis FRD system summation (when any way has measured.off_axis curves)
  const measuredAngles = Array.from(
    new Set(
      (ways ?? []).flatMap((w) => (w.measured?.off_axis ?? []).map((oa) => oa.angle_deg))
    )
  ).sort((a, b) => a - b);

  const OFF_AXIS_COLORS = ['#0284c7', '#d97706', '#7c3aed', '#059669', '#dc2626', '#475569'];

  const measuredOffAxisSeries = measuredAngles.map((angleDeg, angleIdx) => {
    // Pre-interpolate each way's on-axis and off-axis FRD onto result.frequencies_hz
    const perWaySplDelta: number[][] = [];
    const perWayPhaseDelta: number[][] = [];

    (ways ?? []).forEach((w) => {
      const oa = w.measured?.off_axis?.find((o) => o.angle_deg === angleDeg);
      if (oa && w.measured && w.measured.spl_db.length > 0 && oa.spl_db.length > 0) {
        const onSpl = interpolateOverlay(w.measured.frequencies_hz, w.measured.spl_db, result.frequencies_hz);
        const offSpl = interpolateOverlay(oa.frequencies_hz, oa.spl_db, result.frequencies_hz);
        perWaySplDelta.push(offSpl.map((v, k) => v - onSpl[k]));

        if (oa.phase_deg.length > 0 && w.measured.phase_deg.length > 0) {
          const onPh = interpolateOverlay(w.measured.frequencies_hz, w.measured.phase_deg, result.frequencies_hz);
          const offPh = interpolateOverlay(oa.frequencies_hz, oa.phase_deg, result.frequencies_hz);
          perWayPhaseDelta.push(offPh.map((v, k) => v - onPh[k]));
        } else {
          perWayPhaseDelta.push(result.frequencies_hz.map(() => 0));
        }
      } else {
        // Fallback to piston directivity for ways without an off-axis FRD at this angle
        const rWay = Math.sqrt(Math.max(w.driver.sd_m2, 1e-4) / Math.PI);
        perWaySplDelta.push(
          result.frequencies_hz.map((f) => {
            const kaSin = ((2 * Math.PI * f) / C0) * rWay * Math.sin((angleDeg * Math.PI) / 180);
            return jincDirectivityDb(kaSin);
          })
        );
        perWayPhaseDelta.push(result.frequencies_hz.map(() => 0));
      }
    });

    const data = result.frequencies_hz.map((_, fIdx) => {
      let sumRe = 0;
      let sumIm = 0;
      result.ways.forEach((rw, wIdx) => {
        const spl = rw.spl_db[fIdx] + (perWaySplDelta[wIdx]?.[fIdx] ?? 0);
        const phDeg = (rw.phase_deg?.[fIdx] ?? 0) + (perWayPhaseDelta[wIdx]?.[fIdx] ?? 0);
        const phRad = (phDeg * Math.PI) / 180;
        const mag = Math.pow(10, spl / 20);
        sumRe += mag * Math.cos(phRad);
        sumIm += mag * Math.sin(phRad);
      });
      const totalMag = Math.hypot(sumRe, sumIm);
      return totalMag > 1e-12 ? 20 * Math.log10(totalMag) : -120;
    });

    return {
      label: isSingleWay ? `${angleDeg}° Off-Axis (FRD)` : `System ${angleDeg}° (FRD)`,
      data,
      color: OFF_AXIS_COLORS[angleIdx % OFF_AXIS_COLORS.length],
      dash: true,
    };
  });

  // Compute passband reference SPL (150 Hz - 2000 Hz average, or peak - 1.5 dB for subwoofers)
  const passbandIndices = result.frequencies_hz
    .map((f, idx) => (f >= 150 && f <= 2000 && isFinite(result.system_spl_db[idx]) ? idx : -1))
    .filter((idx) => idx >= 0);
  const refSplDb =
    passbandIndices.length > 0
      ? passbandIndices.reduce((acc, idx) => acc + result.system_spl_db[idx], 0) / passbandIndices.length
      : Math.max(...result.system_spl_db.filter((v) => isFinite(v)), 85) - 1.5;

  const f3Hz = findLowFreqCutoffHz(result.frequencies_hz, result.system_spl_db, refSplDb, 3);
  const f6Hz = findLowFreqCutoffHz(result.frequencies_hz, result.system_spl_db, refSplDb, 6);
  const f10Hz = findLowFreqCutoffHz(result.frequencies_hz, result.system_spl_db, refSplDb, 10);

  // Passband ripple (+/- dB between 100 Hz and 10 kHz)
  const midHighVals = result.frequencies_hz
    .map((f, idx) => (f >= 100 && f <= 10000 ? result.system_spl_db[idx] : NaN))
    .filter((v) => isFinite(v));
  const ripplePlusMinusDb =
    midHighVals.length > 2 ? (Math.max(...midHighVals) - Math.min(...midHighVals)) / 2 : 0;

  // Target Acoustic Crossover Slope Overlay (for voicing passive/active crossovers)
  const targetSlopeSeries =
    showTargetSlopes && crossoverPoints && crossoverPoints.length > 0
      ? crossoverPoints.flatMap((pt, idx) => {
          const loName = result.ways[pt.low_way_index]?.name ?? `Way ${pt.low_way_index + 1}`;
          const hiName = pt.high_way_index !== null ? result.ways[pt.high_way_index]?.name ?? `Way ${pt.high_way_index + 1}` : null;
          const curves = [
            {
              label: `Target ${loName} LP (${pt.slope} @ ${pt.freq_hz}Hz)`,
              data: result.frequencies_hz.map((f) => refSplDb + computeTargetSlopeGainDb(f, pt.freq_hz, pt.slope, 'lp')),
              color: idx === 0 ? '#0ea5e9' : '#14b8a6',
              dash: true,
            },
          ];
          if (hiName) {
            curves.push({
              label: `Target ${hiName} HP (${pt.slope} @ ${pt.freq_hz}Hz)`,
              data: result.frequencies_hz.map((f) => refSplDb + computeTargetSlopeGainDb(f, pt.freq_hz, pt.slope, 'hp')),
              color: idx === 0 ? '#f43f5e' : '#f97316',
              dash: true,
            });
          }
          return curves;
        })
      : [];

  // Per-way SPL + system total
  const splSeries = [
    ...result.ways.map((w, i) => ({
      label: w.name,
      data: w.spl_db,
      color: WAY_COLORS[i % WAY_COLORS.length],
      dash: !isSingleWay, // solid for 1-way, dashed for multi-way per-way
    })),
    ...(!isSingleWay ? [{
      label: 'System (2π)',
      data: result.system_spl_db,
      color: '#1a1a1a',
      dash: false,
    }] : []),
    ...targetSlopeSeries,
    ...measuredOffAxisSeries,
    ...polarOverlaySeries,
    // Snapshots
    ...(snapshots || []).map((s, i) => ({
      label: s.name,
      data: interpolateOverlay(s.freqs, s.spl, result.frequencies_hz),
      color: SNAP_COLORS[i % SNAP_COLORS.length],
      dash: true,
    })),
    // FRD overlay
    ...(overlay?.frd ? [{
      label: 'Imported FRD',
      data: interpolateOverlay(overlay.frd.frequencies, overlay.frd.spl_db, result.frequencies_hz),
      color: '#2c3e50',
      dash: true,
    }] : []),
  ];

  const splValues = result.system_spl_db.filter(v => isFinite(v));
  const splMin = splValues.length > 0 ? Math.floor(Math.min(...splValues) / 10) * 10 : 40;
  const splMax = splValues.length > 0 ? Math.ceil(Math.max(...splValues) / 10) * 10 : 110;

  // Per-way filter transfer function
  const filterSeries = result.ways.map((w, i) => ({
    label: w.name,
    data: w.filter_gain_db,
    color: WAY_COLORS[i % WAY_COLORS.length],
  }));

  // Acoustic Phase series
  const hasPhase = (result.system_phase_deg && result.system_phase_deg.length > 0) ||
    result.ways.some(w => w.phase_deg && w.phase_deg.length > 0);
  const phaseSeries = [
    ...result.ways
      .filter(w => w.phase_deg && w.phase_deg.length > 0)
      .map((w, i) => ({
        label: `${w.name} Phase`,
        data: w.phase_deg!,
        color: WAY_COLORS[i % WAY_COLORS.length],
        dash: !isSingleWay,
      })),
    ...(!isSingleWay && result.system_phase_deg && result.system_phase_deg.length > 0
      ? [{ label: 'System Phase', data: result.system_phase_deg, color: '#1a1a1a', dash: false }]
      : []),
  ];

  // Min impedance warning
  const minZWarning = result.min_impedance_ohm < 3.2;

  // Impedance series — show per-way input impedance + combined system impedance + overlay ZMA
  const impedanceSeries = [
    ...(!isSingleWay
      ? result.ways.map((w, i) => ({
          label: `${w.name} |Z|`,
          data: w.impedance_ohm,
          color: WAY_COLORS[i % WAY_COLORS.length],
          dash: true,
        }))
      : []),
    { label: '|Z| total', data: result.system_impedance_ohm, color: '#c0392b', dash: false },
    ...(overlay?.zma ? [{
      label: 'Imported |Z|',
      data: interpolateOverlay(overlay.zma.frequencies, overlay.zma.impedance_ohm, result.frequencies_hz),
      color: '#8e44ad',
      dash: true,
    }] : []),
  ];

  // Filtered per-way Cone Excursion series (natively returned by solve_system)
  const waysWithDisp = result.ways.filter(w => w.cone_displacement_mm && w.cone_displacement_mm.length > 0);
  const dispSeries =
    waysWithDisp.length > 0
      ? [
          ...result.ways
            .map((w, i) =>
              w.cone_displacement_mm && w.cone_displacement_mm.length > 0
                ? {
                    label: `${w.name} Excursion`,
                    data: w.cone_displacement_mm,
                    color: WAY_COLORS[i % WAY_COLORS.length],
                  }
                : null
            )
            .filter((s): s is NonNullable<typeof s> => s !== null),
          ...(xmaxMm && xmaxMm > 0
            ? [
                {
                  label: 'Xmax',
                  data: result.frequencies_hz.map(() => (wayXmaxMm?.[0] ?? xmaxMm)),
                  color: '#e74c3c',
                  dash: true,
                },
              ]
            : []),
        ]
      : supplement
      ? [
          { label: 'Excursion', data: supplement.cone_displacement_mm, color: '#27ae60' },
          ...(xmaxMm && xmaxMm > 0
            ? [
                {
                  label: 'Xmax',
                  data: supplement.frequencies_hz.map(() => xmaxMm),
                  color: '#e74c3c',
                  dash: true,
                },
              ]
            : []),
        ]
      : [];

  // Port velocity series (from any vented/bandpass way or supplement)
  const waysWithPortVel = result.ways.filter(w => w.port_velocity_ms && w.port_velocity_ms.length > 0);
  const portVelSeries =
    waysWithPortVel.length > 0
      ? [
          ...result.ways
            .map((w, i) =>
              w.port_velocity_ms && w.port_velocity_ms.length > 0
                ? {
                    label: `${w.name} Port vel.`,
                    data: w.port_velocity_ms,
                    color: WAY_COLORS[i % WAY_COLORS.length],
                  }
                : null
            )
            .filter((s): s is NonNullable<typeof s> => s !== null),
          {
            label: 'Chuffing limit (17 m/s)',
            data: result.frequencies_hz.map(() => 17),
            color: '#e74c3c',
            dash: true,
          },
        ]
      : supplement?.port_velocity_ms
      ? [
          { label: 'Port vel.', data: supplement.port_velocity_ms, color: '#8e44ad' },
          {
            label: 'Chuffing limit (17 m/s)',
            data: supplement.frequencies_hz.map(() => 17),
            color: '#e74c3c',
            dash: true,
          },
        ]
      : [];

  // Peak cone excursion & peak port velocity across all ways
  const peakDispMm = Math.max(
    0,
    ...result.ways.flatMap((w) => w.cone_displacement_mm ?? []),
    ...(supplement?.cone_displacement_mm ?? [])
  );
  const primaryXmaxMm = wayXmaxMm?.[0] ?? xmaxMm ?? 6;
  const dispExceeded = primaryXmaxMm > 0 && peakDispMm > primaryXmaxMm;

  const peakPortVelMs = Math.max(
    0,
    ...result.ways.flatMap((w) => w.port_velocity_ms ?? []),
    ...(supplement?.port_velocity_ms ?? [])
  );
  const hasPortVel = waysWithPortVel.length > 0 || !!supplement?.port_velocity_ms;
  const portChuffWarning = hasPortVel && peakPortVelMs > 17;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Live Acoustic Metrics & Health Summary Bar */}
      <div
        data-testid="acoustic-metrics-bar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '5px 10px',
          background: '#f8fafc',
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          fontSize: 11,
          color: '#334155',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <span title="Average passband sensitivity (150 Hz – 2 kHz) and response ripple (±dB from 100 Hz – 10 kHz)">
            <strong>SPL<sub>ref</sub>:</strong> {refSplDb.toFixed(1)} dB{' '}
            <span style={{ color: '#64748b' }}>(±{ripplePlusMinusDb.toFixed(1)} dB)</span>
          </span>
          <span title="Low-frequency cutoff points where response drops -3 dB (F3), -6 dB (F6), and -10 dB (F10) below passband level">
            <strong>F3:</strong> {f3Hz ? `${f3Hz.toFixed(1)} Hz` : '—'} ·{' '}
            <strong>F6:</strong> {f6Hz ? `${f6Hz.toFixed(1)} Hz` : '—'} ·{' '}
            <strong>F10:</strong> {f10Hz ? `${f10Hz.toFixed(1)} Hz` : '—'}
            <InfoTooltip
              variant="item"
              title="F3 / F6 / F10 — Low-Frequency Extension Cutoffs"
              text="F3 (-3 dB, half acoustic power) is the standard anechoic bass cutoff rating. F6 (-6 dB) and F10 (-10 dB) indicate usable in-room bass extension with room boundary gain."
              links={[{ label: 'Wikipedia: Cutoff Frequency (-3 dB)', url: 'https://en.wikipedia.org/wiki/Cutoff_frequency' }]}
            />
          </span>
          <span
            style={{
              color: minZWarning ? '#b91c1c' : '#15803d',
              fontWeight: minZWarning ? 700 : 500,
            }}
            title="Minimum electrical impedance across the frequency sweep. Keep ≥ 3.2 Ω for 4 Ω nominal amplifier stability."
          >
            <strong>Z<sub>min</sub>:</strong> {result.min_impedance_ohm.toFixed(1)} Ω @{' '}
            {result.min_impedance_freq_hz.toFixed(0)} Hz {minZWarning ? '⚠' : '✓'}
          </span>
          {peakDispMm > 0 && (
            <span
              style={{
                color: dispExceeded ? '#b91c1c' : '#334155',
                fontWeight: dispExceeded ? 700 : 400,
              }}
              title="Peak cone excursion across the sweep compared against driver Xmax limit"
            >
              <strong>X<sub>peak</sub>:</strong> {peakDispMm.toFixed(2)} / {primaryXmaxMm.toFixed(1)} mm{' '}
              {dispExceeded ? '⚠ >Xmax' : '✓'}
            </span>
          )}
          {hasPortVel && (
            <span
              style={{
                color: portChuffWarning ? '#b91c1c' : '#334155',
                fontWeight: portChuffWarning ? 700 : 400,
              }}
              title="Peak port air velocity. Keep below ~17 m/s (Mach 0.05) to avoid audible port turbulence / chuffing."
            >
              <strong>V<sub>port</sub>:</strong> {peakPortVelMs.toFixed(1)} m/s{' '}
              {portChuffWarning ? '⚠ Chuffing' : '✓'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          {!isSingleWay && crossoverPoints && crossoverPoints.length > 0 && (
            <label
              style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none', color: '#0369a1', fontWeight: 600 }}
              title="Overlay ideal textbook acoustic LP & HP crossover target slopes (LR4, LR2, BW2, 1st) on the SPL chart to guide passive/active voicing"
            >
              <input
                type="checkbox"
                checked={showTargetSlopes}
                data-testid="toggle-target-slopes"
                onChange={(e) => setShowTargetSlopes(e.target.checked)}
              />
              Target XO Slopes
            </label>
          )}
          <label
            style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}
            title={`Baffle width: ${Math.round(baffleWidthM * 100)} cm (f_bsc ≈ ${fStepHz} Hz)`}
          >
            <input
              type="checkbox"
              checked={showPolarBaffle}
              data-testid="toggle-polar-baffle"
              onChange={(e) => setShowPolarBaffle(e.target.checked)}
            />
            Baffle &amp; Off-Axis (0°/30°/60°)
          </label>
        </div>
      </div>

      {minZWarning && (
        <div style={{
          background: '#fee', border: '1px solid #e0a0a0', borderRadius: 4,
          padding: '3px 8px', fontSize: 11, color: '#c0392b', marginBottom: 4,
        }}>
          Min |Z| = {result.min_impedance_ohm.toFixed(1)}&Omega; at {result.min_impedance_freq_hz.toFixed(0)}Hz (below 3.2&Omega; safe limit)
        </div>
      )}

      <FrequencyPlot
        title={isSingleWay ? 'SPL (dB) — 1m, 2.83V' : 'System SPL (dB) — per-way + combined'}
        frequencies={result.frequencies_hz}
        series={splSeries}
        yLabel="dB SPL"
        yMin={splMin}
        yMax={splMax}
        height={320}
        group={CHART_GROUP}
      />

      {/* Crossover filter transfer function */}
      {viewFocus !== 'enclosure' && (
        <FrequencyPlot
          title="Filter Transfer Function (dB) — crossover attenuation per way"
          frequencies={result.frequencies_hz}
          series={filterSeries}
          yLabel="dB"
          yMin={-40}
          yMax={6}
          group={CHART_GROUP}
        />
      )}

      {/* Acoustic Phase */}
      {hasPhase && phaseSeries.length > 0 && (
        <FrequencyPlot
          title="Acoustic Phase (deg)"
          frequencies={result.frequencies_hz}
          series={phaseSeries}
          yLabel="Degrees"
          yMin={-180}
          yMax={180}
          group={CHART_GROUP}
        />
      )}

      <FrequencyPlot
        title="System Impedance (&Omega;)"
        frequencies={result.frequencies_hz}
        series={impedanceSeries}
        yLabel="Ohms"
        yMin={0}
        group={CHART_GROUP}
      />

      <FrequencyPlot
        title="System Group Delay (ms)"
        frequencies={result.frequencies_hz}
        series={[{ label: 'Group delay', data: result.system_group_delay_ms, color: '#d4a017' }]}
        yLabel="ms"
        group={CHART_GROUP}
      />

      {/* Cone Displacement (mm) */}
      {dispSeries.length > 0 && (
        <FrequencyPlot
          title="Cone Displacement (mm)"
          frequencies={result.frequencies_hz}
          series={dispSeries}
          yLabel="mm"
          yMin={0}
          group={CHART_GROUP}
        />
      )}

      {/* Port Air Velocity (m/s) */}
      {portVelSeries.length > 0 && (
        <FrequencyPlot
          title="Port Air Velocity (m/s)"
          frequencies={result.frequencies_hz}
          series={portVelSeries}
          yLabel="m/s"
          yMin={0}
          group={CHART_GROUP}
        />
      )}
    </div>
  );
}
