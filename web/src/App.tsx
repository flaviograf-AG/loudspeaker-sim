import { useEffect, useState, useRef, useCallback } from 'react';
import { useUndoRedo } from './hooks/useUndoRedo';
import { decodeFromUrl, useUrlState, encodeToUrl } from './hooks/useUrlState';
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
import { SchematicPanel } from './components/SchematicPanel';
import { BiquadExport } from './components/BiquadExport';
import { OptimizerPanel } from './components/OptimizerPanel';
import { SetupWizard } from './components/SetupWizard';
import { AccordionSection } from './components/AccordionSection';
import { driverSummary, enclosureSummary, crossoverSummary } from './components/WaySummary';
import { buildWaysFromSetup } from './systemSetup';
import type { SimulationInput, DriverParams, EnclosureConfig, WayInput, SystemInput, SystemTopology } from './types';

const DEFAULT_SYSTEM_INPUT: SystemInput = {
  ways: buildWaysFromSetup('2-way', ['Sealed', 'Sealed']),
  freq_start_hz: 10,
  freq_end_hz: 20000,
  freq_points: 500,
  drive_voltage_rms: 2.83,
};

function App() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const dragging = useRef(false);

  // Setup wizard state
  const [showSetup, setShowSetup] = useState(true);
  const [topology, setTopology] = useState<SystemTopology>('2-way');

  // Accordion state
  const [activeWay, setActiveWay] = useState(0);
  const [activeSection, setActiveSection] = useState<'driver' | 'enclosure' | 'crossover' | 'system'>('driver');

  // Overlay (imported FRD/ZMA)
  const [overlay, setOverlay] = useState<OverlayData>({ frd: null, zma: null });

  // Comparison snapshots
  const [snapshots, setSnapshots] = useState<{ name: string; spl: number[]; freqs: number[] }[]>([]);

  // Unified state with undo/redo
  // Try to restore from URL first
  const urlState = decodeFromUrl();
  const initialSystem = urlState ?? DEFAULT_SYSTEM_INPUT;
  const sysUndo = useUndoRedo<SystemInput>(initialSystem);
  const systemInput = sysUndo.value;
  const setSystemInput = sysUndo.set;

  // Skip wizard if we loaded from URL
  const [didInit] = useState(() => {
    if (urlState) return true;
    return false;
  });
  useEffect(() => {
    if (didInit) setShowSetup(false);
  }, [didInit]);

  // URL state sync
  useUrlState(systemInput);

  // Determine single vs multi-way
  const isMultiWay = systemInput.ways.length > 1;

  // Extract single-driver input for 1-way systems
  const singleInput: SimulationInput | null = !isMultiWay && systemInput.ways[0]
    ? {
        driver: systemInput.ways[0].driver,
        enclosure: systemInput.ways[0].enclosure,
        freq_start_hz: systemInput.freq_start_hz,
        freq_end_hz: systemInput.freq_end_hz,
        freq_points: systemInput.freq_points,
        drive_voltage_rms: systemInput.drive_voltage_rms,
      }
    : null;

  // Use appropriate solver
  const { result: singleResult, error: singleError } = useSolver(
    singleInput ?? { driver: systemInput.ways[0].driver, enclosure: systemInput.ways[0].enclosure, freq_start_hz: 10, freq_end_hz: 20000, freq_points: 500, drive_voltage_rms: 2.83 },
    ready && singleInput !== null
  );
  const { result: systemResult, error: systemError } = useSystemSolver(
    isMultiWay ? systemInput : null,
    ready
  );

  const error = isMultiWay ? systemError : singleError;

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

  useEffect(() => {
    initSolver()
      .then(() => setReady(true))
      .catch((e) => setInitError(String(e)));
  }, []);

  // --- Way update helpers ---
  const updateWay = (idx: number, updates: Partial<WayInput>) => {
    const newWays = [...systemInput.ways];
    newWays[idx] = { ...newWays[idx], ...updates };
    setSystemInput({ ...systemInput, ways: newWays });
  };

  const updateDriver = (driver: DriverParams) => updateWay(activeWay, { driver });
  const updateEnclosure = (enclosure: EnclosureConfig) => updateWay(activeWay, { enclosure });

  const handleSetupComplete = (topo: SystemTopology, ways: WayInput[]) => {
    setTopology(topo);
    setSystemInput({ ...systemInput, ways });
    setShowSetup(false);
    setActiveWay(0);
    setActiveSection('driver');
  };

  // Clamp activeWay
  const safeActiveWay = Math.min(activeWay, systemInput.ways.length - 1);
  if (safeActiveWay !== activeWay) setActiveWay(safeActiveWay);
  const way = systemInput.ways[safeActiveWay];

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
      {showSetup && <SetupWizard onComplete={handleSetupComplete} initialTopology={topology} />}

      <div className="sidebar-drag-handle" style={{ left: sidebarWidth - 3 }} onMouseDown={onDragStart} />
      <aside className="app-sidebar" style={{ width: sidebarWidth }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h1 style={{ fontSize: 'var(--graf-font-size-lg, 18px)', color: 'var(--graf-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/favicon/favicon.svg" alt="LS" width={28} height={28} />
            Loudspeaker Sim
          </h1>
          <button
            className="graf-btn graf-btn-sm graf-btn-outline"
            onClick={() => setShowSetup(true)}
            title="Change system topology — opens the setup wizard"
          >Change System</button>
        </div>

        {/* Way tabs */}
        {systemInput.ways.length > 1 && (
          <div className="btn-row" style={{ marginBottom: 8 }}>
            {systemInput.ways.map((w, i) => (
              <button key={i}
                className={`graf-btn graf-btn-sm ${i === safeActiveWay ? 'graf-btn-primary' : 'graf-btn-outline'}`}
                onClick={() => setActiveWay(i)}
                title={`${w.name}${w.enabled ? '' : ' (disabled)'}`}
              >
                {w.name}{!w.enabled && ' \u2298'}
              </button>
            ))}
          </div>
        )}

        {/* Accordion: Driver */}
        {way && (
          <>
            <AccordionSection
              title="Driver"
              summary={driverSummary(way)}
              expanded={activeSection === 'driver'}
              onToggle={() => setActiveSection(activeSection === 'driver' ? 'system' : 'driver')}
            >
              <PresetSelector onSelect={updateDriver} />
              <DriverInputs params={way.driver} onChange={updateDriver} />
            </AccordionSection>

            {/* Accordion: Enclosure */}
            <AccordionSection
              title="Enclosure"
              summary={enclosureSummary(way)}
              expanded={activeSection === 'enclosure'}
              onToggle={() => setActiveSection(activeSection === 'enclosure' ? 'system' : 'enclosure')}
            >
              <EnclosureInputs
                config={way.enclosure}
                driverVas={way.driver.vas_m3}
                driverFs={way.driver.fs_hz}
                driverQts={(way.driver.qes * way.driver.qms) / (way.driver.qes + way.driver.qms)}
                onChange={updateEnclosure}
                lockType
                onChangeType={() => setShowSetup(true)}
              />
            </AccordionSection>

            {/* Accordion: Crossover */}
            <AccordionSection
              title="Crossover"
              summary={crossoverSummary(way)}
              expanded={activeSection === 'crossover'}
              onToggle={() => setActiveSection(activeSection === 'crossover' ? 'system' : 'crossover')}
            >
              {/* Way controls: gain, delay, z-offset, on/inv */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <label title="Enable/disable this way" style={{ fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={way.enabled}
                      onChange={(e) => updateWay(safeActiveWay, { enabled: e.target.checked })} /> On
                  </label>
                  <label title="Invert polarity (180deg phase flip)" style={{ fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={way.inverted}
                      onChange={(e) => updateWay(safeActiveWay, { inverted: e.target.checked })} /> Inv
                  </label>
                </div>
              </div>
              <NumericInput label="Gain" value={way.gain_db} step={0.5} min={-20} max={20} unit="dB"
                tooltip="Per-way level adjustment. Use to match sensitivity between drivers."
                onChange={(v) => updateWay(safeActiveWay, { gain_db: v })} />
              <NumericInput label="Delay" value={way.delay_s * 1e6} step={10} min={0} unit="us"
                tooltip="Per-way time delay for alignment. 29 us = 1 cm acoustic path difference."
                onChange={(v) => updateWay(safeActiveWay, { delay_s: v / 1e6 })} />
              <NumericInput label="Z offset" value={way.z_offset_m * 100} step={0.5} min={-20} max={20} unit="cm"
                tooltip="Physical depth offset from reference plane. Positive = recessed."
                onChange={(v) => updateWay(safeActiveWay, { z_offset_m: v / 100 })} />

              {/* Active + passive filters — reuse MultiWayEditor's filter sections */}
              <MultiWayEditor
                ways={systemInput.ways}
                onChange={(newWays) => setSystemInput({ ...systemInput, ways: newWays })}
                activeWayOverride={safeActiveWay}
                crossoverOnly
              />
            </AccordionSection>

            {/* Accordion: System */}
            <AccordionSection
              title="System"
              summary="Settings, export, compare"
              expanded={activeSection === 'system'}
              onToggle={() => setActiveSection(activeSection === 'system' ? 'driver' : 'system')}
            >
              <div className="section-card">
                <div className="section-title">Simulation</div>
                <NumericInput label="Drive" value={systemInput.drive_voltage_rms} step={0.1} min={0.1} unit="V rms"
                  tooltip="Amplifier drive voltage (RMS). 2.83V = 1W into 8ohm."
                  onChange={(v) => setSystemInput({ ...systemInput, drive_voltage_rms: v })} />
                <NumericInput label="F start" value={systemInput.freq_start_hz} step={1} min={1} unit="Hz"
                  tooltip="Sweep start frequency."
                  onChange={(v) => setSystemInput({ ...systemInput, freq_start_hz: v })} />
                <NumericInput label="F end" value={systemInput.freq_end_hz} step={1000} min={100} unit="Hz"
                  tooltip="Sweep end frequency."
                  onChange={(v) => setSystemInput({ ...systemInput, freq_end_hz: v })} />
                <NumericInput label="Points" value={systemInput.freq_points} step={100} min={50} max={2000}
                  tooltip="Frequency points."
                  onChange={(v) => setSystemInput({ ...systemInput, freq_points: Math.round(v) })} />
              </div>

              {isMultiWay && (
                <OptimizerPanel
                  ways={systemInput.ways}
                  sysParams={{
                    freq_start_hz: systemInput.freq_start_hz,
                    freq_end_hz: systemInput.freq_end_hz,
                    freq_points: systemInput.freq_points,
                    drive_voltage_rms: systemInput.drive_voltage_rms,
                  }}
                  onApply={(newWays) => setSystemInput({ ...systemInput, ways: newWays })}
                />
              )}

              <SaveLoadControls input={singleInput ?? { driver: way.driver, enclosure: way.enclosure, freq_start_hz: systemInput.freq_start_hz, freq_end_hz: systemInput.freq_end_hz, freq_points: systemInput.freq_points, drive_voltage_rms: systemInput.drive_voltage_rms }} onLoad={(loaded) => {
                // Legacy load: single SimulationInput → 1-way system
                setTopology('1-way');
                setSystemInput({
                  ways: [{
                    name: 'Full Range',
                    driver: loaded.driver,
                    enclosure: loaded.enclosure,
                    passive_filters: [],
                    active_filters: [],
                    gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
                  }],
                  freq_start_hz: loaded.freq_start_hz,
                  freq_end_hz: loaded.freq_end_hz,
                  freq_points: loaded.freq_points,
                  drive_voltage_rms: loaded.drive_voltage_rms,
                });
              }} />

              {!isMultiWay && <ExportControls result={singleResult} />}
              {isMultiWay && (
                <div className="section-card">
                  <div className="section-title">Export</div>
                  <div className="btn-row">
                    <BiquadExport ways={systemInput.ways} />
                  </div>
                </div>
              )}

              <ImportOverlay overlay={overlay} onChange={setOverlay} />

              {/* Compare: Snapshot, Undo, Redo, Share */}
              <div className="section-card">
                <div className="section-title">Compare</div>
                <div className="btn-row">
                  <button className="graf-btn graf-btn-sm graf-btn-outline"
                    title="Save current SPL curve as a comparison snapshot"
                    onClick={() => {
                      const result = isMultiWay ? systemResult : singleResult;
                      if (result) {
                        const freqs = 'frequencies_hz' in result ? result.frequencies_hz : [];
                        const spl = 'system_spl_db' in result ? result.system_spl_db : ('spl_db' in result ? result.spl_db : []);
                        const name = `Snap ${snapshots.length + 1}`;
                        setSnapshots(prev => [...prev, { name, spl: [...spl], freqs: [...freqs] }]);
                      }
                    }}>Snapshot</button>
                  {snapshots.length > 0 && (
                    <button className="graf-btn graf-btn-sm" style={{ color: 'var(--graf-danger)' }}
                      onClick={() => setSnapshots([])}>Clear</button>
                  )}
                  <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={sysUndo.undo}
                    disabled={!sysUndo.canUndo} title="Undo (Ctrl+Z)">Undo</button>
                  <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={sysUndo.redo}
                    disabled={!sysUndo.canRedo} title="Redo (Ctrl+Y)">Redo</button>
                  <button className="graf-btn graf-btn-sm graf-btn-outline"
                    title="Copy shareable URL to clipboard"
                    onClick={() => {
                      const url = encodeToUrl(systemInput);
                      navigator.clipboard.writeText(url);
                    }}>Share</button>
                </div>
                {snapshots.map((s, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--graf-warm-500)' }}>
                    {s.name}
                    <button className="graf-btn graf-btn-sm" style={{ padding: '0 3px', fontSize: 9, marginLeft: 4 }}
                      onClick={() => setSnapshots(prev => prev.filter((_, j) => j !== i))}>x</button>
                  </div>
                ))}
              </div>
            </AccordionSection>
          </>
        )}

        {error && (
          <div style={{ color: 'var(--graf-danger)', fontSize: 12, marginTop: 8 }}>{error}</div>
        )}
      </aside>

      <main className="app-main" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isMultiWay
            ? <SystemPlotArea result={systemResult} />
            : <PlotArea result={singleResult} xmaxMm={way ? way.driver.xmax_m * 1000 : 6} overlay={overlay} snapshots={snapshots} />
          }
        </div>
        {way && (
          <SchematicPanel
            enclosureConfig={way.enclosure}
            driverSd={way.driver.sd_m2}
            passiveFilters={way.passive_filters.length > 0 ? way.passive_filters : undefined}
            driverRe={way.driver.re_ohm}
          />
        )}
      </main>
    </div>
  );
}

export default App;
