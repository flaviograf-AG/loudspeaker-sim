import type { ActiveFilter, DriverParams, EnclosureConfig } from '../types';
import { InfoTooltip } from './InfoTooltip';

interface Props {
  filters: ActiveFilter[];
  onChange: (filters: ActiveFilter[]) => void;
  driver?: DriverParams;
  enclosure?: EnclosureConfig;
}

const EQ_PRESETS: { label: string; filter: ActiveFilter }[] = [
  { label: 'PEQ +3dB @1kHz', filter: { type: 'PEQ', freq_hz: 1000, q: 2, gain_db: 3 } },
  { label: 'PEQ -3dB @1kHz', filter: { type: 'PEQ', freq_hz: 1000, q: 2, gain_db: -3 } },
  { label: 'Low shelf +3dB 200Hz', filter: { type: 'ShelfLow', freq_hz: 200, gain_db: 3 } },
  { label: 'High shelf -3dB 5kHz', filter: { type: 'ShelfHigh', freq_hz: 5000, gain_db: -3 } },
  { label: 'Linkwitz Transform (Sealed Box Extension)', filter: { type: 'LinkwitzTransform', fo: 55, qo: 0.9, fp: 28, qp: 0.707 } },
  { label: 'All-pass 2kHz', filter: { type: 'AllPass1', freq_hz: 2000 } },
  { label: 'All-pass 2nd 2kHz', filter: { type: 'AllPass2', freq_hz: 2000, q: 0.707 } },
  { label: 'Gain +3dB', filter: { type: 'Gain', db: 3 } },
  { label: 'Gain -3dB', filter: { type: 'Gain', db: -3 } },
  { label: 'Invert polarity', filter: { type: 'Invert' } },
];

function computeSealedBoxFoQo(driver?: DriverParams, enclosure?: EnclosureConfig): { fo: number; qo: number } | null {
  if (!driver || !enclosure || enclosure.type !== 'Sealed') return null;
  const qts = (driver.qes * driver.qms) / (driver.qes + driver.qms);
  const alpha = driver.vas_m3 / Math.max(1e-4, enclosure.volume_m3);
  const fc = driver.fs_hz * Math.sqrt(1 + alpha);
  const qtcLossless = qts * Math.sqrt(1 + alpha);
  const qtc = 1 / (1 / qtcLossless + 1 / Math.max(1, enclosure.ql));
  return {
    fo: Number(fc.toFixed(1)),
    qo: Number(qtc.toFixed(3)),
  };
}

function filterLabel(f: ActiveFilter): string {
  switch (f.type) {
    case 'PEQ': return `PEQ ${f.freq_hz}Hz ${f.gain_db > 0 ? '+' : ''}${f.gain_db}dB Q${f.q}`;
    case 'AllPass1': return `AP1 ${f.freq_hz}Hz`;
    case 'AllPass2': return `AP2 ${f.freq_hz}Hz Q${f.q}`;
    case 'ShelfLow': return `Lo shelf ${f.gain_db > 0 ? '+' : ''}${f.gain_db}dB ${f.freq_hz}Hz`;
    case 'ShelfHigh': return `Hi shelf ${f.gain_db > 0 ? '+' : ''}${f.gain_db}dB ${f.freq_hz}Hz`;
    case 'LinkwitzTransform': return `LT ${f.fo}\u2192${f.fp}Hz (Q ${f.qo}\u2192${f.qp})`;
    case 'Gain': return `${f.db > 0 ? '+' : ''}${f.db}dB`;
    case 'Invert': return 'Invert';
    default: return f.type;
  }
}

