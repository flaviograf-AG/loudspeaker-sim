# UI Rewrite v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the React frontend from scratch with clean state management, eliminating all known bugs, dead code, and lossy round-trips. Keep the Rust solver, types, IO parsers, plots, and schematics.

**Architecture:** Single `DesignState` source of truth (no `active_filters` stored, always computed). Components extracted from monolith App.tsx into WayEditor, CrossoverPanel, SystemPanel. NumericInput with local draft state. Save/load serializes DesignState directly.

**Tech Stack:** React 19, TypeScript, Vite, ECharts, GDS CSS, WASM solver.

**Design doc:** `docs/plans/2026-04-08-ui-rewrite-v2.md`

---

## Overview of Tasks

| # | Task | Scope | Key Files |
|---|------|-------|-----------|
| 1 | New types + compute layer | Types, pure functions | `types/index.ts`, `compute.ts` |
| 2 | Fix NumericInput | One component | `NumericInput.tsx` |
| 3 | New useUndoRedo + useUrlSync hooks | Hooks | `hooks/useUndoRedo.ts`, `hooks/useUrlSync.ts` |
| 4 | New App.tsx shell | Root component | `App.tsx` |
| 5 | WayEditor component | Per-way editing | `components/WayEditor.tsx` |
| 6 | CrossoverPanel component | Crossover + EQ + passive | `components/CrossoverPanel.tsx` |
| 7 | SystemPanel component | Freq range, save/load, export | `components/SystemPanel.tsx` |
| 8 | Wire plots + schematics | Connect result data | `App.tsx` adjustments |
| 9 | Delete old files, verify, deploy | Cleanup | Multiple deletions |

---

## Task 1: New Types + Compute Layer

### Files
- Modify: `web/src/types/index.ts` — add `DesignState`, `WayDesign`, keep solver types
- Create: `web/src/compute.ts` — `buildSolverInput()`, `defaultDesign()`

### Step 1: Add new types to types/index.ts

