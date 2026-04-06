import { useEffect, useState, useRef, useCallback } from 'react';
import { useUndoRedo } from './hooks/useUndoRedo';
import { initSolver } from './solver/wasm-bridge';
import { useSolver } from './hooks/useSolver';
import { useSystemSolver } from './hooks/useSystemSolver';
import { PlotArea } from './components/PlotArea';
import { SystemPlotArea } from './components/SystemPlotArea';
import { DriverInputs } from './components/DriverInputs';
import { EnclosureInputs } from './components/EnclosureInputs';
import { MultiWayEditor } from './components/MultiWayEditor';
import { PresetSelector } from './components/PresetSelector';
import { SaveLoadControls } from './components/SaveLoadControls';
import { ExportControls } from './components/ExportControls';
import { NumericInput } from './components/NumericInput';
import { ImportOverlay, type OverlayData } from './components/ImportOverlay';
import { BiquadExport } from './components/BiquadExport';
import { OptimizerPanel } from './components/OptimizerPanel';
import type { SimulationInput, DriverParams, EnclosureConfig, WayInput, SystemInput } from './types';

const DEFAULT_INPUT: SimulationInput = {
  driver: {
    fs_hz: 37, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5,
    vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3,
  },
  enclosure: { type: 'Sealed', volume_m3: 18e-3, ql: 7 },
  freq_start_hz: 10, freq_end_hz: 20000, freq_points: 500, drive_voltage_rms: 2.83,
};

const DEFAULT_WAYS: WayInput[] = [
  {
    name: 'Woofer',
    driver: { fs_hz: 37, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5, vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3 },
    enclosure: { type: 'Sealed', volume_m3: 18e-3, ql: 7 },
    passive_filters: [], active_filters: [{ type: 'LR4LowPass', freq_hz: 2500 }],
    gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
  },
  {
    name: 'Tweeter',
    driver: { fs_hz: 800, re_ohm: 5.5, le_h: 0.05e-3, qes: 0.5, qms: 2.0, vas_m3: 0.5e-3, sd_m2: 8e-4, xmax_m: 1e-3 },
    enclosure: { type: 'Sealed', volume_m3: 0.5e-3, ql: 7 },
    passive_filters: [], active_filters: [{ type: 'LR4HighPass', freq_hz: 2500 }],
    gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
  },
];

type AppMode = 'single' | 'multiway';

