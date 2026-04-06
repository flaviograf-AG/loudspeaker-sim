import { useEffect, useState } from 'react';
import { initSolver } from './solver/wasm-bridge';
import { useSolver } from './hooks/useSolver';
import { PlotArea } from './components/PlotArea';
import { DriverInputs } from './components/DriverInputs';
import { EnclosureInputs } from './components/EnclosureInputs';
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
  const { result, error: solveError } = useSolver(input);

  useEffect(() => {
    initSolver()
      .then(() => setReady(true))
      .catch((e) => setInitError(String(e)));
  }, []);

  const updateDriver = (driver: DriverParams) => setInput((prev) => ({ ...prev, driver }));
  const updateEnclosure = (enclosure: EnclosureConfig) => setInput((prev) => ({ ...prev, enclosure }));

  if (initError) return <div style={{ color: 'red', padding: 20 }}>Failed to load solver: {initError}</div>;
  if (!ready) return <div style={{ padding: 20 }}>Loading WASM solver...</div>;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{ width: 280, padding: 12, overflowY: 'auto', borderRight: '1px solid #ddd', flexShrink: 0 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Loudspeaker Simulator</h2>
        <DriverInputs params={input.driver} onChange={updateDriver} />
        <EnclosureInputs config={input.enclosure} onChange={updateEnclosure} />
        {solveError && <div style={{ color: 'red', fontSize: 12, marginTop: 8 }}>{solveError}</div>}
      </aside>
      <main style={{ flex: 1, padding: 12, overflowY: 'auto' }}>
        <PlotArea result={result} xmaxMm={input.driver.xmax_m * 1000} />
      </main>
    </div>
  );
}

export default App;
