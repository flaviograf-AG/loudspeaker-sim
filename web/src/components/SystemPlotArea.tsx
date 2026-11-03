import { useState } from 'react';
import type { SystemResult, SimulationResult, CabinetDimensions, WayDesign } from '../types';
import type { OverlayData } from './ImportOverlay';
import { FrequencyPlot } from './FrequencyPlot';

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
}: Props) {
  const [showPolarBaffle, setShowPolarBaffle] = useState(false);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {minZWarning && (
        <div style={{
          background: '#fee', border: '1px solid #e0a0a0', borderRadius: 4,
          padding: '3px 8px', fontSize: 11, color: '#c0392b', marginBottom: 4,
        }}>
          Min |Z| = {result.min_impedance_ohm.toFixed(1)}&Omega; at {result.min_impedance_freq_hz.toFixed(0)}Hz (below 3.2&Omega; safe limit)
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 6px' }}>
        <span style={{ fontSize: 11, color: 'var(--graf-warm-500, #6b655e)' }}>
          Baffle width: <strong>{Math.round(baffleWidthM * 100)} cm</strong> &middot; Baffle step f<sub>3dB</sub> &approx; <strong>{fStepHz} Hz</strong>
        </span>
        <label style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showPolarBaffle}
            data-testid="toggle-polar-baffle"
            onChange={(e) => setShowPolarBaffle(e.target.checked)}
          />
          Overlay Baffle Step &amp; Off-Axis Directivity (0&deg; / 30&deg; / 60&deg;)
        </label>
      </div>

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
