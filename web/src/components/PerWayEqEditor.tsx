import type { ActiveFilter } from '../types';

interface Props {
  filters: ActiveFilter[];
  onChange: (filters: ActiveFilter[]) => void;
}

const EQ_PRESETS: { label: string; filter: ActiveFilter }[] = [
  { label: 'PEQ +3dB @1kHz', filter: { type: 'PEQ', freq_hz: 1000, q: 2, gain_db: 3 } },
  { label: 'PEQ -3dB @1kHz', filter: { type: 'PEQ', freq_hz: 1000, q: 2, gain_db: -3 } },
  { label: 'Low shelf +3dB 200Hz', filter: { type: 'ShelfLow', freq_hz: 200, gain_db: 3 } },
  { label: 'High shelf -3dB 5kHz', filter: { type: 'ShelfHigh', freq_hz: 5000, gain_db: -3 } },
  { label: 'All-pass 2kHz', filter: { type: 'AllPass1', freq_hz: 2000 } },
  { label: 'All-pass 2nd 2kHz', filter: { type: 'AllPass2', freq_hz: 2000, q: 0.707 } },
  { label: 'Gain +3dB', filter: { type: 'Gain', db: 3 } },
  { label: 'Gain -3dB', filter: { type: 'Gain', db: -3 } },
  { label: 'Invert polarity', filter: { type: 'Invert' } },
];

function filterLabel(f: ActiveFilter): string {
  switch (f.type) {
    case 'PEQ': return `PEQ ${f.freq_hz}Hz ${f.gain_db > 0 ? '+' : ''}${f.gain_db}dB Q${f.q}`;
    case 'AllPass1': return `AP1 ${f.freq_hz}Hz`;
    case 'AllPass2': return `AP2 ${f.freq_hz}Hz`;
    case 'ShelfLow': return `Lo shelf ${f.gain_db > 0 ? '+' : ''}${f.gain_db}dB ${f.freq_hz}Hz`;
    case 'ShelfHigh': return `Hi shelf ${f.gain_db > 0 ? '+' : ''}${f.gain_db}dB ${f.freq_hz}Hz`;
    case 'LinkwitzTransform': return `LT ${f.fo}\u2192${f.fp}Hz`;
    case 'Gain': return `${f.db > 0 ? '+' : ''}${f.db}dB`;
    case 'Invert': return 'Invert';
    default: return f.type;
  }
}

export function PerWayEqEditor({ filters, onChange }: Props) {
  return (
    <div>
      <div className="section-subtitle" style={{ marginBottom: 4, marginTop: 8 }}>Per-Way EQ</div>
      {filters.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--graf-warm-400)', marginBottom: 4 }}>
          No additional EQ filters
        </div>
      )}
      {filters.map((f, i) => (
        <div key={i} className="param-row" style={{ fontSize: 12, opacity: f.bypassed ? 0.4 : 1 }}>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, flex: 1 }}>
            <input type="checkbox" checked={!f.bypassed} title={f.bypassed ? 'Enable this filter' : 'Bypass this filter'}
              onChange={() => {
                const next = [...filters];
                next[i] = { ...f, bypassed: !f.bypassed } as ActiveFilter;
                onChange(next);
              }} />
            {filterLabel(f)}
          </label>
          {'freq_hz' in f && (
            <input type="number" className="graf-form-control" style={{ width: 70, fontSize: 11 }}
              title="Filter center/corner frequency (Hz)"
              value={f.freq_hz} step={100} min={10}
              onChange={(e) => {
                const next = [...filters];
                next[i] = { ...f, freq_hz: parseFloat(e.target.value) || f.freq_hz } as ActiveFilter;
                onChange(next);
              }} />
          )}
          {'gain_db' in f && (
            <input type="number" className="graf-form-control" style={{ width: 55, fontSize: 11 }}
              title="Gain in dB (positive = boost, negative = cut)"
              value={f.gain_db} step={0.5}
              onChange={(e) => {
                const next = [...filters];
                next[i] = { ...f, gain_db: parseFloat(e.target.value) || 0 } as ActiveFilter;
                onChange(next);
              }} />
          )}
          {'db' in f && (
            <input type="number" className="graf-form-control" style={{ width: 55, fontSize: 11 }}
              title="Gain in dB"
              value={f.db} step={0.5}
              onChange={(e) => {
                const next = [...filters];
                next[i] = { ...f, db: parseFloat(e.target.value) || 0 } as ActiveFilter;
                onChange(next);
              }} />
          )}
          <button className="graf-btn graf-btn-sm" style={{ padding: '0 4px', fontSize: 10 }}
            onClick={() => onChange(filters.filter((_, j) => j !== i))}>x</button>
        </div>
      ))}
      <select className="graf-form-control" style={{ width: '100%', fontSize: 12, marginTop: 4 }}
        title="Add a per-way EQ filter (PEQ, shelf, allpass, gain, polarity invert)"
        value="" onChange={(e) => {
          const idx = parseInt(e.target.value);
          if (!isNaN(idx)) {
            onChange([...filters, { ...EQ_PRESETS[idx].filter }]);
          }
          e.target.value = '';
        }}>
        <option value="" disabled>+ Add EQ filter...</option>
        {EQ_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
      </select>
    </div>
  );
}
