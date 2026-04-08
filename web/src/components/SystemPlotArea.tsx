import type { SystemResult, SimulationResult } from '../types';
import type { OverlayData } from './ImportOverlay';
import { FrequencyPlot } from './FrequencyPlot';

const WAY_COLORS = ['#00809E', '#c0392b', '#27ae60', '#8e44ad', '#d4a017', '#e67e22'];
const SNAP_COLORS = ['#95a5a6', '#7f8c8d', '#bdc3c7', '#9b59b6', '#1abc9c', '#f39c12'];
const CHART_GROUP = 'system-response';

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
  /** Supplementary single-driver result for displacement/port velocity (1-way only) */
  supplement?: SimulationResult | null;
  xmaxMm?: number;
  overlay?: OverlayData;
  snapshots?: { name: string; spl: number[]; freqs: number[] }[];
}

export function SystemPlotArea({ result, supplement, xmaxMm, overlay, snapshots }: Props) {
  if (!result) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--graf-warm-400)' }}>
        <p className="graf-lead">Configure ways to see system response.</p>
      </div>
    );
  }

  const isSingleWay = result.ways.length === 1;

  // Per-way SPL + system total
  const splSeries = [
    ...result.ways.map((w, i) => ({
      label: w.name,
      data: w.spl_db,
      color: WAY_COLORS[i % WAY_COLORS.length],
      dash: !isSingleWay, // solid for 1-way, dashed for multi-way per-way
    })),
    ...(!isSingleWay ? [{
      label: 'System',
      data: result.system_spl_db,
      color: '#1a1a1a',
      dash: false,
    }] : []),
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

  // Min impedance warning
  const minZWarning = result.min_impedance_ohm < 3.2;

  // Impedance series — add overlay ZMA if present
  const impedanceSeries = [
    { label: '|Z| total', data: result.system_impedance_ohm, color: '#c0392b' },
    ...(overlay?.zma ? [{
      label: 'Imported |Z|',
      data: interpolateOverlay(overlay.zma.frequencies, overlay.zma.impedance_ohm, result.frequencies_hz),
      color: '#8e44ad',
      dash: true,
    }] : []),
  ];

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

      <FrequencyPlot
        title={isSingleWay ? 'SPL (dB) — 1m, 2.83V' : 'System SPL (dB) — per-way + combined'}
        frequencies={result.frequencies_hz}
        series={splSeries}
        yLabel="dB SPL"
        yMin={splMin}
        yMax={splMax}
        height={350}
        group={CHART_GROUP}
      />

      {/* Crossover filter transfer function */}
      <FrequencyPlot
        title="Filter Transfer Function (dB) — crossover attenuation per way"
        frequencies={result.frequencies_hz}
        series={filterSeries}
        yLabel="dB"
        yMin={-40}
        yMax={6}
        group={CHART_GROUP}
      />

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

      {/* Supplementary single-driver charts: displacement + port velocity */}
      {supplement && (
        <>
          <FrequencyPlot
            title="Cone Displacement (mm)"
            frequencies={supplement.frequencies_hz}
            series={[
              { label: 'Excursion', data: supplement.cone_displacement_mm, color: '#27ae60' },
              ...(xmaxMm && xmaxMm > 0 ? [{
                label: 'Xmax',
                data: supplement.frequencies_hz.map(() => xmaxMm),
                color: '#e74c3c',
                dash: true,
              }] : []),
            ]}
            yLabel="mm"
            yMin={0}
            group={CHART_GROUP}
          />

          {supplement.port_velocity_ms && (
            <FrequencyPlot
              title="Port Air Velocity (m/s)"
              frequencies={supplement.frequencies_hz}
              series={[{ label: 'Port vel.', data: supplement.port_velocity_ms, color: '#8e44ad' }]}
              yLabel="m/s"
              yMin={0}
              group={CHART_GROUP}
            />
          )}
        </>
      )}
    </div>
  );
}
