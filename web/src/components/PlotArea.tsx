import type { SimulationResult } from '../types';
import { FrequencyPlot } from './FrequencyPlot';

interface PlotAreaProps {
  result: SimulationResult | null;
  xmaxMm?: number;
}

export function PlotArea({ result }: PlotAreaProps) {
  if (!result) return <div>Run a simulation to see plots.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <FrequencyPlot
        title="SPL (dB) — 1m, 2.83V"
        frequencies={result.frequencies_hz}
        series={[
          { label: 'SPL', data: result.spl_db, color: '#2563eb' },
        ]}
        yLabel="dB SPL"
        yMin={40}
        yMax={110}
      />

      <FrequencyPlot
        title="Impedance (Ω)"
        frequencies={result.frequencies_hz}
        series={[
          { label: '|Z|', data: result.impedance_ohm, color: '#dc2626' },
        ]}
        yLabel="Ohms"
        yMin={0}
      />

      <FrequencyPlot
        title="Cone Displacement (mm)"
        frequencies={result.frequencies_hz}
        series={[
          { label: 'Excursion', data: result.cone_displacement_mm, color: '#16a34a' },
        ]}
        yLabel="mm"
        yMin={0}
      />

      {result.port_velocity_ms && (
        <FrequencyPlot
          title="Port Air Velocity (m/s)"
          frequencies={result.frequencies_hz}
          series={[
            { label: 'Port vel.', data: result.port_velocity_ms, color: '#9333ea' },
          ]}
          yLabel="m/s"
          yMin={0}
        />
      )}
    </div>
  );
}
