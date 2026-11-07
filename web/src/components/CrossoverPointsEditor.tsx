import type { CrossoverPoint, CrossoverSlope } from '../types';
import { SLOPE_LABELS } from '../crossover';
import { NumericInput } from './NumericInput';
import { InfoTooltip } from './InfoTooltip';

interface Props {
  points: CrossoverPoint[];
  ways: { name: string; inverted?: boolean }[];
  onChange: (points: CrossoverPoint[]) => void;
  onToggleWayInvert?: (wayIndex: number) => void;
}

const SLOPES: CrossoverSlope[] = ['1st', 'BW2', 'LR2', 'LR4'];

export function CrossoverPointsEditor({ points, ways, onChange, onToggleWayInvert }: Props) {
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
      <div className="section-subtitle" style={{ marginBottom: 6 }}>
        Crossover Points
        <InfoTooltip variant="section" docKey="section:crossover-points" />
      </div>
      {points.map((pt, i) => {
        const lowName = ways[pt.low_way_index]?.name ?? `Way ${pt.low_way_index + 1}`;
        const highName = pt.high_way_index !== null
          ? ways[pt.high_way_index]?.name ?? `Way ${pt.high_way_index + 1}`
          : null;
        const highInverted = pt.high_way_index !== null ? !!ways[pt.high_way_index]?.inverted : false;

        const label = highName
          ? `${lowName} \u2194 ${highName}`
          : `${lowName} rolloff`;

        return (
          <div key={i} className="crossover-point-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <div className="crossover-point-label" style={{ marginBottom: 0 }}>{label}</div>
              {pt.high_way_index !== null && onToggleWayInvert && (
                <button
                  type="button"
                  className={`graf-btn graf-btn-sm ${highInverted ? 'graf-btn-primary' : 'graf-btn-outline'}`}
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    background: highInverted ? '#7c3aed' : undefined,
                    borderColor: highInverted ? '#6d28d9' : undefined,
                    color: highInverted ? '#ffffff' : undefined,
                  }}
                  title={`Toggle ${highName} polarity (180° phase flip) to perform a Reverse-Null phase alignment check at ${pt.freq_hz} Hz. When two drivers are in-phase at the crossover frequency, inverting one produces a deep cancellation notch (-20 to -40 dB).`}
                  onClick={() => onToggleWayInvert(pt.high_way_index!)}
                  data-testid={`reverse-null-btn-${i}`}
                >
                  {highInverted ? `⇄ Reverse Null ON (${highName} Inv)` : '⇄ Reverse Null Test'}
                </button>
              )}
            </div>
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
                title="Filter slope/order. LR4 (24 dB/oct) is the most common for hi-fi crossovers."
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
