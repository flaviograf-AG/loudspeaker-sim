import { useState, useEffect } from 'react';
import { NumericInput } from './NumericInput';
import { deriveDriverMetrics, computeBaffleStepParams } from '../compute';
import type { PassiveFilter, DriverParams } from '../types';

const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const E24 = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
  3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1,
];

function snapToSeries(val: number, series: number[]): number {
  if (val <= 0) return val;
  const decade = Math.pow(10, Math.floor(Math.log10(val)));
  const mantissa = val / decade;
  let best = series[0];
  let bestDiff = Math.abs(mantissa / best - 1);
  for (const s of series) {
    const diff = Math.abs(mantissa / s - 1);
    if (diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  if (Math.abs(mantissa / 10 - 1) < bestDiff) {
    return 10 * decade;
  }
  return Number((best * decade).toPrecision(4));
}

interface PassiveWizardProps {
  crossoverFreq: number;
  driverRe: number;
  driverLe: number;
  driver?: DriverParams;
  baffleWidthCm?: number;
  referenceSensitivityDb?: number;
  passiveFilters: PassiveFilter[];
  onApply: (filters: PassiveFilter[]) => void;
}

export function PassiveWizard({
  crossoverFreq,
  driverRe,
  driverLe,
  driver,
  baffleWidthCm = 22,
  referenceSensitivityDb,
  passiveFilters,
  onApply,
}: PassiveWizardProps) {
  const [xoverFreq, setXoverFreq] = useState(crossoverFreq);

  // Sync from parent when crossover freq changes externally
  useEffect(() => {
    setXoverFreq(crossoverFreq);
  }, [crossoverFreq]);

  const re = driverRe || 8;
  const le = driverLe || 0.5e-3;

  const fullDriver: DriverParams = driver ?? {
    fs_hz: 45,
    re_ohm: re,
    le_h: le,
    qes: 0.45,
    qms: 3.5,
    vas_m3: 15e-3,
    sd_m2: 130e-4,
    xmax_m: 5e-3,
  };

  const metrics = deriveDriverMetrics(fullDriver);
  const bsc = computeBaffleStepParams(baffleWidthCm, re, 4.5);
  const sensDiffDb =
    referenceSensitivityDb !== undefined
      ? Math.max(0, Number((metrics.sensitivity_2v83_db - referenceSensitivityDb).toFixed(1)))
      : 3.0;

  const addPreset = (preset: string) => {
    const wc = 2 * Math.PI * xoverFreq;
    let newFilters: PassiveFilter[] = [];

    // 1st order
    if (preset === '1st_lp') newFilters = [{ type: 'SeriesL', henries: re / wc, dcr_ohms: 0.2 }];
    else if (preset === '1st_hp') newFilters = [{ type: 'SeriesC', farads: 1 / (wc * re) }];
    // 2nd order Butterworth
    else if (preset === 'bw2_lp')
      newFilters = [
        { type: 'SeriesL', henries: (re * Math.SQRT2) / wc, dcr_ohms: 0.25 },
        { type: 'ShuntC', farads: Math.SQRT2 / (wc * re) },
      ];
    else if (preset === 'bw2_hp')
      newFilters = [
        { type: 'SeriesC', farads: 1 / (Math.SQRT2 * wc * re) },
        { type: 'ShuntL', henries: re / (Math.SQRT2 * wc), dcr_ohms: 0.25 },
      ];
    // 2nd order Linkwitz-Riley
    else if (preset === 'lr2_lp')
      newFilters = [
        { type: 'SeriesL', henries: (re * 2.0) / wc, dcr_ohms: 0.25 },
        { type: 'ShuntC', farads: 1 / (2.0 * wc * re) },
      ];
    else if (preset === 'lr2_hp')
      newFilters = [
        { type: 'SeriesC', farads: 1 / (2.0 * wc * re) },
        { type: 'ShuntL', henries: (re * 2.0) / wc, dcr_ohms: 0.25 },
      ];
    // 4th order Linkwitz-Riley
    else if (preset === 'lr4_lp') {
      const l = (re * Math.SQRT2) / wc;
      const c = Math.SQRT2 / (wc * re);
      newFilters = [
        { type: 'SeriesL', henries: l, dcr_ohms: 0.2 },
        { type: 'ShuntC', farads: c },
        { type: 'SeriesL', henries: l * 0.5, dcr_ohms: 0.15 },
        { type: 'ShuntC', farads: c * 0.25 },
      ];
    } else if (preset === 'lr4_hp') {
      const c = 1 / (Math.SQRT2 * wc * re);
      const l = re / (Math.SQRT2 * wc);
      newFilters = [
        { type: 'SeriesC', farads: c },
        { type: 'ShuntL', henries: l, dcr_ohms: 0.2 },
        { type: 'SeriesC', farads: c * 2 },
        { type: 'ShuntL', henries: l * 2, dcr_ohms: 0.25 },
      ];
    }
    // Shared-variable compensation calculators
    else if (preset === 'zobel') {
      newFilters = [
        {
          type: 'ZobelShunt',
          ohms: metrics.zobel.r_ohm,
          farads: metrics.zobel.c_farads,
        },
      ];
    } else if (preset === 'fs_notch') {
      newFilters = [
        {
          type: 'NotchShunt',
          ohms: metrics.resonance_notch.r_ohm,
          henries: metrics.resonance_notch.l_henries,
          farads: metrics.resonance_notch.c_farads,
        },
      ];
    } else if (preset === 'bsc_rl') {
      // Baffle step compensation: series L shunted by R, or modeled in ladder
      newFilters = [
        {
          type: 'SeriesL',
          henries: bsc.l_bsc_henries,
          dcr_ohms: 0.2,
        },
      ];
    } else if (preset === 'auto_lpad') {
      const atten = Math.max(1.5, sensDiffDb || 3.0);
      const ratio = Math.pow(10, atten / 20);
      newFilters = [
        {
          type: 'LPad',
          series_ohms: Number(((re * (ratio - 1)) / ratio).toFixed(2)),
          shunt_ohms: Number(((re * ratio) / (ratio - 1)).toFixed(2)),
        },
      ];
    } else if (preset === 'lpad_3db') {
      const ratio = Math.pow(10, 3 / 20);
      newFilters = [{ type: 'LPad', series_ohms: (re * (ratio - 1)) / ratio, shunt_ohms: (re * ratio) / (ratio - 1) }];
    } else if (preset === 'lpad_6db') {
      const ratio = Math.pow(10, 6 / 20);
      newFilters = [{ type: 'LPad', series_ohms: (re * (ratio - 1)) / ratio, shunt_ohms: (re * ratio) / (ratio - 1) }];
    } else if (preset === 'notch')
      newFilters = [{ type: 'NotchShunt', ohms: re, henries: re / wc, farads: 1 / (wc * re) }];
    else if (preset === 'series_notch')
      newFilters = [{ type: 'NotchSeries', ohms: 1, henries: 1 / wc, farads: 1 / (wc * 1) }];
    // Individual components
    else if (preset === 'series_r') newFilters = [{ type: 'SeriesR', ohms: 2.2 }];
    else if (preset === 'series_l') newFilters = [{ type: 'SeriesL', henries: 0.5e-3, dcr_ohms: 0.2 }];
    else if (preset === 'series_c') newFilters = [{ type: 'SeriesC', farads: 10e-6 }];
    else if (preset === 'shunt_r') newFilters = [{ type: 'ShuntR', ohms: 10 }];
    else if (preset === 'shunt_l') newFilters = [{ type: 'ShuntL', henries: 1e-3, dcr_ohms: 0.25 }];
    else if (preset === 'shunt_c') newFilters = [{ type: 'ShuntC', farads: 4.7e-6 }];

    if (newFilters.length > 0) {
      onApply([...passiveFilters, ...newFilters]);
    }
  };

  const snapAll = (series: number[]) => {
    const snapped = passiveFilters.map((pf): PassiveFilter => {
      switch (pf.type) {
        case 'SeriesR':
        case 'ShuntR':
          return { ...pf, ohms: snapToSeries(pf.ohms, series) };
        case 'SeriesL':
        case 'ShuntL':
          return { ...pf, henries: snapToSeries(pf.henries, series) };
        case 'SeriesC':
        case 'ShuntC':
          return { ...pf, farads: snapToSeries(pf.farads, series) };
        case 'ZobelShunt':
          return {
            ...pf,
            ohms: snapToSeries(pf.ohms, series),
            farads: snapToSeries(pf.farads, series),
          };
        case 'LPad':
          return {
            ...pf,
            series_ohms: snapToSeries(pf.series_ohms, series),
            shunt_ohms: snapToSeries(pf.shunt_ohms, series),
          };
        case 'NotchShunt':
        case 'NotchSeries':
          return {
            ...pf,
            ohms: snapToSeries(pf.ohms, series),
            henries: snapToSeries(pf.henries, series),
            farads: snapToSeries(pf.farads, series),
          };
      }
    });
    onApply(snapped);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className="section-subtitle" style={{ margin: 0 }}>Passive RLC Network</div>
        {passiveFilters.length > 0 && (
          <div style={{ display: 'flex', gap: 3 }}>
            <button
              className="graf-btn graf-btn-sm graf-btn-outline"
              style={{ fontSize: 10, padding: '1px 5px' }}
              title="Snap all passive components to nearest E12 (10%) standard values"
              onClick={() => snapAll(E12)}
            >
              Snap E12
            </button>
            <button
              className="graf-btn graf-btn-sm graf-btn-outline"
              style={{ fontSize: 10, padding: '1px 5px' }}
              title="Snap all passive components to nearest E24 (5%) standard values"
              onClick={() => snapAll(E24)}
            >
              Snap E24
            </button>
            <button
              className="graf-btn graf-btn-sm graf-btn-outline"
              style={{ fontSize: 10, padding: '1px 5px', color: 'var(--graf-danger)' }}
              title="Clear all passive components on this way"
              onClick={() => onApply([])}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* 1-Click Shared-Parameter Compensation Calculators */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 4,
          padding: '5px 6px',
          marginBottom: 6,
          fontSize: 10,
        }}
      >
        <div style={{ fontWeight: 600, color: '#334155', marginBottom: 4 }}>
          1-Click Compensation (from shared Driver & Cabinet):
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <button
            className="graf-btn graf-btn-sm graf-btn-outline"
            style={{ fontSize: 10, padding: '2px 6px' }}
            title={`Add Zobel impedance flattening for Re=${re}Ω, Le=${(le * 1000).toFixed(2)}mH → R=${metrics.zobel.r_ohm}Ω, C=${metrics.zobel.c_uf}µF`}
            onClick={() => addPreset('zobel')}
          >
            + Zobel ({metrics.zobel.r_ohm}Ω / {metrics.zobel.c_uf}µF)
          </button>
          <button
            className="graf-btn graf-btn-sm graf-btn-outline"
            style={{ fontSize: 10, padding: '2px 6px' }}
            title={`Add conjugate parallel RLC notch at Fs=${fullDriver.fs_hz}Hz → R=${metrics.resonance_notch.r_ohm}Ω, L=${metrics.resonance_notch.l_mh}mH, C=${metrics.resonance_notch.c_uf}µF`}
            onClick={() => addPreset('fs_notch')}
          >
            + Fs Notch ({fullDriver.fs_hz}Hz)
          </button>
          <button
            className="graf-btn graf-btn-sm graf-btn-outline"
            style={{ fontSize: 10, padding: '2px 6px' }}
            title={`Add Baffle Step inductor for shared cabinet width W=${baffleWidthCm}cm (f_bsc=${bsc.f_bsc_hz}Hz, L=${bsc.l_bsc_mh}mH)`}
            onClick={() => addPreset('bsc_rl')}
          >
            + Baffle Step ({bsc.f_bsc_hz}Hz / {bsc.l_bsc_mh}mH)
          </button>
          {sensDiffDb > 0.5 && (
            <button
              className="graf-btn graf-btn-sm graf-btn-outline"
              style={{ fontSize: 10, padding: '2px 6px' }}
              title={`Add L-Pad matching sensitivity difference (-${sensDiffDb} dB into ${re}Ω)`}
              onClick={() => addPreset('auto_lpad')}
            >
              + Auto L-Pad (-{sensDiffDb}dB)
            </button>
          )}
        </div>
      </div>

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
          <div
            key={i}
            style={{
              border: '1px solid var(--graf-warm-200)',
              borderRadius: 4,
              padding: '3px 6px',
              marginBottom: 3,
              fontSize: 11,
              opacity: pf.bypassed ? 0.4 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <input
                  type="checkbox"
                  checked={!pf.bypassed}
                  title={pf.bypassed ? 'Enable this component' : 'Bypass this component'}
                  onChange={() => updatePf({ ...pf, bypassed: !pf.bypassed } as PassiveFilter)}
                />
                <strong>
                  {pf.type
                    .replace('Series', 'Ser ')
                    .replace('Shunt', 'Shnt ')
                    .replace('Zobel', 'Zobel ')
                    .replace('NotchShunt', 'P.Notch')
                    .replace('NotchSeries', 'S.Notch')}
                </strong>
              </label>
              <button className="graf-btn graf-btn-sm" style={{ padding: '0 4px', fontSize: 9 }} onClick={removePf}>
                x
              </button>
            </div>
            {'ohms' in pf && !('farads' in pf) && !('henries' in pf) && (
              <div className="param-row">
                <span className="param-label">R</span>
                <input
                  type="number"
                  className="graf-form-control"
                  style={{ width: 70, fontSize: 11 }}
                  value={parseFloat(pf.ohms.toFixed(2))}
                  step={0.1}
                  onChange={(e) => updatePf({ ...pf, ohms: parseFloat(e.target.value) || pf.ohms } as PassiveFilter)}
                />
                <span className="param-unit">Ω</span>
              </div>
            )}
            {'ohms' in pf && ('farads' in pf || 'henries' in pf) && (
              <div className="param-row">
                <span className="param-label">R</span>
                <input
                  type="number"
                  className="graf-form-control"
                  style={{ width: 70, fontSize: 11 }}
                  value={parseFloat(pf.ohms.toFixed(2))}
                  step={0.1}
                  onChange={(e) => updatePf({ ...pf, ohms: parseFloat(e.target.value) || pf.ohms } as PassiveFilter)}
                />
                <span className="param-unit">Ω</span>
              </div>
            )}
            {'henries' in pf && (
              <div className="param-row">
                <span className="param-label">L</span>
                <input
                  type="number"
                  className="graf-form-control"
                  style={{ width: 70, fontSize: 11 }}
                  value={parseFloat((pf.henries * 1e3).toFixed(3))}
                  step={0.01}
                  onChange={(e) =>
                    updatePf({ ...pf, henries: (parseFloat(e.target.value) || 0) / 1e3 } as PassiveFilter)
                  }
                />
                <span className="param-unit">mH</span>
              </div>
            )}
            {'dcr_ohms' in pf && (
              <div className="param-row">
                <span className="param-label">DCR</span>
                <input
                  type="number"
                  className="graf-form-control"
                  style={{ width: 70, fontSize: 11 }}
                  value={parseFloat(pf.dcr_ohms.toFixed(2))}
                  step={0.05}
                  onChange={(e) => updatePf({ ...pf, dcr_ohms: parseFloat(e.target.value) || 0 } as PassiveFilter)}
                />
                <span className="param-unit">Ω</span>
              </div>
            )}
            {'farads' in pf && (
              <div className="param-row">
                <span className="param-label">C</span>
                <input
                  type="number"
                  className="graf-form-control"
                  style={{ width: 70, fontSize: 11 }}
                  value={parseFloat((pf.farads * 1e6).toFixed(2))}
                  step={0.1}
                  onChange={(e) =>
                    updatePf({ ...pf, farads: (parseFloat(e.target.value) || 0) / 1e6 } as PassiveFilter)
                  }
                />
                <span className="param-unit">µF</span>
              </div>
            )}
            {'series_ohms' in pf && (
              <>
                <div className="param-row">
                  <span className="param-label">R ser</span>
                  <input
                    type="number"
                    className="graf-form-control"
                    style={{ width: 70, fontSize: 11 }}
                    value={parseFloat(pf.series_ohms.toFixed(2))}
                    step={0.1}
                    onChange={(e) =>
                      updatePf({ ...pf, series_ohms: parseFloat(e.target.value) || 0 } as PassiveFilter)
                    }
                  />
                  <span className="param-unit">Ω</span>
                </div>
                <div className="param-row">
                  <span className="param-label">R shnt</span>
                  <input
                    type="number"
                    className="graf-form-control"
                    style={{ width: 70, fontSize: 11 }}
                    value={parseFloat(pf.shunt_ohms.toFixed(2))}
                    step={0.1}
                    onChange={(e) =>
                      updatePf({ ...pf, shunt_ohms: parseFloat(e.target.value) || 0 } as PassiveFilter)
                    }
                  />
                  <span className="param-unit">Ω</span>
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Crossover frequency input */}
      <NumericInput
        label="Xover freq"
        value={xoverFreq}
        step={100}
        min={100}
        unit="Hz"
        tooltip="Crossover frequency used by the topology wizard presets below"
        onChange={setXoverFreq}
      />

      {/* Preset selector */}
      <select
        className="graf-form-control"
        style={{ width: '100%', fontSize: 12, marginTop: 4 }}
        value=""
        title={`Add passive component (using ${xoverFreq} Hz)`}
        onChange={(e) => {
          addPreset(e.target.value);
          e.target.value = '';
        }}
      >
        <option value="" disabled>
          + Add component / topology...
        </option>
        <optgroup label="1st Order (6 dB/oct)">
          <option value="1st_lp">1st-order LP</option>
          <option value="1st_hp">1st-order HP</option>
        </optgroup>
        <optgroup label="2nd Order (12 dB/oct)">
          <option value="bw2_lp">Butterworth LP</option>
          <option value="bw2_hp">Butterworth HP</option>
          <option value="lr2_lp">LR2 LP</option>
          <option value="lr2_hp">LR2 HP</option>
        </optgroup>
        <optgroup label="4th Order (24 dB/oct)">
          <option value="lr4_lp">LR4 LP</option>
          <option value="lr4_hp">LR4 HP</option>
        </optgroup>
        <optgroup label="Compensation (from Shared Driver & Baffle)">
          <option value="zobel">Zobel Impedance Flattening</option>
          <option value="fs_notch">Conjugate Fs Resonance Notch</option>
          <option value="bsc_rl">Baffle Step Inductor (from Cabinet W)</option>
          <option value="auto_lpad">Auto L-Pad (from Driver Sensitivity)</option>
          <option value="lpad_3db">L-Pad -3dB</option>
          <option value="lpad_6db">L-Pad -6dB</option>
          <option value="notch">Parallel Notch (at Xover)</option>
          <option value="series_notch">Series Notch (at Xover)</option>
        </optgroup>
        <optgroup label="Individual Components">
          <option value="series_r">Series R</option>
          <option value="series_l">Series L</option>
          <option value="series_c">Series C</option>
          <option value="shunt_r">Shunt R</option>
          <option value="shunt_l">Shunt L</option>
          <option value="shunt_c">Shunt C</option>
        </optgroup>
      </select>
    </div>
  );
}
