import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useUndoRedo } from './hooks/useUndoRedo';
import { useUrlSync, decodeFromUrl } from './hooks/useUrlSync';
import { initSolver } from './solver/wasm-bridge';
import { useSolver } from './hooks/useSolver';
import { useSystemSolver } from './hooks/useSystemSolver';
import { buildSolverInput, defaultDesign, computeGoldenCabinetDimensions } from './compute';
import { computeDefaultEnclosure } from './systemSetup';
import { defaultCrossoverPoints } from './crossover';
import type { CoaxialDriverPreset } from './presets/drivers_db';
import { SystemPlotArea } from './components/SystemPlotArea';
import { EnclosureInputs } from './components/EnclosureInputs';
import { CabinetCalculator, getEnclosureVolumeLiters } from './components/CabinetCalculator';
import { SharedSystemBar, type WorkspaceTab } from './components/SharedSystemBar';
import { type OverlayData } from './components/ImportOverlay';
import { SchematicPanel } from './components/SchematicPanel';
import { AccordionSection } from './components/AccordionSection';
import { WayEditor } from './components/WayEditor';
import { CrossoverPanel } from './components/CrossoverPanel';
import { SystemPanel } from './components/SystemPanel';
import { SetupWizard } from './components/SetupWizard';
import type {
  SimulationInput,
  DesignState,
  WayDesign,
  WayInput,
  CrossoverPoint,
  ActiveFilter,
  SystemTopology,
  CabinetDimensions,
} from './types';

