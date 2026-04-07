import { useState, useEffect, useRef } from 'react';
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
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [result, setResult] = useState<{ cost: number; iterations: number; notes?: string[]; minSafeFreqs?: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Elapsed timer during optimization
  useEffect(() => {
    if (running) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 0.1), 100);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  const handleOptimize = () => {
    setRunning(true);
    setError(null);
    setResult(null);

    // Build params: link adjacent LP/HP as crossover points, optimize gains
    const params: Record<string, unknown>[] = [];
    const enabledWays = ways.map((w, i) => ({ ...w, idx: i })).filter(w => w.enabled);

    // Find LP/HP pairs between adjacent ways and link them
    const linkedHpFilters = new Set<string>(); // "wayIdx:filterIdx" keys already linked
    for (let i = 0; i < enabledWays.length - 1; i++) {
      const lo = enabledWays[i];
      const hi = enabledWays[i + 1];
      // Find LP filter in lower way
      const lpIdx = lo.active_filters.findIndex(f =>
        f.type === 'LR4LowPass' || f.type === 'LR2LowPass' || f.type === 'LowPass1' || f.type === 'LowPass2');
      // Find HP filter in higher way
      const hpIdx = hi.active_filters.findIndex(f =>
        f.type === 'LR4HighPass' || f.type === 'LR2HighPass' || f.type === 'HighPass1' || f.type === 'HighPass2');
      if (lpIdx >= 0 && hpIdx >= 0) {
        params.push({
          type: 'CrossoverFreq',
          lp_way_idx: lo.idx, lp_filter_idx: lpIdx,
          hp_way_idx: hi.idx, hp_filter_idx: hpIdx,
        });
        linkedHpFilters.add(`${hi.idx}:${hpIdx}`);
        // Don't add independent FilterFreq for linked filters
        // but do add other filters (PEQ, allpass, etc.)
        for (let fi = 0; fi < lo.active_filters.length; fi++) {
          if (fi !== lpIdx) params.push({ type: 'FilterFreq', way_idx: lo.idx, filter_idx: fi });
        }
      } else {
        // No linkable pair — add all filters independently
        lo.active_filters.forEach((_, fi) => {
          params.push({ type: 'FilterFreq', way_idx: lo.idx, filter_idx: fi });
        });
      }
    }
    // Last enabled way: add non-linked filters
    if (enabledWays.length > 0) {
      const last = enabledWays[enabledWays.length - 1];
      last.active_filters.forEach((_, fi) => {
        if (!linkedHpFilters.has(`${last.idx}:${fi}`)) {
          params.push({ type: 'FilterFreq', way_idx: last.idx, filter_idx: fi });
        }
      });
    }
    // Add gain for all enabled ways
    enabledWays.forEach(w => {
      params.push({ type: 'WayGain', way_idx: w.idx });
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

      setResult({ cost: optResult.final_cost, iterations: optResult.iterations, minSafeFreqs: optResult.min_safe_freq_hz });

      // Apply optimized ways back, converting negative gain to L-Pad
      const gainNotes: string[] = [];
      onApply(optResult.optimized_system.ways.map((ow, i) => {
        const way = { ...ways[i], active_filters: ow.active_filters, gain_db: ow.gain_db, delay_s: ow.delay_s };
        const absGain = Math.abs(ow.gain_db);

        if (ow.gain_db < -0.5) {
          // Convert attenuation to L-Pad using driver Re
          const re = ways[i].driver.re_ohm;
          if (re > 0) {
            const ratio = Math.pow(10, absGain / 20);
            const series_ohms = re * (ratio - 1) / ratio;
            const shunt_ohms = re * ratio / (ratio - 1);
            // Remove any existing L-Pad, then append new one
            const filtered = way.passive_filters.filter(f => f.type !== 'LPad');
            way.passive_filters = [...filtered, { type: 'LPad' as const, series_ohms, shunt_ohms }];
            way.gain_db = 0;
            gainNotes.push(`${ways[i].name}: L-Pad ${absGain.toFixed(1)} dB (${series_ohms.toFixed(1)}Ω / ${shunt_ohms.toFixed(1)}Ω)`);
          }
        } else if (ow.gain_db > 0.5) {
          gainNotes.push(`${ways[i].name}: +${ow.gain_db.toFixed(1)} dB (requires active gain stage)`);
        }
        return way;
      }));
      if (gainNotes.length > 0) {
        setResult(prev => prev ? { ...prev, notes: gainNotes } : prev);
      }
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
        tooltip="Maximum optimizer iterations (capped at 500). More = better result but slower."
        onChange={(v) => setMaxIter(Math.min(500, Math.round(v)))} />
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
        {running ? `Optimizing... ${elapsed.toFixed(1)}s` : 'Optimize'}
      </button>
      {result && (
        <div style={{ fontSize: 11, color: 'var(--graf-warm-600)', marginTop: 4 }}>
          Done in {result.iterations} iterations. Cost: {result.cost.toFixed(2)} dB²
          {result.minSafeFreqs && result.minSafeFreqs.some(f => f > 0) && (
            <div style={{ marginTop: 4, fontSize: 10, color: 'var(--graf-warm-500)' }}>
              {result.minSafeFreqs.map((f, i) => f > 0 ? (
                <div key={`sf${i}`}>⚡ {ways[i]?.name || `Way ${i+1}`}: min safe HP ≥ {Math.round(f)} Hz</div>
              ) : null)}
            </div>
          )}
          {result.notes && result.notes.map((n, i) => (
            <div key={i} style={{ marginTop: 2, color: n.includes('active') ? 'var(--graf-danger)' : 'var(--graf-warm-500)' }}>
              → {n}
            </div>
          ))}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: 'var(--graf-danger)', marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}
