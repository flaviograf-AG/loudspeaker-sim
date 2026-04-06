import { useEffect, useState } from 'react';
import { initSolver } from './solver/wasm-bridge';
import { useSolver } from './hooks/useSolver';
import { PlotArea } from './components/PlotArea';
import { DriverInputs } from './components/DriverInputs';
import { EnclosureInputs } from './components/EnclosureInputs';
import { PresetSelector } from './components/PresetSelector';
import { SaveLoadControls } from './components/SaveLoadControls';
import { ExportControls } from './components/ExportControls';
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
  freq_start_hz: 20,
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
        <h1 style={{ fontSize: 'var(--graf-font-size-lg, 18px)', color: 'var(--graf-primary)', marginBottom: 12 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, verticalAlign: -4 }}>speaker</span>
          {' '}Loudspeaker Sim
        </h1>
        <PresetSelector onSelect={updateDriver} />
        <DriverInputs params={input.driver} onChange={updateDriver} />
        <EnclosureInputs config={input.enclosure} onChange={updateEnclosure} />
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
