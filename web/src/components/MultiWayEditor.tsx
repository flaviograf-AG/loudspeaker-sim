import { useState } from 'react';
import type { WayInput, DriverParams, EnclosureConfig, ActiveFilter, PassiveFilter } from '../types';
import { DriverInputs } from './DriverInputs';
import { EnclosureInputs } from './EnclosureInputs';
import { PresetSelector } from './PresetSelector';
import { NumericInput } from './NumericInput';

interface Props {
  ways: WayInput[];
  onChange: (ways: WayInput[]) => void;
}

const DEFAULT_WOOFER: WayInput = {
  name: 'Woofer',
  driver: { fs_hz: 37, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5, vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3 },
  enclosure: { type: 'Sealed', volume_m3: 18e-3, ql: 7 },
  passive_filters: [],
  active_filters: [{ type: 'LR4LowPass', freq_hz: 2500 }],
  gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
};

const DEFAULT_TWEETER: WayInput = {
  name: 'Tweeter',
  driver: { fs_hz: 800, re_ohm: 5.5, le_h: 0.05e-3, qes: 0.5, qms: 2.0, vas_m3: 0.5e-3, sd_m2: 8e-4, xmax_m: 1e-3 },
  enclosure: { type: 'Sealed', volume_m3: 0.5e-3, ql: 7 },
  passive_filters: [],
  active_filters: [{ type: 'LR4HighPass', freq_hz: 2500 }],
  gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
};

const FILTER_PRESETS: { label: string; filter: ActiveFilter }[] = [
  { label: 'LR4 LP 2.5kHz', filter: { type: 'LR4LowPass', freq_hz: 2500 } },
  { label: 'LR4 HP 2.5kHz', filter: { type: 'LR4HighPass', freq_hz: 2500 } },
  { label: 'BW2 LP 3kHz', filter: { type: 'LowPass2', freq_hz: 3000, q: 0.707 } },
  { label: 'BW2 HP 3kHz', filter: { type: 'HighPass2', freq_hz: 3000, q: 0.707 } },
  { label: 'LP1 1kHz', filter: { type: 'LowPass1', freq_hz: 1000 } },
  { label: 'HP1 1kHz', filter: { type: 'HighPass1', freq_hz: 1000 } },
  { label: 'PEQ +3dB @1kHz', filter: { type: 'PEQ', freq_hz: 1000, q: 2, gain_db: 3 } },
  { label: 'PEQ -3dB @1kHz', filter: { type: 'PEQ', freq_hz: 1000, q: 2, gain_db: -3 } },
  { label: 'LR2 LP 2kHz', filter: { type: 'LR2LowPass', freq_hz: 2000 } },
  { label: 'LR2 HP 2kHz', filter: { type: 'LR2HighPass', freq_hz: 2000 } },
  { label: 'Low shelf +3dB 200Hz', filter: { type: 'ShelfLow', freq_hz: 200, gain_db: 3 } },
  { label: 'High shelf -3dB 5kHz', filter: { type: 'ShelfHigh', freq_hz: 5000, gain_db: -3 } },
  { label: 'All-pass 2kHz', filter: { type: 'AllPass1', freq_hz: 2000 } },
  { label: 'Invert polarity', filter: { type: 'Invert' } },
];

function fmtL(h: number): string { return h >= 1e-3 ? `${(h*1e3).toFixed(2)}mH` : `${(h*1e6).toFixed(0)}µH`; }
function fmtC(f: number): string { return f >= 1e-6 ? `${(f*1e6).toFixed(1)}µF` : `${(f*1e9).toFixed(0)}nF`; }
function fmtR(r: number): string { return `${r.toFixed(1)}Ω`; }