function App() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode>('single');
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const dragging = useRef(false);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (dragging.current) setSidebarWidth(Math.min(500, Math.max(260, ev.clientX)));
    };
    const onUp = () => { dragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Overlay (imported FRD/ZMA)
  const [overlay, setOverlay] = useState<OverlayData>({ frd: null, zma: null });

  // Comparison snapshots
  const [snapshots, setSnapshots] = useState<{ name: string; spl: number[]; freqs: number[] }[]>([]);

  // Single-way state with undo/redo (Ctrl+Z / Ctrl+Y)
  const inputUndo = useUndoRedo<SimulationInput>(DEFAULT_INPUT);
  const input = inputUndo.value;
  const setInput = inputUndo.set;
  const { result: singleResult, error: singleError } = useSolver(input, ready);

  // Multi-way state
  const [ways, setWays] = useState<WayInput[]>(DEFAULT_WAYS);
  const [sysParams, setSysParams] = useState({ freq_start_hz: 10, freq_end_hz: 20000, freq_points: 500, drive_voltage_rms: 2.83 });

  const systemInput: SystemInput | null = mode === 'multiway' ? {
    ways,
    ...sysParams,
  } : null;
  const { result: systemResult, error: systemError } = useSystemSolver(systemInput, ready);

  useEffect(() => {
    initSolver()
      .then(() => setReady(true))
      .catch((e) => setInitError(String(e)));
  }, []);

  const updateDriver = (driver: DriverParams) => setInput({ ...input, driver });
  const updateEnclosure = (enclosure: EnclosureConfig) => setInput({ ...input, enclosure });
  const qts = (input.driver.qes * input.driver.qms) / (input.driver.qes + input.driver.qms);
  const error = mode === 'single' ? singleError : systemError;

  if (initError) {
    return (
      <div className="graf-container" style={{ padding: 40 }}>
        <div className="graf-card graf-card-accent" style={{ borderColor: 'var(--graf-danger)' }}>
          <div className="graf-card-body">
            <p style={{ color: 'var(--graf-danger)' }}>Failed to load solver: {initError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="graf-container" style={{ padding: 40, textAlign: 'center' }}>
        <p className="graf-lead">Loading WASM solver...</p>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <div className="sidebar-drag-handle" style={{ left: sidebarWidth - 3 }} onMouseDown={onDragStart} />
      <aside className="app-sidebar" style={{ width: sidebarWidth }}>
        <h1 style={{ fontSize: 'var(--graf-font-size-lg, 18px)', color: 'var(--graf-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/favicon/favicon.svg" alt="LS" width={28} height={28} />
          Loudspeaker Sim
        </h1>

        {/* Mode toggle */}
        <div className="btn-row" style={{ marginBottom: 8 }}>
          <button
            className={`graf-btn graf-btn-sm ${mode === 'single' ? 'graf-btn-primary' : 'graf-btn-outline'}`}
            onClick={() => setMode('single')}
            title="Single Driver mode — design one driver in one enclosure. Full SPL, impedance, displacement, group delay, phase plots."
          >Single Driver</button>
          <button
            className={`graf-btn graf-btn-sm ${mode === 'multiway' ? 'graf-btn-primary' : 'graf-btn-outline'}`}
            onClick={() => setMode('multiway')}
            title="Multi-Way mode — design a complete speaker system with multiple drivers, crossover filters, and time alignment. System SPL is the complex sum of all ways."
          >Multi-Way</button>
        </div>

        {mode === 'single' && (
          <>
            <PresetSelector onSelect={updateDriver} />
            <DriverInputs params={input.driver} onChange={updateDriver} />
            <EnclosureInputs config={input.enclosure} driverVas={input.driver.vas_m3}
              driverFs={input.driver.fs_hz} driverQts={qts} onChange={updateEnclosure} />
            <div className="section-card">
              <div className="section-title">Simulation</div>
              <NumericInput label="Drive" value={input.drive_voltage_rms} step={0.1} min={0.1} unit="V rms"
                tooltip="Amplifier drive voltage (RMS). 2.83V = 1W into 8Ω."
                onChange={(v) => setInput({ ...input, drive_voltage_rms: v })} />
              <NumericInput label="F start" value={input.freq_start_hz} step={1} min={1} unit="Hz"
                tooltip="Sweep start frequency."
                onChange={(v) => setInput({ ...input, freq_start_hz: v })} />
              <NumericInput label="F end" value={input.freq_end_hz} step={1000} min={100} unit="Hz"
                tooltip="Sweep end frequency."
                onChange={(v) => setInput({ ...input, freq_end_hz: v })} />
              <NumericInput label="Points" value={input.freq_points} step={100} min={50} max={2000}
                tooltip="Frequency points."
                onChange={(v) => setInput({ ...input, freq_points: Math.round(v) })} />
            </div>
            <SaveLoadControls input={input} onLoad={setInput} />
            <ExportControls result={singleResult} />
            <ImportOverlay overlay={overlay} onChange={setOverlay} />

            {/* Comparison snapshots + undo/redo */}
            <div className="section-card">
              <div className="section-title">Compare</div>
              <div className="btn-row">
                <button className="graf-btn graf-btn-sm graf-btn-outline"
                  title="Save current SPL curve as a comparison snapshot overlay"
                  onClick={() => {
                    if (singleResult) {
                      const name = `Snap ${snapshots.length + 1}`;
                      setSnapshots(prev => [...prev, { name, spl: [...singleResult.spl_db], freqs: [...singleResult.frequencies_hz] }]);
                    }
                  }}>Snapshot</button>
                {snapshots.length > 0 && (
                  <button className="graf-btn graf-btn-sm" style={{ color: 'var(--graf-danger)' }}
                    title="Clear all comparison snapshots"
                    onClick={() => setSnapshots([])}>Clear</button>
                )}
                <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={inputUndo.undo}
                  disabled={!inputUndo.canUndo} title="Undo (Ctrl+Z)">Undo</button>
                <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={inputUndo.redo}
                  disabled={!inputUndo.canRedo} title="Redo (Ctrl+Y)">Redo</button>
              </div>
              {snapshots.map((s, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--graf-warm-500)' }}>
                  {s.name}
                  <button className="graf-btn graf-btn-sm" style={{ padding: '0 3px', fontSize: 9, marginLeft: 4 }}
                    onClick={() => setSnapshots(prev => prev.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
          </>
        )}

        {mode === 'multiway' && (
          <>
            <MultiWayEditor ways={ways} onChange={setWays} />
            <div className="section-card">
              <div className="section-title">System Settings</div>
              <NumericInput label="Drive" value={sysParams.drive_voltage_rms} step={0.1} min={0.1} unit="V rms"
                tooltip="Amplifier drive voltage."
                onChange={(v) => setSysParams(p => ({ ...p, drive_voltage_rms: v }))} />
              <NumericInput label="F start" value={sysParams.freq_start_hz} step={1} min={1} unit="Hz"
                tooltip="Sweep start."
                onChange={(v) => setSysParams(p => ({ ...p, freq_start_hz: v }))} />
              <NumericInput label="F end" value={sysParams.freq_end_hz} step={1000} min={100} unit="Hz"
                tooltip="Sweep end."
                onChange={(v) => setSysParams(p => ({ ...p, freq_end_hz: v }))} />
              <NumericInput label="Points" value={sysParams.freq_points} step={100} min={50} max={2000}
                tooltip="Frequency points."
                onChange={(v) => setSysParams(p => ({ ...p, freq_points: Math.round(v) }))} />
            </div>
            <OptimizerPanel ways={ways} sysParams={sysParams} onApply={setWays} />
            <div className="section-card">
              <div className="section-title">Export</div>
              <div className="btn-row">
                <BiquadExport ways={ways} />
              </div>
            </div>
          </>
        )}

        {error && (
          <div style={{ color: 'var(--graf-danger)', fontSize: 12, marginTop: 8 }}>{error}</div>
        )}
      </aside>

      <main className="app-main">
        {mode === 'single' && <PlotArea result={singleResult} xmaxMm={input.driver.xmax_m * 1000} overlay={overlay} snapshots={snapshots} />}
        {mode === 'multiway' && <SystemPlotArea result={systemResult} />}
      </main>
    </div>
  );
}

export default App;
