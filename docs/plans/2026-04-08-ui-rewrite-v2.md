# UI Rewrite v2 — Clean-Sheet Frontend

## Decision

Rewrite the React frontend from scratch. The existing `web/src/` is broken spaghetti with dead code, duplicate control paths, lossy state round-trips, and render-time state mutations. The Rust solver is solid — keep it, keep the types, write a new app.

## What We Keep

- **Rust solver** — `solver/` is untouched. WASM API: `simulate()`, `simulate_system()`, `optimize_system()`
- **Types** — `types/index.ts` (cleaned up: remove old `SystemInput`, add `DesignState`)
- **IO parsers** — `io/frd.ts`, `io/zma.ts` (working, tested)
- **WASM bridge** — `solver/wasm-bridge.ts` (thin wrapper, works)
- **Presets** — `presets/` driver database (571 drivers)
- **ECharts plots** — `FrequencyPlot.tsx` (works, just needs props)
- **SVG schematics** — `EnclosureSchematic.tsx`, `CrossoverSchematic.tsx` (pure, work)

## What We Delete

- `App.tsx` (530-line monolith)
- `MultiWayEditor.tsx` (350 lines, dead default export + tangled PassiveCrossoverEditor)
- `crossover.ts` (the lossy buildSolverInput/extractCrossoverPoints pair)
- `systemSetup.ts` (tangled with old topology flow)
- `useUrlState.ts` (3-format migration mess)
- `useDesignStore.ts` (saves wrong format)
- All accordion/section components that exist only to work around App.tsx's monolith

## New Architecture

### State: `DesignState` is the single source of truth

```typescript
interface DesignState {
  version: 2;
  topology: SystemTopology;
  ways: WayDesign[];
  crossover_points: CrossoverPoint[];
  per_way_eq: ActiveFilter[][];
  freq_start_hz: number;
  freq_end_hz: number;
  freq_points: number;
  drive_voltage_rms: number;
}

interface WayDesign {
  name: string;
  driver: DriverParams;
  enclosure: EnclosureConfig;
  passive_filters: PassiveFilter[];
  gain_db: number;
  delay_s: number;
  inverted: boolean;
  z_offset_m: number;
  enabled: boolean;
  preset_name?: string;
  measured?: MeasuredData;
}
```

Rules:
- `active_filters` are NEVER stored — always computed from `crossover_points + per_way_eq`
- `topology` is inside DesignState — undo-tracked, URL-persisted
- Save/load serializes DesignState directly — no reverse engineering
- `version: 2` field allows future migrations

### Compute layer: `buildSolverInput(design) → SystemInput`

One pure function, one direction, no reverse path.

```typescript
function buildSolverInput(design: DesignState): SystemInput {
  return {
    ways: design.ways.map((w, i) => ({
      ...w,
      active_filters: assembleFilters(i, design.crossover_points, design.per_way_eq[i]),
    })),
    freq_start_hz: design.freq_start_hz,
    freq_end_hz: design.freq_end_hz,
    freq_points: design.freq_points,
    drive_voltage_rms: design.drive_voltage_rms,
  };
}
```

No `extractCrossoverPoints`. No reverse path. Ever.

### Component tree

```
App.tsx (~120 lines)
  State: useUndoRedo<DesignState>, activeWay, overlay, snapshots
  Computed: solverInput = useMemo(buildSolverInput)
  Hooks: useSolver / useSystemSolver, useUrlSync
  Layout: sidebar + main

  Sidebar.tsx (~60 lines)
    WayTabs — buttons, add/remove way
    WayEditor — driver + enclosure + FRD/ZMA for active way
    CrossoverPanel — crossover points + per-way EQ + passive wizard
    SystemPanel — freq range, optimizer, save/load, export

  WayEditor.tsx (~100 lines)
    Props: way: WayDesign, onUpdate(partial)
    Children: PresetSelector, DriverInputs, EnclosureInputs
    FRD/ZMA import buttons + status
    Per-way controls: gain, delay, z-offset, enable, invert
    Stateless — all state via props

  CrossoverPanel.tsx (~80 lines)
    Props: design, activeWay, onUpdate
    Children: CrossoverPointsEditor, PerWayEqEditor, PassiveWizard
    Crossover frequency wizard with passive component presets

  SystemPanel.tsx (~60 lines)
    Props: design, solverInput, result, onUpdate
    Children: NumericInput x4, OptimizerButton, SaveLoad, Export

  PlotArea.tsx / SystemPlotArea.tsx (keep, clean props)
  SchematicPanel.tsx (keep)
  FrequencyPlot.tsx (keep)
```

