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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