function App() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(370);
  const dragging = useRef(false);

  // Setup wizard
  const [showSetup, setShowSetup] = useState(true);

  // Accordion + way selection + workspace tab (ephemeral UI state)
  const [activeWay, setActiveWay] = useState(0);
  const [activeSection, setActiveSection] = useState<'driver' | 'enclosure' | 'crossover' | 'system'>('driver');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('workbench');

  // Overlay (imported FRD/ZMA for plot comparison)
  const [overlay, setOverlay] = useState<OverlayData>({ frd: null, zma: null });
  const [snapshots, setSnapshots] = useState<{ name: string; spl: number[]; freqs: number[] }[]>([]);

  // === Single source of truth ===
  const urlState = decodeFromUrl();
  const initialDesign = urlState ?? defaultDesign();
  const designUndo = useUndoRedo<DesignState>(initialDesign);

  // Skip wizard if loaded from URL
  const [didInit] = useState(() => urlState !== null);
  const [hasCompletedSetup, setHasCompletedSetup] = useState(() => urlState !== null);
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
  // measured data, gain, delay, inversion, and per-way excursion/port velocity.
  const { result: systemResult, error: systemError } = useSystemSolver(
    solverInput,
    ready
  );

  // Supplementary single-driver solve for 1-way fallback
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

  // --- Stable update helpers (keep designRef.current synchronously updated so back-to-back calls compose) ---
  const commitDesign = useCallback((next: DesignState) => {
    designRef.current = next;
    setDesign(next);
  }, [setDesign]);

  const updateWay = useCallback((idx: number, updates: Partial<WayDesign>) => {
    const d = designRef.current;
    const nextWays = d.ways.map((w, i) => (i === idx ? { ...w, ...updates } : w));
    let nextCabinet = d.cabinet;
    // If primary woofer enclosure volume changed and cabinet sync is enabled, update shared cabinet dimensions
    if (idx === 0 && updates.enclosure && (!d.cabinet || d.cabinet.sync_with_enclosure)) {
      const volL = getEnclosureVolumeLiters(updates.enclosure);
      if (volL > 0) {
        nextCabinet = computeGoldenCabinetDimensions(
          volL,
          d.cabinet?.wall_thickness_mm ?? 18,
          d.cabinet?.bracing_volume_l ?? 0.8,
          d.cabinet?.driver_displacement_l ?? 0.5
        );
      }
    }
    commitDesign({
      ...d,
      cabinet: nextCabinet,
      ways: nextWays,
    });
  }, [commitDesign]);

  const updateDesign = useCallback((updates: Partial<DesignState>) => {
    commitDesign({ ...designRef.current, ...updates });
  }, [commitDesign]);

  const updateCabinet = useCallback((cab: CabinetDimensions) => {
    commitDesign({ ...designRef.current, cabinet: cab });
  }, [commitDesign]);

  const updateCrossoverPoints = useCallback((points: CrossoverPoint[]) => {
    commitDesign({ ...designRef.current, crossover_points: points });
  }, [commitDesign]);

  const updatePerWayEq = useCallback((wayIndex: number, eq: ActiveFilter[]) => {
    const d = designRef.current;
    const newEq = [...d.per_way_eq];
    newEq[wayIndex] = eq;
    commitDesign({ ...d, per_way_eq: newEq });
  }, [commitDesign]);

  // Configure a complete 2-Way Coaxial system from a coaxial driver preset
  const handleApplyCoaxial2Way = useCallback((coax: CoaxialDriverPreset) => {
    const d = designRef.current;
    const lfEnclosure = computeDefaultEnclosure(coax.lf_entry.params, 'Vented');
    const hfEnclosure = computeDefaultEnclosure(coax.hf_section.driver_params, 'Sealed');
    const primaryVolL = getEnclosureVolumeLiters(lfEnclosure);
    commitDesign({
      ...d,
      topology: '2-way',
      cabinet: computeGoldenCabinetDimensions(Math.max(1, primaryVolL), 18, 0.8, 0.5),
      ways: [
        {
          name: `${coax.model} LF`,
          driver: { ...coax.lf_entry.params },
          enclosure: lfEnclosure,
          passive_filters: [],
          gain_db: 0,
          delay_s: 0,
          inverted: false,
          z_offset_m: 0,
          enabled: true,
          preset_name: `${coax.vendor} ${coax.model}`,
        },
        {
          name: `${coax.model} HF`,
          driver: { ...coax.hf_section.driver_params },
          enclosure: hfEnclosure,
          passive_filters: [],
          gain_db: 0,
          delay_s: 0,
          inverted: false,
          z_offset_m: 0,
          enabled: true,
          preset_name: coax.hf_section.model,
        },
      ],
      crossover_points: [
        {
          low_way_index: 0,
          high_way_index: 1,
          freq_hz: coax.hf_section.recommended_crossover_hz,
          slope: 'LR4',
        },
      ],
      per_way_eq: [[], []],
    });
    setActiveWay(0);
  }, [commitDesign]);

  // Setup wizard callback — converts WayInput[] to DesignState
  const handleSetupComplete = useCallback((topo: SystemTopology, ways: WayInput[], preserveExisting?: boolean) => {
    const d = designRef.current;
    const defaultPoints = defaultCrossoverPoints(topo);
    const points = preserveExisting
      ? defaultPoints.map((pt, i) => d.crossover_points[i] ? { ...pt, freq_hz: d.crossover_points[i].freq_hz, slope: d.crossover_points[i].slope } : pt)
      : defaultPoints;
    const primaryVolL = ways[0] ? getEnclosureVolumeLiters(ways[0].enclosure) : 18;
    setDesign({
      version: 2,
      topology: topo,
      crossover_mode: preserveExisting ? (d.crossover_mode ?? 'active') : 'active',
      cabinet: computeGoldenCabinetDimensions(Math.max(1, primaryVolL), 18, 0.8, 0.5),
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
      per_way_eq: ways.map((_, i) => (preserveExisting && d.per_way_eq[i]) ? d.per_way_eq[i] : []),
      freq_start_hz: d.freq_start_hz,
      freq_end_hz: d.freq_end_hz,
      freq_points: d.freq_points,
      drive_voltage_rms: d.drive_voltage_rms,
      source_impedance_ohm: d.source_impedance_ohm,
    });
    setHasCompletedSetup(true);
    setShowSetup(false);
    setActiveWay(0);
    setActiveSection('driver');
  }, [setDesign]);

  // Sidebar resize
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (dragging.current) setSidebarWidth(Math.min(520, Math.max(280, ev.clientX)));
    };
    const onUp = () => { dragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Switch active section automatically when user clicks a focused workspace tab
  const handleWorkspaceTabChange = (tab: WorkspaceTab) => {
    setWorkspaceTab(tab);
    if (tab === 'enclosure') setActiveSection('enclosure');
    else if (tab === 'crossover') setActiveSection('crossover');
  };

  // Crossover summary for accordion
  const modeLabel = (design.crossover_mode ?? 'active').toUpperCase();
  const xoverSummary = design.crossover_points.length > 0
    ? `${modeLabel}: ` + design.crossover_points.map(pt => `${pt.freq_hz}Hz ${pt.slope}`).join(', ')
    : `${modeLabel}: No crossover`;

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
      case 'Bandpass': return `BP${enc.order === 6 ? '6' : '4'} ${(enc.rear_volume_m3 * 1000).toFixed(1)}+${(enc.front_volume_m3 * 1000).toFixed(1)}L`;
      case 'PassiveRadiator': return `PR ${(enc.volume_m3 * 1000).toFixed(1)}L`;
      case 'OpenBaffle': return `OB ${(enc.width_m * 100).toFixed(0)}\u00D7${(enc.height_m * 100).toFixed(0)}cm`;
    }
  };

  const currentCabinet: CabinetDimensions = useMemo(
    () =>
      design.cabinet ??
      computeGoldenCabinetDimensions(
        way ? Math.max(1, getEnclosureVolumeLiters(way.enclosure)) : 18,
        18,
        0.8,
        0.5
      ),
    [design.cabinet, way]
  );

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
      {showSetup && (
        <SetupWizard
          onComplete={handleSetupComplete}
          onCancel={() => {
            setHasCompletedSetup(true);
            setShowSetup(false);
          }}
          initialTopology={design.topology}
          currentWays={design.ways}
          isReopened={hasCompletedSetup}
        />
      )}

      <div
        className="sidebar-drag-handle"
        style={{ left: sidebarWidth - 3 }}
        onMouseDown={onDragStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setSidebarWidth(w => Math.max(280, w - 10));
          if (e.key === 'ArrowRight') setSidebarWidth(w => Math.min(520, w + 10));
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
            {way.measured.off_axis && way.measured.off_axis.length > 0 ? ` (+${way.measured.off_axis.length} angles)` : ''}
            {' | '}
            ZMA: {way.measured.impedance_ohm.length > 0 ? `${way.measured.impedance_ohm.length} pts` : 'none'}
            {way.measured.simulate_enclosure
              ? ' \u2014 hybrid FRD + simulated enclosure active'
              : ' \u2014 using measured response (enclosure effect included in FRD)'}
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
                onApplyCoaxial2Way={handleApplyCoaxial2Way}
              />
            </AccordionSection>

            <AccordionSection
              title="Enclosure"
              summary={enclosureSummary(way)}
              expanded={activeSection === 'enclosure' || workspaceTab === 'enclosure'}
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
                lockType={false}
                onChangeType={() => setShowSetup(true)}
                disabled={!!way.measured && !way.measured.simulate_enclosure}
                disabledReason="Measured data active — using measured FRD. Click below to simulate enclosure & port tuning on top of this FRD."
                hybridFrdActive={!!way.measured?.simulate_enclosure}
                onToggleHybridFrd={(enabled) => {
                  if (!way.measured) return;
                  updateWay(safeActiveWay, {
                    measured: {
                      ...way.measured,
                      simulate_enclosure: enabled,
                    },
                  });
                }}
                onCompareAlignment={(altConfig, snapLabel) => {
                  if (systemResult) {
                    setSnapshots((prev) => [
                      ...prev,
                      {
                        name: snapLabel,
                        spl: [...systemResult.system_spl_db],
                        freqs: [...systemResult.frequencies_hz],
                      },
                    ]);
                  }
                  updateWay(safeActiveWay, { enclosure: altConfig });
                }}
              />
              {(!way.measured || way.measured.simulate_enclosure) && way.enclosure.type !== 'OpenBaffle' && (
                <CabinetCalculator
                  enclosure={way.enclosure}
                  driver={way.driver}
                  cabinet={currentCabinet}
                  onUpdateCabinet={updateCabinet}
                  ways={design.ways}
                  crossoverPoints={design.crossover_points}
                  onUpdateEnclosureVolume={(volume_m3) => {
                    const d = designRef.current;
                    const currentWay = d.ways[safeActiveWay];
                    if (
                      currentWay &&
                      (currentWay.enclosure.type === 'Sealed' ||
                        currentWay.enclosure.type === 'Vented' ||
                        currentWay.enclosure.type === 'PassiveRadiator')
                    ) {
                      commitDesign({
                        ...d,
                        ways: d.ways.map((w, idx) =>
                          idx === safeActiveWay
                            ? { ...w, enclosure: { ...currentWay.enclosure, volume_m3 } }
                            : w
                        ),
                      });
                    }
                  }}
                />
              )}
            </AccordionSection>

            <AccordionSection
              title="Crossover"
              summary={xoverSummary}
              expanded={activeSection === 'crossover' || workspaceTab === 'crossover'}
              onToggle={() => setActiveSection(activeSection === 'crossover' ? 'system' : 'crossover')}
            >
              <CrossoverPanel
                design={design}
                activeWay={safeActiveWay}
                onUpdatePoints={updateCrossoverPoints}
                onUpdateEq={updatePerWayEq}
                onUpdateWay={updateWay}
                onUpdateDesign={updateDesign}
              />
            </AccordionSection>

            <AccordionSection
              title="System"
              summary="Settings, optimizer, export, compare"
              expanded={activeSection === 'system' || workspaceTab === 'crossover'}
              onToggle={() => setActiveSection(activeSection === 'system' ? 'driver' : 'system')}
            >
              <SystemPanel
                design={design}
                solverInput={solverInput}
                systemResult={systemResult}
                isMultiWay={isMultiWay}
                onUpdateDesign={updateDesign}
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
        <SharedSystemBar
          design={design}
          activeWay={safeActiveWay}
          workspaceTab={workspaceTab}
          onSelectWay={setActiveWay}
          onSelectWorkspaceTab={handleWorkspaceTabChange}
          onUpdateDesign={updateDesign}
          onSetDesign={setDesign}
          onOpenSetupWizard={() => setShowSetup(true)}
        />
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
          <SystemPlotArea
            result={systemResult}
            supplement={supplementResult}
            xmaxMm={way ? way.driver.xmax_m * 1000 : 6}
            wayXmaxMm={design.ways.map(w => w.driver.xmax_m * 1000)}
            overlay={overlay}
            snapshots={snapshots}
            viewFocus={workspaceTab === 'enclosure' ? 'enclosure' : workspaceTab === 'crossover' ? 'crossover' : 'all'}
            cabinet={currentCabinet}
            ways={design.ways}
            crossoverPoints={design.crossover_points}
          />
        </div>
        {way && (
          <SchematicPanel
            enclosureConfig={way.enclosure}
            driverSd={way.driver.sd_m2}
            passiveFilters={
              (solverInput.ways[safeActiveWay]?.passive_filters?.length ?? 0) > 0
                ? solverInput.ways[safeActiveWay].passive_filters
                : way.passive_filters.length > 0
                ? way.passive_filters
                : undefined
            }
            driverRe={way.driver.re_ohm}
            ways={design.ways}
            cabinet={currentCabinet}
          />
        )}
      </main>
    </div>
  );
}

export default App;
