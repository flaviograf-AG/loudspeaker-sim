import { useState } from 'react';
import { runOptimizer } from '../solver/wasm-bridge';
import { NumericInput } from './NumericInput';
import type { WayInput, SystemInput } from '../types';

interface Props {
  ways: WayInput[];
  sysParams: { freq_start_hz: number; freq_end_hz: number; freq_points: number; drive_voltage_rms: number };
  onApply: (ways: WayInput[]) => void;
}

export function OptimizerPanel({ ways, sysParams, onApply }: Props) {
  const [targetMode, setTargetMode] = useState<'flat' | 'slope'>('flat');
  const [targetDb, setTargetDb] = useState(86);
  const [targetSlope, setTargetSlope] = useState(-0.2);
  const [freqWeight, setFreqWeight] = useState<'uniform' | 'presence'>('uniform');
  const [minImpedance, setMinImpedance] = useState<number | null>(null);
  const [algorithm, setAlgorithm] = useState<'hybrid' | 'nm' | 'de'>('hybrid');
  const [eSeries, setESeries] = useState<'none' | 'E12' | 'E24'>('none');
  const [freqMin, setFreqMin] = useState(200);
  const [freqMax, setFreqMax] = useState(10000);
  const [maxIter, setMaxIter] = useState(100);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ cost: number; iterations: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOptimize = () => {
    setRunning(true);
    setError(null);
    setResult(null);

    // Build params: optimize all filter frequencies + all way gains
    const params: { type: string; way_idx?: number; filter_idx?: number }[] = [];
    ways.forEach((w, wi) => {
      if (!w.enabled) return;
      w.active_filters.forEach((_, fi) => {
        params.push({ type: 'FilterFreq', way_idx: wi, filter_idx: fi });
      });
      params.push({ type: 'WayGain', way_idx: wi });
    });

    if (params.length === 0) {
      setError('No optimizable parameters — add active filters to ways');
      setRunning(false);
      return;
    }

    try {
      const target = targetMode === 'flat'
        ? { type: 'Flat' as const, db: targetDb }
        : { type: 'Slope' as const, db_at_1khz: targetDb, slope_db_per_octave: targetSlope };
      const systemInput: SystemInput = { ways, ...sysParams };
      const optResult = runOptimizer({
        system: systemInput,
        params,
        target,
        freq_min_hz: freqMin,
        freq_max_hz: freqMax,
        max_iterations: maxIter,
        freq_weight: freqWeight !== 'uniform' ? freqWeight : undefined,
        min_impedance_ohm: minImpedance ?? undefined,
        algorithm,
        e_series: eSeries !== 'none' ? eSeries : undefined,
      });

      setResult({ cost: optResult.final_cost, iterations: optResult.iterations });

      // Apply optimized ways back
      onApply(optResult.optimized_system.ways.map((ow, i) => ({
        ...ways[i],
        active_filters: ow.active_filters,
        gain_db: ow.gain_db,
        delay_s: ow.delay_s,
      })));
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="section-card">
      <div className="section-title">Optimizer</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: 11 }}>Target:</label>
        <label style={{ fontSize: 11 }}>
          <input type="radio" name="targetMode" value="flat" checked={targetMode === 'flat'}
            onChange={() => setTargetMode('flat')} /> Flat
        </label>
        <label style={{ fontSize: 11 }}>
          <input type="radio" name="targetMode" value="slope" checked={targetMode === 'slope'}
            onChange={() => setTargetMode('slope')} /> Slope
        </label>
      </div>
      <NumericInput label={targetMode === 'flat' ? 'Target SPL' : 'SPL at 1kHz'} value={targetDb} step={1} min={60} max={120} unit="dB"
        tooltip={targetMode === 'flat' ? 'Target flat SPL level.' : 'SPL at 1kHz reference point for slope target.'}
        onChange={setTargetDb} />
      {targetMode === 'slope' && (
        <NumericInput label="Slope" value={targetSlope} step={0.1} min={-3} max={3} unit="dB/oct"
          tooltip="Target slope in dB per octave. Negative = falling response (common: -0.2 to -0.5)."
          onChange={setTargetSlope} />
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: 11 }}>Weighting:</label>
        <select className="graf-input" style={{ fontSize: 11, padding: '2px 4px', flex: 1 }}
          value={freqWeight} onChange={e => setFreqWeight(e.target.value as 'uniform' | 'presence')}>
          <option value="uniform">Uniform</option>
          <option value="presence">Presence boost (1-5 kHz)</option>
        </select>
      </div>
      <NumericInput label="Freq min" value={freqMin} step={50} min={20} max={5000} unit="Hz"
        tooltip="Lower frequency bound for optimization. Errors below this are ignored."
        onChange={setFreqMin} />
      <NumericInput label="Freq max" value={freqMax} step={1000} min={500} max={20000} unit="Hz"
        tooltip="Upper frequency bound for optimization."
        onChange={setFreqMax} />
      <NumericInput label="Max iter" value={maxIter} step={50} min={10} max={500}
        tooltip="Maximum optimizer iterations. More = potentially better result but slower."
        onChange={(v) => setMaxIter(Math.round(v))} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: 11 }}>
          <input type="checkbox" checked={minImpedance !== null}
            onChange={e => setMinImpedance(e.target.checked ? 3.2 : null)} /> Min Z
        </label>
        {minImpedance !== null && (
          <NumericInput label="" value={minImpedance} step={0.1} min={1} max={16} unit="Ω"
            tooltip="Penalize solutions where system impedance drops below this threshold."
            onChange={setMinImpedance} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: 11 }}>Algorithm:</label>
        <select className="graf-input" style={{ fontSize: 11, padding: '2px 4px', flex: 1 }}
          value={algorithm} onChange={e => setAlgorithm(e.target.value as 'hybrid' | 'nm' | 'de')}>
          <option value="hybrid">Hybrid (recommended)</option>
          <option value="de">Differential Evolution</option>
          <option value="nm">Nelder-Mead</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: 11 }}>E-series:</label>
        <select className="graf-input" style={{ fontSize: 11, padding: '2px 4px', flex: 1 }}
          value={eSeries} onChange={e => setESeries(e.target.value as 'none' | 'E12' | 'E24')}>
          <option value="none">None</option>
          <option value="E12">E12 (10%)</option>
          <option value="E24">E24 (5%)</option>
        </select>
      </div>
      <button
        className={`graf-btn graf-btn-sm ${running ? 'graf-btn-outline' : 'graf-btn-primary'}`}
        style={{ width: '100%', marginTop: 4 }}
        onClick={handleOptimize}
        disabled={running}
        title="Run optimizer to tune filter frequencies and per-way gains"
      >
        {running ? 'Optimizing...' : 'Optimize'}
      </button>
      {result && (
        <div style={{ fontSize: 11, color: 'var(--graf-warm-600)', marginTop: 4 }}>
          Done in {result.iterations} iterations. Cost: {result.cost.toFixed(2)} dB²
        </div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: 'var(--graf-danger)', marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}
