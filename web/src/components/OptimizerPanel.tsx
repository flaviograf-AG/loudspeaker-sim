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
  const [targetDb, setTargetDb] = useState(86);
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
      const systemInput: SystemInput = { ways, ...sysParams };
      const optResult = runOptimizer({
        system: systemInput,
        params,
        target_db: targetDb,
        freq_min_hz: freqMin,
        freq_max_hz: freqMax,
        max_iterations: maxIter,
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
      <NumericInput label="Target SPL" value={targetDb} step={1} min={60} max={120} unit="dB"
        tooltip="Target flat SPL level. The optimizer minimizes deviation from this line."
        onChange={setTargetDb} />
      <NumericInput label="Freq min" value={freqMin} step={50} min={20} max={5000} unit="Hz"
        tooltip="Lower frequency bound for optimization. Errors below this are ignored."
        onChange={setFreqMin} />
      <NumericInput label="Freq max" value={freqMax} step={1000} min={500} max={20000} unit="Hz"
        tooltip="Upper frequency bound for optimization."
        onChange={setFreqMax} />
      <NumericInput label="Max iter" value={maxIter} step={50} min={10} max={500}
        tooltip="Maximum optimizer iterations. More = potentially better result but slower."
        onChange={(v) => setMaxIter(Math.round(v))} />
      <button
        className={`graf-btn graf-btn-sm ${running ? 'graf-btn-outline' : 'graf-btn-primary'}`}
        style={{ width: '100%', marginTop: 4 }}
        onClick={handleOptimize}
        disabled={running}
        title="Run Nelder-Mead optimizer to tune filter frequencies and per-way gains"
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
