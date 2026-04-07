import type { CrossoverPoint, CrossoverSlope, WayInput } from '../types';
import { SLOPE_LABELS } from '../crossover';
import { NumericInput } from './NumericInput';

interface Props {
  points: CrossoverPoint[];
  ways: WayInput[];
  onChange: (points: CrossoverPoint[]) => void;
}

const SLOPES: CrossoverSlope[] = ['1st', 'BW2', 'LR2', 'LR4'];

export function CrossoverPointsEditor({ points, ways, onChange }: Props) {
  if (points.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--graf-warm-400)', padding: '4px 0' }}>
        No crossover points (1-way system)
      </div>
    );
  }

  const updatePoint = (idx: number, updates: Partial<CrossoverPoint>) => {
    const next = [...points];
    next[idx] = { ...next[idx], ...updates };
    onChange(next);
  };

  return (
    <div>
      <div className="section-subtitle" style={{ marginBottom: 6 }}>Crossover Points</div>
      {points.map((pt, i) => {
        const lowName = ways[pt.low_way_index]?.name ?? `Way ${pt.low_way_index + 1}`;
        const highName = pt.high_way_index !== null
          ? ways[pt.high_way_index]?.name ?? `Way ${pt.high_way_index + 1}`
          : null;

        const label = highName
          ? `${lowName} \u2194 ${highName}`
          : `${lowName} rolloff`;

        return (
          <div key={i} className="crossover-point-card">
            <div className="crossover-point-label">{label}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <NumericInput
                label="Freq"
                value={pt.freq_hz}
                step={100}
                min={20}
                max={20000}
                unit="Hz"
                tooltip={`Crossover frequency for ${label}`}
                onChange={(v) => updatePoint(i, { freq_hz: v })}
              />
              <select
                className="graf-form-control"
                style={{ fontSize: 12, width: 130 }}
                value={pt.slope}
                onChange={(e) => updatePoint(i, { slope: e.target.value as CrossoverSlope })}
              >
                {SLOPES.map(s => (
                  <option key={s} value={s}>{SLOPE_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}
