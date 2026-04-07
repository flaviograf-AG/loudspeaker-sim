import { useState, useEffect } from 'react';
import { NumericInput } from './NumericInput';
import type { PassiveFilter } from '../types';

interface PassiveWizardProps {
  crossoverFreq: number;
  driverRe: number;
  driverLe: number;
  passiveFilters: PassiveFilter[];
  onApply: (filters: PassiveFilter[]) => void;
}

export function PassiveWizard({ crossoverFreq, driverRe, driverLe, passiveFilters, onApply }: PassiveWizardProps) {
  const [xoverFreq, setXoverFreq] = useState(crossoverFreq);

  // Sync from parent when crossover freq changes externally
  useEffect(() => {
    setXoverFreq(crossoverFreq);
  }, [crossoverFreq]);
  const re = driverRe || 8;
  const le = driverLe || 0.5e-3;

  const addPreset = (preset: string) => {
    const wc = 2 * Math.PI * xoverFreq;
    let newFilters: PassiveFilter[] = [];

    // 1st order
    if (preset === '1st_lp') newFilters = [{ type: 'SeriesL', henries: re / wc, dcr_ohms: 0.3 }];
    else if (preset === '1st_hp') newFilters = [{ type: 'SeriesC', farads: 1 / (wc * re) }];
    // 2nd order Butterworth
    else if (preset === 'bw2_lp') newFilters = [{ type: 'SeriesL', henries: re * Math.SQRT2 / wc, dcr_ohms: 0.3 }, { type: 'ShuntC', farads: Math.SQRT2 / (wc * re) }];
    else if (preset === 'bw2_hp') newFilters = [{ type: 'SeriesC', farads: 1 / (Math.SQRT2 * wc * re) }, { type: 'ShuntL', henries: re / (Math.SQRT2 * wc), dcr_ohms: 0.3 }];
    // 2nd order Linkwitz-Riley
    else if (preset === 'lr2_lp') newFilters = [{ type: 'SeriesL', henries: re * 2.0 / wc, dcr_ohms: 0.3 }, { type: 'ShuntC', farads: 2.0 / (wc * re) }];
    else if (preset === 'lr2_hp') newFilters = [{ type: 'SeriesC', farads: 1 / (2.0 * wc * re) }, { type: 'ShuntL', henries: re / (2.0 * wc), dcr_ohms: 0.3 }];
    // 4th order Linkwitz-Riley
    else if (preset === 'lr4_lp') { const l = re * Math.SQRT2 / wc; const c = Math.SQRT2 / (wc * re); newFilters = [{ type: 'SeriesL', henries: l, dcr_ohms: 0.3 }, { type: 'ShuntC', farads: c }, { type: 'SeriesL', henries: l, dcr_ohms: 0.3 }, { type: 'ShuntC', farads: c }]; }
    else if (preset === 'lr4_hp') { const c = 1 / (Math.SQRT2 * wc * re); const l = re / (Math.SQRT2 * wc); newFilters = [{ type: 'SeriesC', farads: c }, { type: 'ShuntL', henries: l, dcr_ohms: 0.3 }, { type: 'SeriesC', farads: c }, { type: 'ShuntL', henries: l, dcr_ohms: 0.3 }]; }
    // Utility
    else if (preset === 'zobel') newFilters = [{ type: 'ZobelShunt', ohms: re, farads: le / (re * re) }];
    else if (preset === 'lpad_3db') { const ratio = Math.pow(10, 3 / 20); newFilters = [{ type: 'LPad', series_ohms: re * (ratio - 1) / ratio, shunt_ohms: re * ratio / (ratio - 1) }]; }
    else if (preset === 'lpad_6db') { const ratio = Math.pow(10, 6 / 20); newFilters = [{ type: 'LPad', series_ohms: re * (ratio - 1) / ratio, shunt_ohms: re * ratio / (ratio - 1) }]; }
    else if (preset === 'notch') newFilters = [{ type: 'NotchShunt', ohms: 8, henries: 8 / wc, farads: 1 / (wc * 8) }];
    else if (preset === 'series_notch') newFilters = [{ type: 'NotchSeries', ohms: 1, henries: 1 / wc, farads: 1 / (wc * 1) }];
    // Individual components
    else if (preset === 'series_r') newFilters = [{ type: 'SeriesR', ohms: 2.2 }];
    else if (preset === 'series_l') newFilters = [{ type: 'SeriesL', henries: 0.5e-3, dcr_ohms: 0.3 }];
    else if (preset === 'series_c') newFilters = [{ type: 'SeriesC', farads: 10e-6 }];
    else if (preset === 'shunt_r') newFilters = [{ type: 'ShuntR', ohms: 10 }];
    else if (preset === 'shunt_l') newFilters = [{ type: 'ShuntL', henries: 1e-3, dcr_ohms: 0.3 }];
    else if (preset === 'shunt_c') newFilters = [{ type: 'ShuntC', farads: 4.7e-6 }];

    if (newFilters.length > 0) {
      onApply([...passiveFilters, ...newFilters]);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div className="section-subtitle" style={{ marginBottom: 4 }}>Passive Crossover</div>

      {passiveFilters.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--graf-warm-400)', marginBottom: 4 }}>
          No passive components.
        </div>
      )}

      {/* Editable passive filter list */}
      {passiveFilters.map((pf, i) => {
        const updatePf = (updated: PassiveFilter) => {
          const filters = [...passiveFilters];
          filters[i] = updated;
          onApply(filters);
        };
        const removePf = () => onApply(passiveFilters.filter((_, j) => j !== i));

        return (
          <div key={i} style={{ border: '1px solid var(--graf-warm-200)', borderRadius: 4, padding: '3px 6px', marginBottom: 3, fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{pf.type.replace('Series', 'Ser ').replace('Shunt', 'Shnt ').replace('Zobel', 'Zobel ').replace('NotchShunt', 'P.Notch').replace('NotchSeries', 'S.Notch')}</strong>
              <button className="graf-btn graf-btn-sm" style={{ padding: '0 4px', fontSize: 9 }} onClick={removePf}>x</button>
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

      {/* Crossover frequency input */}
      <NumericInput label="Xover freq" value={xoverFreq} step={100} min={100} unit="Hz"
        tooltip="Crossover frequency used by the topology wizard presets below"
        onChange={setXoverFreq} />

      {/* Preset selector */}
      <select className="graf-form-control" style={{ width: '100%', fontSize: 12, marginTop: 4 }}
        value="" title={`Add passive component (using ${xoverFreq} Hz)`}
        onChange={(e) => { addPreset(e.target.value); e.target.value = ''; }}>
        <option value="" disabled>+ Add component / topology...</option>
        <optgroup label="1st Order (6 dB/oct)"><option value="1st_lp">1st-order LP</option><option value="1st_hp">1st-order HP</option></optgroup>
        <optgroup label="2nd Order (12 dB/oct)"><option value="bw2_lp">Butterworth LP</option><option value="bw2_hp">Butterworth HP</option><option value="lr2_lp">LR2 LP</option><option value="lr2_hp">LR2 HP</option></optgroup>
        <optgroup label="4th Order (24 dB/oct)"><option value="lr4_lp">LR4 LP</option><option value="lr4_hp">LR4 HP</option></optgroup>
        <optgroup label="Utility"><option value="zobel">Zobel</option><option value="lpad_3db">L-Pad -3dB</option><option value="lpad_6db">L-Pad -6dB</option><option value="notch">Notch</option><option value="series_notch">Series Notch</option></optgroup>
        <optgroup label="Components"><option value="series_r">Series R</option><option value="series_l">Series L</option><option value="series_c">Series C</option><option value="shunt_r">Shunt R</option><option value="shunt_l">Shunt L</option><option value="shunt_c">Shunt C</option></optgroup>
      </select>
    </div>
  );
}
