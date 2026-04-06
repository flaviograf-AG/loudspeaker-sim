import type { SimulationResult } from '../types';
import { FrequencyPlot } from './FrequencyPlot';

// GDS chart palette
const CHART_COLORS = {
  spl: '#00809E',          // graf-primary (teal)
  impedance: '#c0392b',    // warm red
  impedancePhase: '#e67e22', // orange for phase
  displacement: '#27ae60', // graf-success green
  xmaxLimit: '#e74c3c',   // red dashed for Xmax
  port: '#8e44ad',         // purple
  groupDelay: '#d4a017',   // graf-warning gold
};

const CHART_GROUP = 'freq-response';

interface PlotAreaProps {
  result: SimulationResult | null;
  xmaxMm?: number;
}

export function PlotArea({ result, xmaxMm }: PlotAreaProps) {
  if (!result) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--graf-warm-400)' }}>
        <p className="graf-lead">Run a simulation to see plots.</p>
      </div>
    );
  }

  // Auto-scale SPL: round to nearest 10 dB with padding
  const splValues = result.spl_db.filter(v => isFinite(v));
  const splMin = splValues.length > 0 ? Math.floor(Math.min(...splValues) / 10) * 10 : 40;
  const splMax = splValues.length > 0 ? Math.ceil(Math.max(...splValues) / 10) * 10 : 110;

  // Xmax limit line (constant across all frequencies)
  const displacementSeries = [
    { label: 'Excursion', data: result.cone_displacement_mm, color: CHART_COLORS.displacement },
  ];
  if (xmaxMm && xmaxMm > 0) {
    displacementSeries.push({
      label: 'Xmax',
      data: result.frequencies_hz.map(() => xmaxMm),
      color: CHART_COLORS.xmaxLimit,
      dash: true,
    } as typeof displacementSeries[0]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <FrequencyPlot
        title="SPL (dB) — 1m, 2.83V"
        frequencies={result.frequencies_hz}
        series={[{ label: 'SPL', data: result.spl_db, color: CHART_COLORS.spl }]}
        yLabel="dB SPL"
        yMin={splMin}
        yMax={splMax}
        group={CHART_GROUP}
      />

      <FrequencyPlot
        title="Impedance"
        frequencies={result.frequencies_hz}
        series={[
          { label: '|Z|', data: result.impedance_ohm, color: CHART_COLORS.impedance, yAxisIndex: 0 },
          { label: 'Phase', data: result.impedance_phase_deg, color: CHART_COLORS.impedancePhase, dash: true, yAxisIndex: 1 },
        ]}
        yLabel="Ohms"
        yMin={0}
        y2Label="Phase (°)"
        y2Min={-90}
        y2Max={90}
        group={CHART_GROUP}
      />

      <FrequencyPlot
        title="Cone Displacement (mm)"
        frequencies={result.frequencies_hz}
        series={displacementSeries}
        yLabel="mm"
        yMin={0}
        group={CHART_GROUP}
      />

      {result.port_velocity_ms && (
        <FrequencyPlot
          title="Port Air Velocity (m/s)"
          frequencies={result.frequencies_hz}
          series={[{ label: 'Port vel.', data: result.port_velocity_ms, color: CHART_COLORS.port }]}
          yLabel="m/s"
          yMin={0}
          group={CHART_GROUP}
        />
      )}

      <FrequencyPlot
        title="Group Delay (ms)"
        frequencies={result.frequencies_hz}
        series={[{ label: 'Group delay', data: result.group_delay_ms, color: CHART_COLORS.groupDelay }]}
        yLabel="ms"
        group={CHART_GROUP}
      />

      {result.acoustic_phase_deg && (
        <FrequencyPlot
          title="Acoustic Phase (degrees)"
          frequencies={result.frequencies_hz}
          series={[{ label: 'Phase', data: result.acoustic_phase_deg, color: '#7f8c8d' }]}
          yLabel="deg"
          group={CHART_GROUP}
        />
      )}
    </div>
  );
}
