import type { SystemResult } from '../types';
import { FrequencyPlot } from './FrequencyPlot';

const WAY_COLORS = ['#00809E', '#c0392b', '#27ae60', '#8e44ad', '#d4a017', '#e67e22'];
const CHART_GROUP = 'system-response';

interface Props {
  result: SystemResult | null;
}

export function SystemPlotArea({ result }: Props) {
  if (!result) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--graf-warm-400)' }}>
        <p className="graf-lead">Configure ways to see system response.</p>
      </div>
    );
  }

  // Per-way SPL + system total
  const splSeries = [
    ...result.ways.map((w, i) => ({
      label: w.name,
      data: w.spl_db,
      color: WAY_COLORS[i % WAY_COLORS.length],
      dash: true,
    })),
    {
      label: 'System',
      data: result.system_spl_db,
      color: '#1a1a1a',
      dash: false,
    },
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Min impedance warning — non-blocking inline notice */}
      {minZWarning && (
        <div style={{
          background: '#fee', border: '1px solid #e0a0a0', borderRadius: 4,
          padding: '3px 8px', fontSize: 11, color: '#c0392b', marginBottom: 4,
        }}>
          Min |Z| = {result.min_impedance_ohm.toFixed(1)}Ω at {result.min_impedance_freq_hz.toFixed(0)}Hz (below 3.2Ω safe limit)
        </div>
      )}

      <FrequencyPlot
        title="System SPL (dB) — per-way + combined"
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
        title="System Impedance (Ω)"
        frequencies={result.frequencies_hz}
        series={[{ label: '|Z| total', data: result.system_impedance_ohm, color: '#c0392b' }]}
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
    </div>
  );
}