After the existing `DesignState` interface (which we'll replace), add:

```typescript
// === NEW STATE MODEL (v2) ===

export interface WayDesign {
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
  measured?: {
    frequencies_hz: number[];
    spl_db: number[];
    phase_deg: number[];
    impedance_ohm: number[];
    impedance_phase_deg: number[];
  };
}

export interface DesignStateV2 {
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
```

Keep all existing types (`DriverParams`, `EnclosureConfig`, `SimulationResult`, `SystemResult`, `WayInput`, `ActiveFilter`, `PassiveFilter`, `CrossoverPoint`, etc.) — the solver still needs them. We'll alias `DesignStateV2` to `DesignState` after the migration is complete.

### Step 2: Create compute.ts

```typescript
import type { DesignStateV2, SystemInput, WayInput, ActiveFilter, CrossoverPoint, CrossoverSlope } from './types';

/**
 * Assemble active filters for one way from crossover points + per-way EQ.
 * This is the ONLY place active_filters are constructed.
 */
function assembleFilters(
  wayIndex: number,
  points: CrossoverPoint[],
  eq: ActiveFilter[],
): ActiveFilter[] {
  const filters: ActiveFilter[] = [];

  for (const pt of points) {
    if (pt.low_way_index === wayIndex) {
      filters.push(makeLowPass(pt.freq_hz, pt.slope));
    }
    if (pt.high_way_index === wayIndex) {
      filters.push(makeHighPass(pt.freq_hz, pt.slope));
    }
  }

  filters.push(...eq);
  return filters;
}

function makeLowPass(freq: number, slope: CrossoverSlope): ActiveFilter {
  switch (slope) {
    case '1st': return { type: 'LowPass1', freq_hz: freq };
    case 'BW2': return { type: 'LowPass2', freq_hz: freq, q: 0.707 };
    case 'LR2': return { type: 'LR2LowPass', freq_hz: freq };
    case 'LR4': return { type: 'LR4LowPass', freq_hz: freq };
  }
}

function makeHighPass(freq: number, slope: CrossoverSlope): ActiveFilter {
  switch (slope) {
    case '1st': return { type: 'HighPass1', freq_hz: freq };
    case 'BW2': return { type: 'HighPass2', freq_hz: freq, q: 0.707 };
    case 'LR2': return { type: 'LR2HighPass', freq_hz: freq };
    case 'LR4': return { type: 'LR4HighPass', freq_hz: freq };
  }
}

/**
 * Build solver input from design state.
 * One pure function, one direction, no reverse path.
 */
export function buildSolverInput(design: DesignStateV2): SystemInput {
  return {
    ways: design.ways.map((w, i): WayInput => ({
      name: w.name,
      driver: w.driver,
      enclosure: w.enclosure,
      passive_filters: w.passive_filters,
      active_filters: assembleFilters(i, design.crossover_points, design.per_way_eq[i] ?? []),
      gain_db: w.gain_db,
      delay_s: w.delay_s,
      inverted: w.inverted,
      z_offset_m: w.z_offset_m,
      enabled: w.enabled,
      measured: w.measured,
    })),
    freq_start_hz: design.freq_start_hz,
    freq_end_hz: design.freq_end_hz,
    freq_points: design.freq_points,
    drive_voltage_rms: design.drive_voltage_rms,
  };
}

/** Default 2-way design for fresh start. */
export function defaultDesign(): DesignStateV2 {
  return {
    version: 2,
    topology: '2-way',
    ways: [
      {
        name: 'Woofer',
        driver: { fs_hz: 37, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5, vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3 },
        enclosure: { type: 'Sealed', volume_m3: 18e-3, ql: 7 },
        passive_filters: [], gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
      },
      {
        name: 'Tweeter',
        driver: { fs_hz: 800, re_ohm: 5.5, le_h: 0.05e-3, qes: 0.5, qms: 2.0, vas_m3: 0.5e-3, sd_m2: 8e-4, xmax_m: 1e-3 },
        enclosure: { type: 'Sealed', volume_m3: 0.5e-3, ql: 7 },
        passive_filters: [], gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
      },
    ],
    crossover_points: [{ freq_hz: 2500, slope: 'LR4' as const, low_way_index: 0, high_way_index: 1 }],
    per_way_eq: [[], []],
    freq_start_hz: 20, freq_end_hz: 20000, freq_points: 300, drive_voltage_rms: 2.83,
  };
}
```

### Step 3: Verify TypeScript compiles

Run: `cd web && npx tsc --noEmit`
Expected: No errors (new types alongside old — no conflicts yet).

### Step 4: Commit

```
feat: new DesignStateV2 types and compute layer (buildSolverInput)
```

---

## Task 2: Fix NumericInput

### Files
- Modify: `web/src/components/NumericInput.tsx`

### Step 1: Rewrite with local draft state

Replace the entire file:

```typescript
import { useState, useEffect } from 'react';

interface NumericInputProps {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  tooltip?: string;
  onChange: (value: number) => void;
}

export function NumericInput({ label, value, step = 1, min, max, unit, tooltip, onChange }: NumericInputProps) {
  const [draft, setDraft] = useState(formatVal(value));
  const [focused, setFocused] = useState(false);

  // Sync from parent when not focused (undo, external change)
  useEffect(() => {
    if (!focused) setDraft(formatVal(value));
  }, [value, focused]);

  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n) && isFinite(n)) {
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
      onChange(clamped);
      setDraft(formatVal(clamped));
    } else {
      setDraft(formatVal(value)); // revert bad input
    }
  };

  return (
    <div className="param-row" title={tooltip}>
      <span className="param-label">{label}</span>
      <input
        type="number"
        className="graf-form-control"
        value={focused ? draft : formatVal(value)}
        step={step}
        min={min}
        max={max}
        style={{ width: 90 }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(); }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      />
      {unit && <span className="param-unit">{unit}</span>}
    </div>
  );
}

function formatVal(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 100) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  if (abs >= 0.01) return v.toFixed(4);
  return v.toExponential(3);
}
```

### Step 2: Verify TypeScript compiles

Run: `cd web && npx tsc --noEmit`

### Step 3: Test manually

The existing app still uses NumericInput everywhere — this fix is immediately visible. Type "3." in any field — the dot should persist.

### Step 4: Commit

```
fix: NumericInput local draft state — no more mid-type input fighting
```

---

## Task 3: New Hooks

### Files
- Keep: `web/src/hooks/useUndoRedo.ts` (already fixed)
- Create: `web/src/hooks/useUrlSync.ts`
- Keep: `web/src/hooks/useSolver.ts` (unchanged)
- Keep: `web/src/hooks/useSystemSolver.ts` (unchanged)

### Step 1: Create useUrlSync.ts

```typescript
import { useEffect } from 'react';
import type { DesignStateV2 } from '../types';

export function useUrlSync(design: DesignStateV2) {
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const json = JSON.stringify(design);
        const encoded = btoa(unescape(encodeURIComponent(json)));
        history.replaceState(null, '', '#v2=' + encoded);
      } catch { /* ignore encoding errors */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [design]);
}

export function decodeFromUrl(): DesignStateV2 | null {
  const hash = location.hash;
  if (!hash || hash.length < 5) return null;

  // New v2 format
  if (hash.startsWith('#v2=')) {
    try {
      const json = decodeURIComponent(escape(atob(hash.slice(4))));
      const parsed = JSON.parse(json);
      if (parsed.version === 2) return parsed;
    } catch { /* fall through */ }
  }

  // Legacy formats — ignore, show setup wizard
  return null;
}
```

### Step 2: Verify TypeScript compiles

Run: `cd web && npx tsc --noEmit`

### Step 3: Commit

```
feat: useUrlSync hook for v2 DesignState URL encoding
```

---

## Task 4: New App.tsx Shell

This is the core rewrite. Replace the entire App.tsx.

### Files
- Rewrite: `web/src/App.tsx`

### Step 1: Write new App.tsx

The new App.tsx should be ~120-150 lines. It manages:
- `useUndoRedo<DesignStateV2>` for undo/redo
- `activeWay` (local UI state)
- `activeSection` (which accordion is open)
- `overlay` / `snapshots` (ephemeral plot state)
- WASM initialization
- `solverInput = useMemo(() => buildSolverInput(design), [design])`
- `useSolver` / `useSystemSolver` for running the solver
- Layout: sidebar (way tabs + accordion sections) + main (plots + schematics)

Key architectural rules:
- `design` is the single state. No orphaned `topology` useState.
- `updateWay(idx, partial)` creates new ways array, calls `setDesign`.
- `setDesign` goes through `useUndoRedo.set`.
- `safeActiveWay` is clamped in `useEffect`, never during render.
- Components receive only the props they need.

The App renders:
- Way tab buttons (inline)
- Measured data status banner (inline)
- AccordionSection "Driver" → WayEditor
- AccordionSection "Enclosure" → EnclosureInputs (reused)
- AccordionSection "Crossover" → CrossoverPanel
- AccordionSection "System" → SystemPanel
- PlotArea / SystemPlotArea (conditional on isMultiWay)
- SchematicPanel

**NOTE:** Initially WayEditor, CrossoverPanel, SystemPanel don't exist yet. Stub them as `() => <div>TODO</div>` so the app compiles. Fill in during Tasks 5-7.

### Step 2: Verify TypeScript compiles and app renders

Run: `cd web && npx tsc --noEmit && npm run dev`
Expected: App renders with way tabs, accordion sections, plot area. Stubbed sections show "TODO".

### Step 3: Commit

```
feat: new App.tsx shell — DesignStateV2 single source of truth
```

---

## Task 5: WayEditor Component

### Files
- Create: `web/src/components/WayEditor.tsx`
- Modify: `web/src/App.tsx` — replace stub

### Step 1: Write WayEditor.tsx

Owns: PresetSelector, DriverInputs, FRD/ZMA import buttons + status, per-way controls (gain, delay, z-offset, enable, invert).

```typescript
interface WayEditorProps {
  way: WayDesign;
  wayIndex: number;
  onUpdate: (updates: Partial<WayDesign>) => void;
}
```

Key rules:
- Stateless — no local state except what PresetSelector needs internally
- FRD/ZMA import captures `wayIndex` at click time (not in async callback)
- Uses fixed NumericInput for gain/delay/z-offset

### Step 2: Wire into App.tsx

Replace the WayEditor stub in the Driver accordion.

### Step 3: Verify driver editing works

Run dev server. Change a driver parameter. Verify plot updates.

### Step 4: Verify FRD/ZMA import works

Import a .frd file for the woofer. Switch to tweeter tab. Woofer should still show "FRD: N pts" in status banner.

### Step 5: Commit

```
feat: WayEditor — driver, enclosure, FRD/ZMA, per-way controls
```

---

## Task 6: CrossoverPanel Component

### Files
- Create: `web/src/components/CrossoverPanel.tsx`
- Create: `web/src/components/PassiveWizard.tsx` (extracted from old PassiveCrossoverEditor)
- Modify: `web/src/App.tsx` — replace stub

### Step 1: Write CrossoverPanel.tsx

Owns: CrossoverPointsEditor, PerWayEqEditor, PassiveWizard.

```typescript
interface CrossoverPanelProps {
  design: DesignStateV2;
  activeWay: number;
  onUpdatePoints: (points: CrossoverPoint[]) => void;
  onUpdateEq: (wayIndex: number, eq: ActiveFilter[]) => void;
  onUpdateWay: (wayIndex: number, updates: Partial<WayDesign>) => void;
}
```

### Step 2: Extract PassiveWizard from old PassiveCrossoverEditor

The passive crossover wizard (component presets, topology selector) is the one useful part of MultiWayEditor.tsx. Extract it into its own file with clean props:

```typescript
interface PassiveWizardProps {
  crossoverFreq: number;
  driverRe: number;
  onApply: (filters: PassiveFilter[]) => void;
}
```

Fix the `document.getElementById` hack — use a controlled input with React state for the crossover frequency.

### Step 3: Wire into App.tsx

Replace the CrossoverPanel stub in the Crossover accordion.

### Step 4: Verify crossover editing works

Change crossover frequency. Verify system plot updates. Add a PEQ to per-way EQ. Verify.

### Step 5: Commit

```
feat: CrossoverPanel + PassiveWizard — crossover points, EQ, passive presets
```

---

## Task 7: SystemPanel Component

### Files
- Create: `web/src/components/SystemPanel.tsx`
- Create: `web/src/components/SaveLoad.tsx` (new, serializes DesignStateV2)
- Modify: `web/src/App.tsx` — replace stub

### Step 1: Write SystemPanel.tsx

Owns: frequency range controls (4 NumericInputs), OptimizerPanel, SaveLoad, ExportControls, BiquadExport, ImportOverlay.

```typescript
interface SystemPanelProps {
  design: DesignStateV2;
  solverInput: SystemInput;
  singleResult: SimulationResult | null;
  systemResult: SystemResult | null;
  isMultiWay: boolean;
  onUpdateDesign: (updates: Partial<DesignStateV2>) => void;
  onSetDesign: (design: DesignStateV2) => void;  // for load/optimizer
  overlay: OverlayData | undefined;
  onSetOverlay: (o: OverlayData | undefined) => void;
}
```

### Step 2: Write SaveLoad.tsx

New save/load that serializes DesignStateV2 directly:

```typescript
interface SaveLoadProps {
  design: DesignStateV2;
  onLoad: (design: DesignStateV2) => void;
}
```

Saves to `localStorage` key `ls-designs-v2`. Legacy key `ls-designs` is read-only with migration via `extractCrossoverPoints` (last use).

### Step 3: Wire OptimizerPanel.onApply

The optimizer still returns `WayInput[]` with assembled `active_filters`. The onApply handler in SystemPanel decomposes back to DesignState:

```typescript
onApply={(newWays) => {
  const { points, perWayEq } = extractCrossoverPoints(newWays);
  onSetDesign({
    ...design,
    ways: design.ways.map((w, i) => ({
      ...w,
      gain_db: newWays[i].gain_db,
      delay_s: newWays[i].delay_s,
      passive_filters: newWays[i].passive_filters,
    })),
    crossover_points: points,
    per_way_eq: perWayEq,
  });
}}
```

This is the ONE remaining use of `extractCrossoverPoints`. It stays until optimizer v3.

### Step 4: Wire into App.tsx, verify

### Step 5: Commit

```
feat: SystemPanel + SaveLoad — freq range, optimizer, save/load, export
```

---

## Task 8: Wire Plots + Schematics

### Files
- Modify: `web/src/App.tsx` — connect plot components to solver results

### Step 1: Connect PlotArea / SystemPlotArea

These components are already written and working. They just need the right props:
- `PlotArea`: `result={singleResult}`, `xmaxMm={way.driver.xmax_m * 1000}`, `overlay`, `snapshots`
- `SystemPlotArea`: `result={systemResult}`

### Step 2: Connect SchematicPanel

- `enclosureConfig={way.enclosure}`
- `driverSd={way.driver.sd_m2}`
- `passiveFilters={way.passive_filters}`
- `driverRe={way.driver.re_ohm}`

### Step 3: Verify full flow

1. Change driver → plot updates
2. Change enclosure → plot updates
3. Change crossover → system plot updates
4. Import FRD → plot shows measured data
5. Undo/redo → everything reverts correctly
6. Save → load → identical state

### Step 4: Commit

```
feat: wire plots and schematics to new state flow
```

---

## Task 9: Delete Old Files, Verify, Deploy

### Files to delete
- `web/src/components/MultiWayEditor.tsx` (entire file — PassiveWizard extracted in Task 6)
- `web/src/crossover.ts` (replaced by `compute.ts` — keep `extractCrossoverPoints` in SystemPanel temporarily)
- `web/src/systemSetup.ts` (replaced by `defaultDesign()` in compute.ts)
- `web/src/hooks/useUrlState.ts` (replaced by `useUrlSync.ts`)
- `web/src/hooks/useDesignStore.ts` (replaced by `SaveLoad.tsx`)
- `web/src/components/SaveLoadControls.tsx` (replaced by `SaveLoad.tsx`)

### Files to keep (referenced but not modified)
- `web/src/io/frd.ts`, `web/src/io/zma.ts`
- `web/src/solver/wasm-bridge.ts`
- `web/src/presets/`
- All plot and schematic components
- `web/src/hooks/useSolver.ts`, `web/src/hooks/useSystemSolver.ts`

### Step 1: Delete old files

### Step 2: Move `extractCrossoverPoints` into SystemPanel.tsx (the one remaining use)

### Step 3: Remove old type aliases from types/index.ts

Rename `DesignStateV2` to `DesignState`. Remove old `DesignState`, `WayInput` (if no longer used by solver), etc. Keep `WayInput` and `SystemInput` since the solver bridge still uses them.

### Step 4: Full verification

Run: `cd web && npx tsc --noEmit && npm run build`

Run: `cd solver && cargo test`

### Step 5: Deploy

```bash
cd solver && wasm-pack build --target web --release
cd web && npm run build
scp -i ~/.ssh/id_ed25519 -r web/dist/* deploy@57.129.6.118:/var/www/ls/
```

### Step 6: Commit and push

```
feat: UI rewrite v2 complete — delete old spaghetti, deploy clean app
```

---

## Verification Checklist (after Task 9)

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run build` — production build succeeds
- [ ] `cargo test` — all 100 solver tests pass
- [ ] Single-way: select driver from presets, change enclosure type, plot updates live
- [ ] Multi-way: add 2nd way, set crossover, system plot shows summed response
- [ ] NumericInput: type "3." — dot persists, value commits on blur
- [ ] FRD/ZMA: import per way, status banner shows point counts, plot uses measured data
- [ ] Undo/redo: Ctrl+Z/Y works across all changes including topology changes
- [ ] Save/load: save design, reload page, load design — identical state
- [ ] URL share: copy URL, open in new tab — identical state
- [ ] Optimizer: run optimizer, apply results, crossover frequencies update
- [ ] Passive wizard: select topology, components appear, schematic updates
- [ ] No console errors during normal operation