function passiveLabel(pf: PassiveFilter): string {
  switch (pf.type) {
    case 'SeriesR': return `Ser ${fmtR(pf.ohms)}`;
    case 'SeriesL': return `Ser ${fmtL(pf.henries)} (DCR ${fmtR(pf.dcr_ohms)})`;
    case 'SeriesC': return `Ser ${fmtC(pf.farads)}`;
    case 'ShuntR': return `Shnt ${fmtR(pf.ohms)}`;
    case 'ShuntL': return `Shnt ${fmtL(pf.henries)}`;
    case 'ShuntC': return `Shnt ${fmtC(pf.farads)}`;
    case 'ZobelShunt': return `Zobel ${fmtR(pf.ohms)}+${fmtC(pf.farads)}`;
    case 'LPad': return `L-Pad ${fmtR(pf.series_ohms)}/${fmtR(pf.shunt_ohms)}`;
    case 'NotchShunt': return `Notch ${fmtR(pf.ohms)} ${fmtL(pf.henries)} ${fmtC(pf.farads)}`;
    case 'NotchSeries': return `Ser.Notch ${fmtR(pf.ohms)} ${fmtL(pf.henries)} ${fmtC(pf.farads)}`;
  }
}

function filterLabel(f: ActiveFilter): string {
  switch (f.type) {
    case 'LR4LowPass': return `LR4 LP ${f.freq_hz}Hz`;
    case 'LR4HighPass': return `LR4 HP ${f.freq_hz}Hz`;
    case 'LowPass1': return `LP1 ${f.freq_hz}Hz`;
    case 'HighPass1': return `HP1 ${f.freq_hz}Hz`;
    case 'LowPass2': return `LP2 ${f.freq_hz}Hz Q${f.q}`;
    case 'HighPass2': return `HP2 ${f.freq_hz}Hz Q${f.q}`;
    case 'PEQ': return `PEQ ${f.freq_hz}Hz ${f.gain_db>0?'+':''}${f.gain_db}dB`;
    case 'AllPass1': return `AP1 ${f.freq_hz}Hz`;
    case 'AllPass2': return `AP2 ${f.freq_hz}Hz`;
    case 'LR2LowPass': return `LR2 LP ${f.freq_hz}Hz`;
    case 'LR2HighPass': return `LR2 HP ${f.freq_hz}Hz`;
    case 'ShelfLow': return `Lo shelf ${f.gain_db>0?'+':''}${f.gain_db}dB ${f.freq_hz}Hz`;
    case 'ShelfHigh': return `Hi shelf ${f.gain_db>0?'+':''}${f.gain_db}dB ${f.freq_hz}Hz`;
    case 'LinkwitzTransform': return `LT ${f.fo}→${f.fp}Hz`;
    case 'Gain': return `${f.db>0?'+':''}${f.db}dB`;
    case 'Invert': return 'Invert';
  }
}

