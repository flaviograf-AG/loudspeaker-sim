import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useUndoRedo } from './hooks/useUndoRedo';
import { useUrlSync, decodeFromUrl } from './hooks/useUrlSync';
import { initSolver } from './solver/wasm-bridge';
import { useSolver } from './hooks/useSolver';
import { useSystemSolver } from './hooks/useSystemSolver';
import { buildSolverInput, defaultDesign } from './compute';
import { defaultCrossoverPoints } from './crossover';
import { SystemPlotArea } from './components/SystemPlotArea';
import { EnclosureInputs } from './components/EnclosureInputs';
import { type OverlayData } from './components/ImportOverlay';
import { SchematicPanel } from './components/SchematicPanel';
import { AccordionSection } from './components/AccordionSection';
import { WayEditor } from './components/WayEditor';
import { CrossoverPanel } from './components/CrossoverPanel';
import { SystemPanel } from './components/SystemPanel';
import { SetupWizard } from './components/SetupWizard';
import type { SimulationInput, DesignState, WayDesign, WayInput, CrossoverPoint, ActiveFilter, SystemTopology } from './types';

function App() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const dragging = useRef(false);

  // Setup wizard
  const [showSetup, setShowSetup] = useState(true);

  // Accordion + way selection (ephemeral UI state)
  const [activeWay, setActiveWay] = useState(0);
  const [activeSection, setActiveSection] = useState<'driver' | 'enclosure' | 'crossover' | 'system'>('driver');

  // Overlay (imported FRD/ZMA for plot comparison)
  const [overlay, setOverlay] = useState<OverlayData>({ frd: null, zma: null });
  const [snapshots, setSnapshots] = useState<{ name: string; spl: number[]; freqs: number[] }[]>([]);

  // === Single source of truth ===
  const urlState = decodeFromUrl();
  const initialDesign = urlState ?? defaultDesign();
  const designUndo = useUndoRedo<DesignState>(initialDesign);

  // Skip wizard if loaded from URL
  const [didInit] = useState(() => urlState !== null);
  useEffect(() => {
    if (didInit) setShowSetup(false);
  }, [didInit]);
  const design = designUndo.value;
  const setDesign = designUndo.set;

  // Ref for stable callbacks — avoids recreating every render
  const designRef = useRef(design);
  designRef.current = design;

  // URL sync
  useUrlSync(design);

  // Build solver input (pure, computed)
  const solverInput = useMemo(() => buildSolverInput(design), [design]);
  const isMultiWay = design.ways.length > 1;

  // Always use system solver — it handles passive filters, active filters,
  // measured data, gain, delay, inversion. The single-driver solver doesn't.
  const { result: systemResult, error: systemError } = useSystemSolver(
    solverInput,
    ready
  );

  // Supplementary single-driver solve for 1-way: displacement, port velocity.
  // Only when NOT using measured data (measured data has no displacement info).
  const needsSupplement = !isMultiWay && !design.ways[0]?.measured;
  const supplementInput: SimulationInput | null = needsSupplement && solverInput.ways[0]
    ? {
        driver: solverInput.ways[0].driver,
        enclosure: solverInput.ways[0].enclosure,
        freq_start_hz: solverInput.freq_start_hz,
        freq_end_hz: solverInput.freq_end_hz,
        freq_points: solverInput.freq_points,
        drive_voltage_rms: solverInput.drive_voltage_rms,
      }
    : null;
  const { result: supplementResult } = useSolver(
    supplementInput ?? { driver: solverInput.ways[0].driver, enclosure: solverInput.ways[0].enclosure, freq_start_hz: 10, freq_end_hz: 20000, freq_points: 500, drive_voltage_rms: 2.83 },
    ready && supplementInput !== null
  );
  const error = systemError;

  // Expose solver result for E2E tests
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__solverResult = systemResult;
  }, [systemResult]);

  // WASM init
  useEffect(() => {
    initSolver()
      .then(() => setReady(true))
      .catch((e) => setInitError(String(e)));
  }, []);

  // Clamp activeWay
  const safeActiveWay = Math.min(Math.max(0, activeWay), Math.max(0, design.ways.length - 1));
  useEffect(() => {
    if (activeWay >= design.ways.length && design.ways.length > 0) {
      setActiveWay(design.ways.length - 1);
    }
  }, [activeWay, design.ways.length]);
  const way = design.ways[safeActiveWay];

  // --- Stable update helpers (use designRef to avoid closure over design) ---
  const updateWay = useCallback((idx: number, updates: Partial<WayDesign>) => {
    const d = designRef.current;
    setDesign({
      ...d,
      ways: d.ways.map((w, i) => i === idx ? { ...w, ...updates } : w),
    });
  }, [setDesign]);

  const updateCrossoverPoints = useCallback((points: CrossoverPoint[]) => {
    setDesign({ ...designRef.current, crossover_points: points });
  }, [setDesign]);

  const updatePerWayEq = useCallback((wayIndex: number, eq: ActiveFilter[]) => {
    const d = designRef.current;
    const newEq = [...d.per_way_eq];
    newEq[wayIndex] = eq;
    setDesign({ ...d, per_way_eq: newEq });
  }, [setDesign]);

  // Setup wizard callback — converts WayInput[] to DesignState
  const handleSetupComplete = useCallback((topo: SystemTopology, ways: WayInput[]) => {
    const d = designRef.current;
    const points = defaultCrossoverPoints(topo);
    setDesign({
      version: 2,
      topology: topo,
      ways: ways.map(w => ({
        name: w.name,
        driver: w.driver,
        enclosure: w.enclosure,
        passive_filters: w.passive_filters,
        gain_db: w.gain_db,
        delay_s: w.delay_s,
        inverted: w.inverted,
        z_offset_m: w.z_offset_m,
        enabled: w.enabled,
        preset_name: w.preset_name,
        measured: w.measured,
      })),
      crossover_points: points,
      per_way_eq: ways.map(() => []),
      freq_start_hz: d.freq_start_hz,
      freq_end_hz: d.freq_end_hz,
      freq_points: d.freq_points,
      drive_voltage_rms: d.drive_voltage_rms,
      source_impedance_ohm: d.source_impedance_ohm,
    });
    setShowSetup(false);
    setActiveWay(0);
    setActiveSection('driver');
  }, [setDesign]);

  // Sidebar resize
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

  // Crossover summary for accordion
  const xoverSummary = design.crossover_points.length > 0
    ? design.crossover_points.map(pt => `${pt.freq_hz}Hz ${pt.slope}`).join(', ')
    : 'No crossover';

  // Way summary helpers
  const driverSummary = (w: WayDesign) => {
    const d = w.driver;
    const qts = ((d.qes * d.qms) / (d.qes + d.qms)).toFixed(2);
    return `${w.preset_name || 'Custom'} \u00B7 ${d.fs_hz}Hz \u00B7 ${d.re_ohm}\u03A9 \u00B7 Qts ${qts}`;
  };
  const enclosureSummary = (w: WayDesign) => {
    const enc = w.enclosure;
    switch (enc.type) {
      case 'Sealed': return `Sealed ${(enc.volume_m3 * 1000).toFixed(1)}L`;
      case 'Vented': return `Vented ${(enc.volume_m3 * 1000).toFixed(1)}L`;
      case 'TransmissionLine': return `T-Line ${(enc.length_m * 100).toFixed(0)}cm`;
      case 'Horn': return `Horn ${enc.segments.length} seg`;
      case 'Bandpass': return `BP ${(enc.rear_volume_m3 * 1000).toFixed(1)}+${(enc.front_volume_m3 * 1000).toFixed(1)}L`;
      case 'PassiveRadiator': return `PR ${(enc.volume_m3 * 1000).toFixed(1)}L`;
      case 'OpenBaffle': return `OB ${(enc.width_m * 100).toFixed(0)}\u00D7${(enc.height_m * 100).toFixed(0)}cm`;
    }
  };

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
      {showSetup && <SetupWizard onComplete={handleSetupComplete} initialTopology={design.topology} />}

      <div
        className="sidebar-drag-handle"
        style={{ left: sidebarWidth - 3 }}
        onMouseDown={onDragStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setSidebarWidth(w => Math.max(260, w - 10));
          if (e.key === 'ArrowRight') setSidebarWidth(w => Math.min(500, w + 10));
        }}
      />
      <aside className="app-sidebar" style={{ width: sidebarWidth }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
          <h1 style={{ fontSize: 'var(--graf-font-size-lg, 18px)', color: 'var(--graf-primary)', display: 'flex', alignItems: 'center', gap: 8, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <img src="/favicon/favicon.svg" alt="LS" width={28} height={28} style={{ flexShrink: 0 }} />
            Loudspeaker Sim
          </h1>
          <button
            className="graf-btn graf-btn-sm graf-btn-outline"
            onClick={() => setShowSetup(true)}
            title="Change system topology — opens the setup wizard"
            style={{ flexShrink: 0 }}
          >Change System</button>
        </div>

        {/* Way tabs */}
        {design.ways.length > 1 && (
          <div className="btn-row" style={{ marginBottom: 8 }}>
            {design.ways.map((w, i) => (
              <button key={`way-${w.name}-${i}`}
                className={`graf-btn graf-btn-sm ${i === safeActiveWay ? 'graf-btn-primary' : 'graf-btn-outline'}`}
                onClick={() => setActiveWay(i)}
                title={`${w.name}${w.enabled ? '' : ' (disabled)'}`}
              >
                {w.name}{!w.enabled && ' \u2298'}
              </button>
            ))}
          </div>
        )}

        {/* Measured data status banner */}
        {way?.measured && (
          <div style={{
            fontSize: 10, padding: '3px 8px', marginBottom: 6, borderRadius: 4,
            background: 'var(--graf-warm-100, #f0ede8)', border: '1px solid var(--graf-warm-300, #d4cfc7)',
          }}>
            <strong>{way.name}:</strong>{' '}
            FRD: {way.measured.spl_db.length > 0 ? `${way.measured.spl_db.length} pts` : 'none'}
            {' | '}
            ZMA: {way.measured.impedance_ohm.length > 0 ? `${way.measured.impedance_ohm.length} pts` : 'none'}
            {' \u2014 measured data active (T/S bypassed)'}
          </div>
        )}

        {/* Accordion sections */}
        {way && (
          <>
            <AccordionSection
              title="Driver"
              summary={driverSummary(way)}
              expanded={activeSection === 'driver'}
              onToggle={() => setActiveSection(activeSection === 'driver' ? 'system' : 'driver')}
            >
              <WayEditor
                way={way}
                onUpdate={(updates) => updateWay(safeActiveWay, updates)}
              />
            </AccordionSection>

            <AccordionSection
              title="Enclosure"
              summary={enclosureSummary(way)}
              expanded={activeSection === 'enclosure'}
              onToggle={() => setActiveSection(activeSection === 'enclosure' ? 'system' : 'enclosure')}
            >
              <EnclosureInputs
                config={way.enclosure}
                driver={way.driver}
                driverVas={way.driver.vas_m3}
                driverFs={way.driver.fs_hz}
                driverQts={(way.driver.qes * way.driver.qms) / (way.driver.qes + way.driver.qms)}
                hpCrossoverHz={design.crossover_points.find(pt => pt.high_way_index === safeActiveWay)?.freq_hz}
                onChange={(enc) => updateWay(safeActiveWay, { enclosure: enc })}
                lockType
                onChangeType={() => setShowSetup(true)}
                disabled={!!way.measured}
                disabledReason="Enclosure model bypassed — using measured FRD response."
              />
            </AccordionSection>

            <AccordionSection
              title="Crossover"
              summary={xoverSummary}
              expanded={activeSection === 'crossover'}
              onToggle={() => setActiveSection(activeSection === 'crossover' ? 'system' : 'crossover')}
            >
              <CrossoverPanel
                design={design}
                activeWay={safeActiveWay}
                onUpdatePoints={updateCrossoverPoints}
                onUpdateEq={updatePerWayEq}
                onUpdateWay={updateWay}
              />
            </AccordionSection>

            <AccordionSection
              title="System"
              summary="Settings, export, compare"
              expanded={activeSection === 'system'}
              onToggle={() => setActiveSection(activeSection === 'system' ? 'driver' : 'system')}
            >
              <SystemPanel
                design={design}
                solverInput={solverInput}
                systemResult={systemResult}
                isMultiWay={isMultiWay}
                onUpdateDesign={(updates) => setDesign({ ...designRef.current, ...updates })}
                onSetDesign={setDesign}
                overlay={overlay}
                onSetOverlay={setOverlay}
                snapshots={snapshots}
                onSetSnapshots={setSnapshots}
                designUndo={designUndo}
              />
            </AccordionSection>
          </>
        )}

        {error && (
          <div style={{ color: 'var(--graf-danger)', fontSize: 12, marginTop: 8 }}>{error}</div>
        )}
      </aside>

      <main className="app-main" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <SystemPlotArea
            result={systemResult}
            supplement={supplementResult}
            xmaxMm={way ? way.driver.xmax_m * 1000 : 6}
            overlay={overlay}
            snapshots={snapshots}
          />
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
