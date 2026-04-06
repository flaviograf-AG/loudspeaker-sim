import { useEffect, useState } from 'react';
import { initSolver } from './solver/wasm-bridge';
import { useSolver } from './hooks/useSolver';
import { PlotArea } from './components/PlotArea';
import { DriverInputs } from './components/DriverInputs';
import { EnclosureInputs } from './components/EnclosureInputs';
import { PresetSelector } from './components/PresetSelector';
import { SaveLoadControls } from './components/SaveLoadControls';
import { ExportControls } from './components/ExportControls';
import { NumericInput } from './components/NumericInput';
import type { SimulationInput, DriverParams, EnclosureConfig } from './types';

const DEFAULT_INPUT: SimulationInput = {
  driver: {
    fs_hz: 37,
    re_ohm: 6.5,
    le_h: 0.5e-3,
    qes: 0.42,
    qms: 3.5,
    vas_m3: 18e-3,
    sd_m2: 132e-4,
    xmax_m: 6e-3,
  },
  enclosure: {
    type: 'Sealed',
    volume_m3: 18e-3,
    ql: 7,
  },
  freq_start_hz: 10,
  freq_end_hz: 20000,
  freq_points: 500,
  drive_voltage_rms: 2.83,
};

function App() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [input, setInput] = useState<SimulationInput>(DEFAULT_INPUT);
  const { result, error: solveError } = useSolver(input, ready);

  useEffect(() => {
    initSolver()
      .then(() => setReady(true))
      .catch((e) => setInitError(String(e)));
  }, []);

  const updateDriver = (driver: DriverParams) => setInput((prev) => ({ ...prev, driver }));
  const updateEnclosure = (enclosure: EnclosureConfig) => setInput((prev) => ({ ...prev, enclosure }));

  // Derived driver params for enclosure readouts
  const qts = (input.driver.qes * input.driver.qms) / (input.driver.qes + input.driver.qms);

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
        <h1 style={{ fontSize: 'var(--graf-font-size-lg, 18px)', color: 'var(--graf-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/favicon/favicon.svg" alt="LS" width={28} height={28} />
          Loudspeaker Sim
        </h1>
        <PresetSelector onSelect={updateDriver} />
        <DriverInputs params={input.driver} onChange={updateDriver} />
        <EnclosureInputs
          config={input.enclosure}
          driverVas={input.driver.vas_m3}
          driverFs={input.driver.fs_hz}
          driverQts={qts}
          onChange={updateEnclosure}
        />

        <div className="section-card">
          <div className="section-title">Simulation</div>
          <NumericInput label="Drive" value={input.drive_voltage_rms} step={0.1} min={0.1} unit="V rms"
            tooltip="Amplifier drive voltage (RMS). 2.83V = 1W into 8Ω (standard reference). 1V for sensitivity comparison."
            onChange={(v) => setInput((prev) => ({ ...prev, drive_voltage_rms: v }))} />
          <NumericInput label="F start" value={input.freq_start_hz} step={1} min={1} unit="Hz"
            tooltip="Sweep start frequency. 10-20 Hz typical for subwoofers, 100 Hz for midrange/tweeter."
            onChange={(v) => setInput((prev) => ({ ...prev, freq_start_hz: v }))} />
          <NumericInput label="F end" value={input.freq_end_hz} step={1000} min={100} unit="Hz"
            tooltip="Sweep end frequency. 20000 Hz for full audio range."
            onChange={(v) => setInput((prev) => ({ ...prev, freq_end_hz: v }))} />
          <NumericInput label="Points" value={input.freq_points} step={100} min={50} max={2000}
            tooltip="Number of frequency points in the sweep. More points = smoother curves but slower. 500 is typical."
            onChange={(v) => setInput((prev) => ({ ...prev, freq_points: Math.round(v) }))} />
        </div>

        <SaveLoadControls input={input} onLoad={setInput} />
        <ExportControls result={result} />
        {solveError && (
          <div style={{ color: 'var(--graf-danger)', fontSize: 12, marginTop: 8 }}>{solveError}</div>
        )}
      </aside>
      <main className="app-main">
        <PlotArea result={result} xmaxMm={input.driver.xmax_m * 1000} />
      </main>
    </div>
  );
}

export default App;