export function PerWayEqEditor({ filters, onChange, driver, enclosure }: Props) {
  const sealedBoxParams = computeSealedBoxFoQo(driver, enclosure);

  return (
    <div>
      <div className="section-subtitle" style={{ marginBottom: 4, marginTop: 8 }}>
        Per-Way EQ
        <InfoTooltip variant="section" docKey="section:parametric-eq" />
      </div>
      {filters.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--graf-warm-400)', marginBottom: 4 }}>
          No additional EQ filters
        </div>
      )}
      {filters.map((f, i) => (
        <div key={i} style={{ marginBottom: 4 }}>
          <div className="param-row" style={{ fontSize: 12, opacity: f.bypassed ? 0.4 : 1 }}>
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
              <input type="number" className="graf-form-control" style={{ width: 66, fontSize: 11 }}
                title="Filter center/corner frequency (Hz)"
                value={f.freq_hz} step={100} min={10}
                onChange={(e) => {
                  const next = [...filters];
                  next[i] = { ...f, freq_hz: parseFloat(e.target.value) || f.freq_hz } as ActiveFilter;
                  onChange(next);
                }} />
            )}
            {'q' in f && (
              <input type="number" className="graf-form-control" style={{ width: 52, fontSize: 11 }}
                title="Filter Q factor (bandwidth sharpness: 0.707 = wide, 4+ = narrow notch/peak)"
                value={f.q} step={0.1} min={0.1} max={30}
                onChange={(e) => {
                  const next = [...filters];
                  next[i] = { ...f, q: Math.max(0.1, parseFloat(e.target.value) || f.q) } as ActiveFilter;
                  onChange(next);
                }} />
            )}
            {'gain_db' in f && (
              <input type="number" className="graf-form-control" style={{ width: 52, fontSize: 11 }}
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
          {f.type === 'LinkwitzTransform' && (
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 4,
                padding: '4px 6px',
                marginTop: 2,
                fontSize: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <span style={{ color: '#475569', fontWeight: 600 }}>Linkwitz Transform Poles (f₀, Q₀ → f_p, Q_p)</span>
                {sealedBoxParams && (
                  <button
                    type="button"
                    className="graf-btn graf-btn-sm graf-btn-outline"
                    style={{ fontSize: 9, padding: '0 5px' }}
                    title={`Sync f₀=${sealedBoxParams.fo}Hz and Q₀=${sealedBoxParams.qo} from current Sealed Box Fc & Qtc`}
                    onClick={() => {
                      const next = [...filters];
                      next[i] = { ...f, fo: sealedBoxParams.fo, qo: sealedBoxParams.qo };
                      onChange(next);
                    }}
                  >
                    Sync f₀/Q₀ ({sealedBoxParams.fo}Hz / {sealedBoxParams.qo})
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ color: '#64748b' }}>f₀ (Hz)</span>
                  <input
                    type="number"
                    className="graf-form-control"
                    style={{ width: '100%', fontSize: 10, padding: '1px 3px' }}
                    value={f.fo}
                    step={1}
                    min={15}
                    onChange={(e) => {
                      const next = [...filters];
                      next[i] = { ...f, fo: parseFloat(e.target.value) || f.fo };
                      onChange(next);
                    }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ color: '#64748b' }}>Q₀</span>
                  <input
                    type="number"
                    className="graf-form-control"
                    style={{ width: '100%', fontSize: 10, padding: '1px 3px' }}
                    value={f.qo}
                    step={0.05}
                    min={0.2}
                    onChange={(e) => {
                      const next = [...filters];
                      next[i] = { ...f, qo: parseFloat(e.target.value) || f.qo };
                      onChange(next);
                    }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ color: '#64748b' }}>f_p (Hz)</span>
                  <input
                    type="number"
                    className="graf-form-control"
                    style={{ width: '100%', fontSize: 10, padding: '1px 3px' }}
                    value={f.fp}
                    step={1}
                    min={10}
                    onChange={(e) => {
                      const next = [...filters];
                      next[i] = { ...f, fp: parseFloat(e.target.value) || f.fp };
                      onChange(next);
                    }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ color: '#64748b' }}>Q_p</span>
                  <input
                    type="number"
                    className="graf-form-control"
                    style={{ width: '100%', fontSize: 10, padding: '1px 3px' }}
                    value={f.qp}
                    step={0.05}
                    min={0.3}
                    onChange={(e) => {
                      const next = [...filters];
                      next[i] = { ...f, qp: parseFloat(e.target.value) || f.qp };
                      onChange(next);
                    }}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      ))}
      <select className="graf-form-control" style={{ width: '100%', fontSize: 12, marginTop: 4 }}
        title="Add a per-way EQ filter (PEQ, shelf, Linkwitz Transform, allpass, gain, polarity invert)"
        value="" onChange={(e) => {
          const idx = parseInt(e.target.value);
          if (!isNaN(idx)) {
            const preset = { ...EQ_PRESETS[idx].filter };
            if (preset.type === 'LinkwitzTransform' && sealedBoxParams) {
              preset.fo = sealedBoxParams.fo;
              preset.qo = sealedBoxParams.qo;
            }
            onChange([...filters, preset]);
          }
          e.target.value = '';
        }}>
        <option value="" disabled>+ Add EQ filter...</option>
        {EQ_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
      </select>
    </div>
  );
}