### NumericInput: local draft state

```typescript
function NumericInput({ value, onChange, ...rest }) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Sync from parent only when not focused
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n)) onChange(n);
    else setDraft(String(value)); // revert bad input
  };

  return <input
    value={focused ? draft : formatNumber(value)}
    onFocus={() => setFocused(true)}
    onBlur={() => { setFocused(false); commit(); }}
    onChange={e => setDraft(e.target.value)}
    onKeyDown={e => e.key === 'Enter' && commit()}
  />;
}
```

### useUndoRedo: single atomic state (already fixed)

History + index in one `useState` call. No stale closure race.

### Save/Load: serialize DesignState

```typescript
function saveDesign(name: string, design: DesignState) {
  const designs = JSON.parse(localStorage.getItem('ls-designs') || '{}');
  designs[name] = design;  // DesignState directly, not SystemInput
  localStorage.setItem('ls-designs', JSON.stringify(designs));
}

function loadDesign(name: string): DesignState | null {
  const designs = JSON.parse(localStorage.getItem('ls-designs') || '{}');
  const d = designs[name];
  if (!d) return null;
  if (!d.version) return migrateLegacy(d);  // one-time, then delete extractCrossoverPoints
  return d;
}
```

### URL state: encode DesignState

```typescript
function useUrlSync(design: DesignState) {
  useEffect(() => {
    const timer = setTimeout(() => {
      const json = JSON.stringify(design);
      const hash = btoa(unescape(encodeURIComponent(json)));
      history.replaceState(null, '', '#v2=' + hash);
    }, 500);
    return () => clearTimeout(timer);
  }, [design]);
}

function decodeFromUrl(): DesignState | null {
  const hash = location.hash;
  if (hash.startsWith('#v2=')) {
    return JSON.parse(decodeURIComponent(escape(atob(hash.slice(4)))));
  }
  // Legacy: ignore, show setup wizard
  return null;
}
```

### Optimizer interface (algorithm unchanged, interface clean)

Optimizer keeps running as today. But `onApply` changes:

```typescript
// OptimizerPanel calls back with the optimized SystemInputJson from Rust
onApply={(optimizedSystem: SystemInputJson) => {
  // Extract only the values the optimizer changed
  const newDesign = { ...design };
  optimizedSystem.ways.forEach((w, i) => {
    newDesign.ways[i] = { ...design.ways[i], gain_db: w.gain_db, delay_s: w.delay_s, passive_filters: w.passive_filters };
  });
  // Decompose active_filters back to crossover_points — LAST use of extractCrossoverPoints
  const { points, perWayEq } = extractCrossoverPoints(optimizedSystem.ways);
  newDesign.crossover_points = points;
  newDesign.per_way_eq = perWayEq;
  setDesign(newDesign);
}}
```

This is the ONE remaining use of `extractCrossoverPoints` — optimizer returns assembled `active_filters` and we decompose once. When we rewrite the optimizer (phase 2), this goes away too. Acceptable tech debt for now.

## What's NOT in this rewrite

- Optimizer algorithm improvements (phase 2)
- Topology-aware optimizer (phase 2)
- Passive component optimization (phase 2)
- New enclosure types or solver features
- Visual design changes — same CSS, same layout, same GDS classes

## Build order

1. Types + compute layer (`types/index.ts`, `buildSolverInput.ts`)
2. NumericInput fix
3. App.tsx shell (state, hooks, layout)
4. WayEditor (driver + enclosure + FRD/ZMA)
5. CrossoverPanel (crossover points + EQ + passive wizard)
6. SystemPanel (freq range + optimizer + save/load + export)
7. Wire up plots (PlotArea, SystemPlotArea — mostly unchanged)
8. Wire up schematics
9. Delete old files
10. Test everything, deploy

Each step is independently testable. Steps 1-3 get a compiling app with blank sidebar. Steps 4-6 fill in the sidebar. Steps 7-8 connect the plots. Step 9 cleans up.
