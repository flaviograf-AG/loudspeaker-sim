import { useEffect, useState } from 'react';
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

  // Overlay (imported FRD/ZMA)
  const [overlay, setOverlay] = useState<OverlayData>({ frd: null, zma: null });

  // Single-way state
  const [input, setInput] = useState<SimulationInput>(DEFAULT_INPUT);
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

  const updateDriver = (driver: DriverParams) => setInput((prev) => ({ ...prev, driver }));
  const updateEnclosure = (enclosure: EnclosureConfig) => setInput((prev) => ({ ...prev, enclosure }));
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
      <aside className="app-sidebar">
        <h1 style={{ fontSize: 'var(--graf-font-size-lg, 18px)', color: 'var(--graf-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/favicon/favicon.svg" alt="LS" width={28} height={28} />
          Loudspeaker Sim
        </h1>

        {/* Mode toggle */}
        <div className="btn-row" style={{ marginBottom: 8 }}>
          <button
            className={`graf-btn graf-btn-sm ${mode === 'single' ? 'graf-btn-primary' : 'graf-btn-outline'}`}
            onClick={() => setMode('single')}
          >Single Driver</button>
          <button
            className={`graf-btn graf-btn-sm ${mode === 'multiway' ? 'graf-btn-primary' : 'graf-btn-outline'}`}
            onClick={() => setMode('multiway')}
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
                onChange={(v) => setInput((prev) => ({ ...prev, drive_voltage_rms: v }))} />
              <NumericInput label="F start" value={input.freq_start_hz} step={1} min={1} unit="Hz"
                tooltip="Sweep start frequency."
                onChange={(v) => setInput((prev) => ({ ...prev, freq_start_hz: v }))} />
              <NumericInput label="F end" value={input.freq_end_hz} step={1000} min={100} unit="Hz"
                tooltip="Sweep end frequency."
                onChange={(v) => setInput((prev) => ({ ...prev, freq_end_hz: v }))} />
              <NumericInput label="Points" value={input.freq_points} step={100} min={50} max={2000}
                tooltip="Frequency points."
                onChange={(v) => setInput((prev) => ({ ...prev, freq_points: Math.round(v) }))} />
            </div>
            <SaveLoadControls input={input} onLoad={setInput} />
            <ExportControls result={singleResult} />
            <ImportOverlay overlay={overlay} onChange={setOverlay} />
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
          </>
        )}

        {error && (
          <div style={{ color: 'var(--graf-danger)', fontSize: 12, marginTop: 8 }}>{error}</div>
        )}
      </aside>

      <main className="app-main">
        {mode === 'single' && <PlotArea result={singleResult} xmaxMm={input.driver.xmax_m * 1000} overlay={overlay} />}
        {mode === 'multiway' && <SystemPlotArea result={systemResult} />}
      </main>
    </div>
  );
}

export default App;
