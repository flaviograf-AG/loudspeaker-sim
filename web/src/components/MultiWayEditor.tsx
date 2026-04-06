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
        {way.passive_filters.map((pf, i) => {
          const updatePf = (updated: PassiveFilter) => {
            const filters = [...way.passive_filters];
            filters[i] = updated;
            updateWay(activeWay, { passive_filters: filters });
          };
          const removePf = () => updateWay(activeWay, { passive_filters: way.passive_filters.filter((_, j) => j !== i) });

          return (
            <div key={i} style={{ border: '1px solid var(--graf-warm-200)', borderRadius: 4, padding: '3px 6px', marginBottom: 3, fontSize: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{pf.type.replace('Series', 'Ser ').replace('Shunt', 'Shnt ').replace('Zobel', 'Zobel ').replace('NotchShunt', 'P.Notch').replace('NotchSeries', 'S.Notch')}</strong>
                <button className="graf-btn graf-btn-sm" style={{ padding: '0 4px', fontSize: 9 }} onClick={removePf}>✕</button>
              </div>
              {'ohms' in pf && !('farads' in pf) && !('henries' in pf) && (
                <div className="param-row"><span className="param-label">R</span>
                  <input type="number" className="graf-form-control" style={{ width: 70, fontSize: 11 }} value={parseFloat(pf.ohms.toFixed(2))} step={0.1}
                    onChange={(e) => updatePf({ ...pf, ohms: parseFloat(e.target.value) || pf.ohms } as PassiveFilter)} /><span className="param-unit">Ω</span></div>
              )}
              {'henries' in pf && (
                <div className="param-row"><span className="param-label">L</span>
                  <input type="number" className="graf-form-control" style={{ width: 70, fontSize: 11 }} value={parseFloat((pf.henries * 1e3).toFixed(3))} step={0.01}
                    onChange={(e) => updatePf({ ...pf, henries: (parseFloat(e.target.value) || 0) / 1e3 } as PassiveFilter)} /><span className="param-unit">mH</span></div>
              )}
              {'dcr_ohms' in pf && (
                <div className="param-row"><span className="param-label">DCR</span>
                  <input type="number" className="graf-form-control" style={{ width: 70, fontSize: 11 }} value={parseFloat(pf.dcr_ohms.toFixed(2))} step={0.1}
                    onChange={(e) => updatePf({ ...pf, dcr_ohms: parseFloat(e.target.value) || 0 } as PassiveFilter)} /><span className="param-unit">Ω</span></div>
              )}
              {'farads' in pf && (
                <div className="param-row"><span className="param-label">C</span>
                  <input type="number" className="graf-form-control" style={{ width: 70, fontSize: 11 }} value={parseFloat((pf.farads * 1e6).toFixed(2))} step={0.1}
                    onChange={(e) => updatePf({ ...pf, farads: (parseFloat(e.target.value) || 0) / 1e6 } as PassiveFilter)} /><span className="param-unit">µF</span></div>
              )}
              {'series_ohms' in pf && (
                <>
                  <div className="param-row"><span className="param-label">R ser</span>
                    <input type="number" className="graf-form-control" style={{ width: 70, fontSize: 11 }} value={parseFloat(pf.series_ohms.toFixed(2))} step={0.1}
                      onChange={(e) => updatePf({ ...pf, series_ohms: parseFloat(e.target.value) || 0 } as PassiveFilter)} /><span className="param-unit">Ω</span></div>
                  <div className="param-row"><span className="param-label">R shnt</span>
                    <input type="number" className="graf-form-control" style={{ width: 70, fontSize: 11 }} value={parseFloat(pf.shunt_ohms.toFixed(2))} step={0.1}
                      onChange={(e) => updatePf({ ...pf, shunt_ohms: parseFloat(e.target.value) || 0 } as PassiveFilter)} /><span className="param-unit">Ω</span></div>
                </>
              )}
            </div>
          );
        })}

        {/* Crossover frequency for wizard */}
        <div className="param-row" title="Crossover frequency used by the topology wizard presets below">
          <span className="param-label">Xover freq</span>
          <input type="number" className="graf-form-control" id={`xover-${activeWay}`}
            style={{ width: 70, fontSize: 11 }} defaultValue={3000} step={100} min={100} />
          <span className="param-unit">Hz</span>
        </div>

        {/* Passive wizard */}
        <select className="graf-form-control" style={{ width: '100%', fontSize: 12, marginTop: 4 }}
          value="" title="Add a passive crossover component or a standard topology"
          onChange={(e) => {
            const preset = e.target.value;
            if (!preset) return;
            const re = way.driver.re_ohm || 8;
            const le = way.driver.le_h || 0.5e-3;
            const xoverInput = document.getElementById(`xover-${activeWay}`) as HTMLInputElement;
            const xoverFreq = parseFloat(xoverInput?.value) || 3000;

            const wc = 2 * Math.PI * xoverFreq;
            let newFilters: PassiveFilter[] = [];

            // --- 1st order ---
            if (preset === '1st_lp') {
              newFilters = [{ type: 'SeriesL', henries: re / wc, dcr_ohms: 0.3 }];
            } else if (preset === '1st_hp') {
              newFilters = [{ type: 'SeriesC', farads: 1 / (wc * re) }];

            // --- 2nd order Butterworth ---
            } else if (preset === 'bw2_lp') {
              newFilters = [
                { type: 'SeriesL', henries: re * Math.SQRT2 / wc, dcr_ohms: 0.3 },
                { type: 'ShuntC', farads: Math.SQRT2 / (wc * re) },
              ];
            } else if (preset === 'bw2_hp') {
              newFilters = [
                { type: 'SeriesC', farads: 1 / (Math.SQRT2 * wc * re) },
                { type: 'ShuntL', henries: re / (Math.SQRT2 * wc), dcr_ohms: 0.3 },
              ];

            // --- 2nd order Linkwitz-Riley (= 2nd order BW with Q=0.5) ---
            } else if (preset === 'lr2_lp') {
              newFilters = [
                { type: 'SeriesL', henries: re * 2.0 / wc, dcr_ohms: 0.3 },
                { type: 'ShuntC', farads: 2.0 / (wc * re) },
              ];
            } else if (preset === 'lr2_hp') {
              newFilters = [
                { type: 'SeriesC', farads: 1 / (2.0 * wc * re) },
                { type: 'ShuntL', henries: re / (2.0 * wc), dcr_ohms: 0.3 },
              ];

            // --- 3rd order Butterworth ---
            } else if (preset === 'bw3_lp') {
              // L1-C2-L3: normalized values 1.0, 2.0, 1.0
              newFilters = [
                { type: 'SeriesL', henries: re / wc, dcr_ohms: 0.3 },
                { type: 'ShuntC', farads: 2.0 / (wc * re) },
                { type: 'SeriesL', henries: re / wc, dcr_ohms: 0.3 },
              ];
            } else if (preset === 'bw3_hp') {
              newFilters = [
                { type: 'SeriesC', farads: 1 / (wc * re) },
                { type: 'ShuntL', henries: re / (2.0 * wc), dcr_ohms: 0.3 },
                { type: 'SeriesC', farads: 1 / (wc * re) },
              ];

            // --- 4th order Linkwitz-Riley (two cascaded BW2) ---
            } else if (preset === 'lr4_lp') {
              const l = re * Math.SQRT2 / wc;
              const c = Math.SQRT2 / (wc * re);
              newFilters = [
                { type: 'SeriesL', henries: l, dcr_ohms: 0.3 },
                { type: 'ShuntC', farads: c },
                { type: 'SeriesL', henries: l, dcr_ohms: 0.3 },
                { type: 'ShuntC', farads: c },
              ];
            } else if (preset === 'lr4_hp') {
              const c = 1 / (Math.SQRT2 * wc * re);
              const l = re / (Math.SQRT2 * wc);
              newFilters = [
                { type: 'SeriesC', farads: c },
                { type: 'ShuntL', henries: l, dcr_ohms: 0.3 },
                { type: 'SeriesC', farads: c },
                { type: 'ShuntL', henries: l, dcr_ohms: 0.3 },
              ];

            // --- Utility networks ---
            } else if (preset === 'zobel') {
              newFilters = [{ type: 'ZobelShunt', ohms: re, farads: le / (re * re) }];
            } else if (preset === 'lpad_3db') {
              const ratio = Math.pow(10, 3 / 20);
              newFilters = [{ type: 'LPad', series_ohms: re * (ratio - 1) / ratio, shunt_ohms: re * ratio / (ratio - 1) }];
            } else if (preset === 'lpad_6db') {
              const ratio = Math.pow(10, 6 / 20);
              newFilters = [{ type: 'LPad', series_ohms: re * (ratio - 1) / ratio, shunt_ohms: re * ratio / (ratio - 1) }];
            } else if (preset === 'notch') {
              newFilters = [{ type: 'NotchShunt', ohms: 8, henries: 8 / wc, farads: 1 / (wc * 8) }];
            } else if (preset === 'series_notch') {
              newFilters = [{ type: 'NotchSeries', ohms: 1, henries: 1 / wc, farads: 1 / (wc * 1) }];

            // --- Individual components ---
            } else if (preset === 'series_r') { newFilters = [{ type: 'SeriesR', ohms: 2.2 }];
            } else if (preset === 'series_l') { newFilters = [{ type: 'SeriesL', henries: 0.5e-3, dcr_ohms: 0.3 }];
            } else if (preset === 'series_c') { newFilters = [{ type: 'SeriesC', farads: 10e-6 }];
            } else if (preset === 'shunt_r') { newFilters = [{ type: 'ShuntR', ohms: 10 }];
            } else if (preset === 'shunt_l') { newFilters = [{ type: 'ShuntL', henries: 1e-3, dcr_ohms: 0.3 }];
            } else if (preset === 'shunt_c') { newFilters = [{ type: 'ShuntC', farads: 4.7e-6 }];
            }

            if (newFilters.length > 0) {
              updateWay(activeWay, { passive_filters: [...way.passive_filters, ...newFilters] });
            }
            e.target.value = '';
          }}>
          <option value="" disabled>+ Add component / topology...</option>
          <optgroup label="1st Order (6 dB/oct)">
            <option value="1st_lp">1st-order LP (series L)</option>
            <option value="1st_hp">1st-order HP (series C)</option>
          </optgroup>
          <optgroup label="2nd Order (12 dB/oct)">
            <option value="bw2_lp">Butterworth LP (L + C)</option>
            <option value="bw2_hp">Butterworth HP (C + L)</option>
            <option value="lr2_lp">Linkwitz-Riley LP (L + C)</option>
            <option value="lr2_hp">Linkwitz-Riley HP (C + L)</option>
          </optgroup>
          <optgroup label="3rd Order (18 dB/oct)">
            <option value="bw3_lp">Butterworth LP (L + C + L)</option>
            <option value="bw3_hp">Butterworth HP (C + L + C)</option>
          </optgroup>
          <optgroup label="4th Order (24 dB/oct)">
            <option value="lr4_lp">Linkwitz-Riley LP (L+C+L+C)</option>
            <option value="lr4_hp">Linkwitz-Riley HP (C+L+C+L)</option>
          </optgroup>
          <optgroup label="Utility Networks">
            <option value="zobel">Zobel (impedance EQ for Le)</option>
            <option value="lpad_3db">L-Pad (-3 dB)</option>
            <option value="lpad_6db">L-Pad (-6 dB)</option>
            <option value="notch">Parallel Notch (suppress peak)</option>
            <option value="series_notch">Series Notch (block band)</option>
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
