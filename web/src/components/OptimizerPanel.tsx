import { useState, useEffect, useRef, useMemo } from 'react';
import { runOptimizer } from '../solver/wasm-bridge';
import { NumericInput } from './NumericInput';
import type { WayInput, SystemInput } from '../types';

interface Props {
  ways: WayInput[];
  sysParams: { freq_start_hz: number; freq_end_hz: number; freq_points: number; drive_voltage_rms: number };
  onApply: (ways: WayInput[]) => void;
}

interface CandidateParam {
  key: string;
  label: string;
  payload: Record<string, unknown>;
}

export function OptimizerPanel({ ways, sysParams, onApply }: Props) {
  const [targetMode, setTargetMode] = useState<'flat' | 'slope'>('flat');
  const [targetDb, setTargetDb] = useState(86);
  const [targetSlope, setTargetSlope] = useState(-0.2);
  const [freqWeight, setFreqWeight] = useState<'uniform' | 'presence'>('uniform');
  const [minImpedance, setMinImpedance] = useState<number | null>(null);
  const [algorithm, setAlgorithm] = useState<'twophase' | 'hybrid' | 'nm' | 'de'>('hybrid');
  const [eSeries, setESeries] = useState<'none' | 'E12' | 'E24'>('none');
  const [freqMin, setFreqMin] = useState(200);
  const [freqMax, setFreqMax] = useState(10000);
  const [maxIter, setMaxIter] = useState(100);
  const [lockedKeys, setLockedKeys] = useState<Record<string, boolean>>({});
  const [showLocks, setShowLocks] = useState(false);
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

  // Discover all optimizable parameters (active crossovers, EQ, passive L/C/R, and per-way gains/L-Pads)
  const candidateParams = useMemo((): CandidateParam[] => {
    const list: CandidateParam[] = [];
    const enabledWays = ways.map((w, i) => ({ ...w, idx: i })).filter(w => w.enabled);

    // 1. Active filter crossover pairs and standalone active filters
    const linkedHpFilters = new Set<string>();
    for (let i = 0; i < enabledWays.length - 1; i++) {
      const lo = enabledWays[i];
      const hi = enabledWays[i + 1];
      const lpIdx = lo.active_filters.findIndex(f =>
        f.type === 'LR4LowPass' || f.type === 'LR2LowPass' || f.type === 'LowPass1' || f.type === 'LowPass2');
      const hpIdx = hi.active_filters.findIndex(f =>
        f.type === 'LR4HighPass' || f.type === 'LR2HighPass' || f.type === 'HighPass1' || f.type === 'HighPass2');
      if (lpIdx >= 0 && hpIdx >= 0) {
        list.push({
          key: `xo:${lo.idx}:${lpIdx}:${hi.idx}:${hpIdx}`,
          label: `${lo.name}↔${hi.name} Active XO Freq`,
          payload: {
            type: 'CrossoverFreq',
            lp_way_idx: lo.idx, lp_filter_idx: lpIdx,
            hp_way_idx: hi.idx, hp_filter_idx: hpIdx,
          },
        });
        linkedHpFilters.add(`${hi.idx}:${hpIdx}`);
        for (let fi = 0; fi < lo.active_filters.length; fi++) {
          if (fi !== lpIdx) {
            list.push({
              key: `af:${lo.idx}:${fi}`,
              label: `${lo.name} Active Filter #${fi + 1}`,
              payload: { type: 'FilterFreq', way_idx: lo.idx, filter_idx: fi },
            });
          }
        }
      } else {
        lo.active_filters.forEach((_, fi) => {
          list.push({
            key: `af:${lo.idx}:${fi}`,
            label: `${lo.name} Active Filter #${fi + 1}`,
            payload: { type: 'FilterFreq', way_idx: lo.idx, filter_idx: fi },
          });
        });
      }
    }
    if (enabledWays.length > 0) {
      const last = enabledWays[enabledWays.length - 1];
      last.active_filters.forEach((_, fi) => {
        if (!linkedHpFilters.has(`${last.idx}:${fi}`)) {
          list.push({
            key: `af:${last.idx}:${fi}`,
            label: `${last.name} Active Filter #${fi + 1}`,
            payload: { type: 'FilterFreq', way_idx: last.idx, filter_idx: fi },
          });
        }
      });
    }

    // 2. Passive RLC components (SeriesL, ShuntL, SeriesC, ShuntC)
    enabledWays.forEach((w) => {
      w.passive_filters.forEach((pf, fi) => {
        if (pf.type === 'SeriesL' || pf.type === 'ShuntL') {
          list.push({
            key: `pl:${w.idx}:${fi}`,
            label: `${w.name} ${pf.type} (${(pf.henries * 1000).toFixed(2)} mH)`,
            payload: { type: 'PassiveL', way_idx: w.idx, filter_idx: fi },
          });
        } else if (pf.type === 'SeriesC' || pf.type === 'ShuntC') {
          list.push({
            key: `pc:${w.idx}:${fi}`,
            label: `${w.name} ${pf.type} (${(pf.farads * 1e6).toFixed(1)} µF)`,
            payload: { type: 'PassiveC', way_idx: w.idx, filter_idx: fi },
          });
        } else if (pf.type === 'SeriesR' || pf.type === 'ShuntR') {
          list.push({
            key: `pr:${w.idx}:${fi}`,
            label: `${w.name} ${pf.type} (${pf.ohms.toFixed(1)} Ω)`,
            payload: { type: 'PassiveR', way_idx: w.idx, filter_idx: fi },
          });
        }
      });
    });

    // 3. Level matching: WayGain or LPadAttenuation
    enabledWays.forEach((w, i) => {
      const hasPassiveLadder = w.passive_filters.length > 0 && w.active_filters.length === 0;
      if ((algorithm === 'twophase' || hasPassiveLadder) && i > 0) {
        list.push({
          key: `lpad:${w.idx}`,
          label: `${w.name} L-Pad Attenuation`,
          payload: { type: 'LPadAttenuation', way_idx: w.idx },
        });
      } else {
        list.push({
          key: `gain:${w.idx}`,
          label: `${w.name} Gain (dB)`,
          payload: { type: 'WayGain', way_idx: w.idx },
        });
      }
    });

    return list;
  }, [ways, algorithm]);

  const handleOptimize = () => {
    setRunning(true);
    setError(null);
    setResult(null);

    const activeParams = candidateParams
      .filter((c) => !lockedKeys[c.key])
      .map((c) => c.payload);

    if (activeParams.length === 0) {
      setError('No unlocked parameters to optimize — unlock at least one parameter.');
      setRunning(false);
      return;
    }

    // If optimizing passive L/C/R directly, use Hybrid (DE + NM) instead of TwoPhase
    const hasPassiveLC = activeParams.some(
      (p) => p.type === 'PassiveL' || p.type === 'PassiveC' || p.type === 'PassiveR'
    );
    const effectiveAlgo = hasPassiveLC && algorithm === 'twophase' ? 'hybrid' : algorithm;

    try {
      const target = targetMode === 'flat'
        ? { type: 'Flat' as const, db: targetDb }
        : { type: 'Slope' as const, db_at_1khz: targetDb, slope_db_per_octave: targetSlope };
      const systemInput: SystemInput = { ways, ...sysParams };
      const optResult = runOptimizer({
        system: systemInput,
        params: activeParams,
        target,
        freq_min_hz: freqMin,
        freq_max_hz: freqMax,
        max_iterations: maxIter,
        freq_weight: freqWeight !== 'uniform' ? freqWeight : undefined,
        min_impedance_ohm: minImpedance ?? undefined,
        algorithm: effectiveAlgo,
        e_series: eSeries !== 'none' ? eSeries : undefined,
      });

      setResult({ cost: optResult.final_cost, iterations: optResult.iterations, minSafeFreqs: optResult.min_safe_freq_hz });

      const gainNotes: string[] = [];
      onApply(optResult.optimized_system.ways.map((ow, i) => {
        const way = {
          ...ways[i],
          active_filters: ow.active_filters,
          passive_filters: ow.passive_filters,
          gain_db: ow.gain_db,
          delay_s: ow.delay_s,
        };

        const lpad = ow.passive_filters.find(f => f.type === 'LPad');
        if (lpad && 'series_ohms' in lpad && 'shunt_ohms' in lpad) {
          const atten = 20 * Math.log10(1 + (lpad.series_ohms as number) / ways[i].driver.re_ohm);
          gainNotes.push(`${ways[i].name}: L-Pad ${atten.toFixed(1)} dB (${(lpad.series_ohms as number).toFixed(1)}Ω / ${(lpad.shunt_ohms as number).toFixed(1)}Ω)`);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className="section-title" style={{ margin: 0 }}>Optimizer</div>
        <button
          className="graf-btn graf-btn-sm graf-btn-ghost"
          style={{ fontSize: 10, padding: '1px 5px' }}
          onClick={() => setShowLocks(!showLocks)}
          title="Lock or unlock individual crossover frequencies, passive L/C/R components, or gains"
        >
          {showLocks ? 'Hide Locks' : `Params (${candidateParams.filter(c => !lockedKeys[c.key]).length}/${candidateParams.length})`}
        </button>
      </div>

      {showLocks && candidateParams.length > 0 && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 4,
            padding: '4px 6px',
            marginBottom: 6,
            maxHeight: 130,
            overflowY: 'auto',
            fontSize: 10,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 3, color: '#475569' }}>
            Checked = Optimize · Unchecked = Locked:
          </div>
          {candidateParams.map((cp) => (
            <label
              key={cp.key}
              style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={!lockedKeys[cp.key]}
                onChange={(e) =>
                  setLockedKeys((prev) => ({ ...prev, [cp.key]: !e.target.checked }))
                }
              />
              <span>{cp.label}</span>
            </label>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: 11 }}>Target:</label>
        <label style={{ fontSize: 11 }}>
          <input type="radio" name="targetMode" value="flat" checked={targetMode === 'flat'}
            title="Flat target: constant SPL across all frequencies"
            onChange={() => setTargetMode('flat')} /> Flat
        </label>
        <label style={{ fontSize: 11 }}>
          <input type="radio" name="targetMode" value="slope" checked={targetMode === 'slope'}
            title="Slope target: SPL tilts down at a given dB/octave (common for room compensation)"
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
          title="How to weight errors across frequencies. Presence boost doubles the weight in the 1-5 kHz speech/detail region."
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
            title="Enable minimum impedance constraint. Penalizes solutions where system impedance drops below the threshold."
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
          title="Optimization algorithm. Two-Phase finds crossover points first, then tunes L-Pad attenuation with real impedance modeling."
          value={algorithm} onChange={e => setAlgorithm(e.target.value as 'twophase' | 'hybrid' | 'nm' | 'de')}>
          <option value="hybrid">Hybrid (recommended)</option>
          <option value="twophase">Two-Phase (passive L-Pad)</option>
          <option value="de">Differential Evolution</option>
          <option value="nm">Nelder-Mead</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: 11 }}>E-series:</label>
        <select className="graf-input" style={{ fontSize: 11, padding: '2px 4px', flex: 1 }}
          title="After optimization, snap passive component values to standard E-series resistor/capacitor/inductor values. E24 (5% tolerance) is more precise than E12 (10%)."
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
        title="Run optimizer to tune filter frequencies, passive L/C/R values, and per-way gains"
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