export function MultiWayEditor({ ways, onChange }: Props) {
  const [activeWay, setActiveWay] = useState(0);

  const updateWay = (idx: number, updates: Partial<WayInput>) => {
    const newWays = [...ways];
    newWays[idx] = { ...newWays[idx], ...updates };
    onChange(newWays);
  };

  const addWay = () => {
    const newWay = ways.length === 0 ? { ...DEFAULT_WOOFER }
      : ways.length === 1 ? { ...DEFAULT_TWEETER }
      : { ...DEFAULT_WOOFER, name: `Way ${ways.length + 1}`, active_filters: [] };
    onChange([...ways, newWay]);
    setActiveWay(ways.length);
  };

  const removeWay = (idx: number) => {
    if (ways.length <= 1) return;
    const newWays = ways.filter((_, i) => i !== idx);
    onChange(newWays);
    if (activeWay >= newWays.length) setActiveWay(newWays.length - 1);
  };

  const way = ways[activeWay];
  if (!way) return <button className="graf-btn graf-btn-primary" onClick={addWay}>+ Add Way</button>;

  const qts = (way.driver.qes * way.driver.qms) / (way.driver.qes + way.driver.qms);

  return (
    <>
      {/* Way tabs */}
      <div className="btn-row" style={{ marginBottom: 8 }}>
        {ways.map((w, i) => (
          <button key={i}
            className={`graf-btn graf-btn-sm ${i === activeWay ? 'graf-btn-primary' : 'graf-btn-outline'}`}
            style={{ position: 'relative' }}
            onClick={() => setActiveWay(i)}
            title={`${w.name}${w.enabled ? '' : ' (disabled)'}`}
          >
            {w.name}{!w.enabled && ' ⊘'}
          </button>
        ))}
        <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={addWay} title="Add a new way">+</button>
      </div>

      {/* Way controls */}
      <div className="section-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <input type="text" className="graf-form-control" style={{ width: 100, fontSize: 13, fontWeight: 600 }}
            value={way.name} onChange={(e) => updateWay(activeWay, { name: e.target.value })} />
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <label title="Enable/disable this way" style={{ fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={way.enabled}
                onChange={(e) => updateWay(activeWay, { enabled: e.target.checked })} /> On
            </label>
            <label title="Invert polarity (180° phase flip)" style={{ fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={way.inverted}
                onChange={(e) => updateWay(activeWay, { inverted: e.target.checked })} /> Inv
            </label>
            {ways.length > 1 && (
              <button className="graf-btn graf-btn-sm" style={{ padding: '0 6px', color: 'var(--graf-danger)' }}
                onClick={() => removeWay(activeWay)} title="Remove this way">✕</button>
            )}
          </div>
        </div>

        <NumericInput label="Gain" value={way.gain_db} step={0.5} min={-20} max={20} unit="dB"
          tooltip="Per-way level adjustment. Use to match sensitivity between drivers."
          onChange={(v) => updateWay(activeWay, { gain_db: v })} />
        <NumericInput label="Delay" value={way.delay_s * 1e6} step={10} min={0} unit="µs"
          tooltip="Per-way time delay for alignment. 29 µs ≈ 1 cm acoustic path difference."
          onChange={(v) => updateWay(activeWay, { delay_s: v / 1e6 })} />
        <NumericInput label="Z offset" value={way.z_offset_m * 100} step={0.5} min={-20} max={20} unit="cm"
          tooltip="Physical depth offset from reference plane. Positive = recessed. Adds acoustic path delay."
          onChange={(v) => updateWay(activeWay, { z_offset_m: v / 100 })} />
      </div>

      {/* Active filters */}
      <div className="section-card">
        <div className="section-title">Active Filters</div>
        {way.active_filters.map((f, i) => (
          <div key={i} className="param-row" style={{ fontSize: 12 }}>
            <span style={{ flex: 1 }}>{filterLabel(f)}</span>
            {'freq_hz' in f && (
              <input type="number" className="graf-form-control" style={{ width: 70, fontSize: 11 }}
                value={f.freq_hz} step={100} min={10}
                onChange={(e) => {
                  const filters = [...way.active_filters];
                  filters[i] = { ...f, freq_hz: parseFloat(e.target.value) || f.freq_hz } as ActiveFilter;
                  updateWay(activeWay, { active_filters: filters });
                }} />
            )}
            <button className="graf-btn graf-btn-sm" style={{ padding: '0 4px', fontSize: 10 }}
              onClick={() => {
                const filters = way.active_filters.filter((_, j) => j !== i);
                updateWay(activeWay, { active_filters: filters });
              }}>✕</button>
          </div>
        ))}
        <select className="graf-form-control" style={{ width: '100%', fontSize: 12, marginTop: 4 }}
          value="" onChange={(e) => {
            const idx = parseInt(e.target.value);
            if (!isNaN(idx)) {
              updateWay(activeWay, { active_filters: [...way.active_filters, { ...FILTER_PRESETS[idx].filter }] });
            }
            e.target.value = '';
          }}>
          <option value="" disabled>+ Add filter...</option>
          {FILTER_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
        </select>
      </div>

      {/* Passive crossover */}
      <div className="section-card">
        <div className="section-title">Passive Crossover</div>
        {way.passive_filters.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--graf-warm-400)', marginBottom: 4 }}>
            No passive components. Use the wizard or add manually.
          </div>
        )}
        {way.passive_filters.map((pf, i) => (
          <div key={i} className="param-row" style={{ fontSize: 12 }}>
            <span style={{ flex: 1 }}>{passiveLabel(pf)}</span>
            <button className="graf-btn graf-btn-sm" style={{ padding: '0 4px', fontSize: 10 }}
              onClick={() => {
                const filters = way.passive_filters.filter((_, j) => j !== i);
                updateWay(activeWay, { passive_filters: filters });
              }}>✕</button>
          </div>
        ))}

        {/* Passive wizard */}
        <select className="graf-form-control" style={{ width: '100%', fontSize: 12, marginTop: 4 }}
          value="" title="Add a passive crossover component or a standard topology"
          onChange={(e) => {
            const preset = e.target.value;
            if (!preset) return;
            const re = way.driver.re_ohm || 8;
            const le = way.driver.le_h || 0.5e-3;

            let newFilters: PassiveFilter[] = [];
            if (preset === 'bw2_lp') {
              // 2nd-order Butterworth LP: series L + shunt C
              const wc = 2 * Math.PI * 3000;
              const l = re * Math.SQRT2 / wc;
              const c = Math.SQRT2 / (wc * re);
              newFilters = [
                { type: 'SeriesL', henries: l, dcr_ohms: 0.3 },
                { type: 'ShuntC', farads: c },
              ];
            } else if (preset === 'bw2_hp') {
              const wc = 2 * Math.PI * 3000;
              const c = 1 / (Math.SQRT2 * wc * re);
              const l = re / (Math.SQRT2 * wc);
              newFilters = [
                { type: 'SeriesC', farads: c },
                { type: 'ShuntL', henries: l, dcr_ohms: 0.3 },
              ];
            } else if (preset === 'zobel') {
              newFilters = [{ type: 'ZobelShunt', ohms: re, farads: le / (re * re) }];
            } else if (preset === 'lpad_3db') {
              const ratio = Math.pow(10, 3 / 20);
              newFilters = [{
                type: 'LPad',
                series_ohms: re * (ratio - 1) / ratio,
                shunt_ohms: re * ratio / (ratio - 1),
              }];
            } else if (preset === 'notch') {
              const fc = 1000;
              const wc = 2 * Math.PI * fc;
              newFilters = [{
                type: 'NotchShunt',
                ohms: 8, henries: 8 / wc, farads: 1 / (wc * 8),
              }];
            } else if (preset === 'series_r') {
              newFilters = [{ type: 'SeriesR', ohms: 2.2 }];
            } else if (preset === 'series_l') {
              newFilters = [{ type: 'SeriesL', henries: 0.5e-3, dcr_ohms: 0.3 }];
            } else if (preset === 'series_c') {
              newFilters = [{ type: 'SeriesC', farads: 10e-6 }];
            } else if (preset === 'shunt_r') {
              newFilters = [{ type: 'ShuntR', ohms: 10 }];
            } else if (preset === 'shunt_l') {
              newFilters = [{ type: 'ShuntL', henries: 1e-3, dcr_ohms: 0.3 }];
            } else if (preset === 'shunt_c') {
              newFilters = [{ type: 'ShuntC', farads: 4.7e-6 }];
            }

            if (newFilters.length > 0) {
              updateWay(activeWay, { passive_filters: [...way.passive_filters, ...newFilters] });
            }
            e.target.value = '';
          }}>
          <option value="" disabled>+ Add component / topology...</option>
          <optgroup label="Standard Topologies">
            <option value="bw2_lp">BW2 Low-Pass (L + C, 3kHz)</option>
            <option value="bw2_hp">BW2 High-Pass (C + L, 3kHz)</option>
            <option value="zobel">Zobel (impedance EQ)</option>
            <option value="lpad_3db">L-Pad (-3dB attenuation)</option>
            <option value="notch">Parallel Notch (1kHz)</option>
          </optgroup>
          <optgroup label="Individual Components">
            <option value="series_r">Series Resistor</option>
            <option value="series_l">Series Inductor</option>
            <option value="series_c">Series Capacitor</option>
            <option value="shunt_r">Shunt Resistor</option>
            <option value="shunt_l">Shunt Inductor</option>
            <option value="shunt_c">Shunt Capacitor</option>
          </optgroup>
        </select>
      </div>

      {/* Driver + Enclosure for this way */}
      <PresetSelector onSelect={(d: DriverParams) => updateWay(activeWay, { driver: d })} />
      <DriverInputs params={way.driver} onChange={(d: DriverParams) => updateWay(activeWay, { driver: d })} />
      <EnclosureInputs
        config={way.enclosure}
        driverVas={way.driver.vas_m3}
        driverFs={way.driver.fs_hz}
        driverQts={qts}
        onChange={(enc: EnclosureConfig) => updateWay(activeWay, { enclosure: enc })}
      />
    </>
  );
}
