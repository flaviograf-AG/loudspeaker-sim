# Next Session Plan: Phase 2 — Fix Already-Identified Bugs

> **For Claude:** This is a self-contained session plan. Read this file first. Execute tasks in order. Commit after each task. Run `cargo test` AND `npx playwright test` before claiming anything is done.

## Session Context

**Branch:** `e2e-testing-and-solver-fixes`
**What happened last session:**
- Installed Playwright, wrote 45 E2E tests (orchestration + scenarios + component coverage)
- Fixed shunt passive components (Zobel, notch, shunt R/L/C) — they had zero effect because the ABCD ladder model had no source impedance. Added 0.35Ω hardcoded source impedance in `crossover.rs:113`
- Added "Measured data active" banner in EnclosureInputs when FRD is loaded
- Removed dead PlotArea.tsx
- Wrote gap analysis against VituixCAD manual (11 gaps found)
- Wrote master plan with 4 phases
- Exposed `window.__solverResult` for E2E numerical assertions

**What's deployed:** ls.graf.me.uk has the shunt fix + enclosure disabled banner. All 45 E2E tests passing. 101 Rust tests passing.

**This session covers Phase 2:** Fix two already-identified bugs — source impedance hardcoded, and missing filter bypass.

---

## Task 2.1: Source Impedance as User Parameter

**Problem:** `solver/src/crossover.rs:113` has `let z_source = Complex::new(0.35, 0.0);` hardcoded. Users can't model:
- Tube amplifiers (output impedance 1-4Ω)
- Long cable runs (0.5-1Ω added resistance)
- Bench testing with lab supply (near 0Ω)
- The effect of damping factor on passive crossover behavior

**Ref:** VituixCAD manual p.27 line 908: "Amplifier's output voltage [V] and output resistance [Ohm] are common for all drivers."

### Step 1: Rust — Add parameter to function signature

**File: `solver/src/crossover.rs`**

Change the function signature at line 101:
```rust
// BEFORE:
pub fn passive_transfer_function(
    blocks: &[PassiveBlock],
    load_impedance: Complex<f64>,
    omega: f64,
) -> Complex<f64> {
    let z_source = Complex::new(0.35, 0.0);  // line 113

// AFTER:
pub fn passive_transfer_function(
    blocks: &[PassiveBlock],
    load_impedance: Complex<f64>,
    omega: f64,
    source_impedance_ohm: f64,
) -> Complex<f64> {
    let z_source = Complex::new(source_impedance_ohm, 0.0);
```

### Step 2: Rust — Update call site in system.rs

**File: `solver/src/system.rs` line 182**

The `Way` struct (lines 22-46) needs a new field:
```rust
pub struct Way {
    // ... existing fields ...
    pub source_impedance_ohm: f64,  // NEW — default 0.35
}
```

Update the call at line 182:
```rust
// BEFORE:
passive_transfer_function(&way.passive_filters, z_driver, omega)

// AFTER:
passive_transfer_function(&way.passive_filters, z_driver, omega, way.source_impedance_ohm)
```

### Step 3: Rust — Update API types

**File: `solver/src/system_api.rs`**

Add to `WayInputJson`:
```rust
#[serde(default = "default_source_impedance")]
pub source_impedance_ohm: f64,
```

Add default function:
```rust
fn default_source_impedance() -> f64 { 0.35 }
```

Update the conversion from `WayInputJson` to `Way` to include the new field.

### Step 4: Rust — Update tests

**File: `solver/tests/crossover_tests.rs`**

Every call to `passive_transfer_function()` now needs the 4th argument:
- `no_filter_near_unity_transfer`: pass `0.35`
- `series_resistor_voltage_divider`: pass `0.35`
- All other crossover tests: pass `0.35`

Add new test:
```rust
#[test]
fn source_impedance_affects_shunt_component() {
    let blocks = vec![PassiveBlock::ShuntC { farads: 10e-6 }];
    let load = resistive_load(8.0);
    let omega = 2.0 * PI * 5000.0;

    let h_low_r = passive_transfer_function(&blocks, load, omega, 0.1);
    let h_high_r = passive_transfer_function(&blocks, load, omega, 2.0);

    // Higher source impedance = stronger shunt effect
    assert!(h_high_r.norm() < h_low_r.norm(),
        "Higher source R should increase shunt cap effect: {:.3} vs {:.3}",
        h_high_r.norm(), h_low_r.norm());
    // At least 1 dB difference
    let diff_db = 20.0 * (h_low_r.norm() / h_high_r.norm()).log10();
    assert!(diff_db > 1.0, "Expected >1 dB difference, got {:.1}", diff_db);
}
```

Run: `cargo test` — all must pass.

### Step 5: TypeScript — Add to types

**File: `web/src/types/index.ts`**

Add to `WayInput` interface (line ~184):
```typescript
source_impedance_ohm?: number;  // default 0.35
```

Add to `DesignState` (system-level, since VituixCAD makes it common for all drivers):
```typescript
source_impedance_ohm: number;  // default 0.35
```

### Step 6: TypeScript — Add to buildSolverInput

**File: `web/src/compute.ts`**

In `buildSolverInput()`, pass `source_impedance_ohm` from DesignState to each WayInput:
```typescript
source_impedance_ohm: design.source_impedance_ohm,
```

### Step 7: React — Add UI control

**File: `web/src/components/SystemPanel.tsx` (after line 47)**

Add after the "Points" input:
```tsx
<NumericInput label="Source R" value={design.source_impedance_ohm} step={0.05} min={0} max={10} unit="Ω"
  tooltip="Amplifier output impedance + cable resistance. Affects passive crossover behavior. Typical: 0.1-0.5Ω (solid state), 1-4Ω (tube amp)."
  onChange={(v) => onUpdateDesign({ source_impedance_ohm: v })} />
```

### Step 8: TypeScript — Update defaults

**File: `web/src/systemSetup.ts` or wherever DesignState defaults are defined**

Add `source_impedance_ohm: 0.35` to the default DesignState.

### Step 9: URL state + Save/Load

**File: `web/src/hooks/useUrlSync.ts`** — No changes needed (DesignState is serialized as JSON; new field auto-included).

**File: `web/src/components/SaveLoad.tsx`** — No changes needed (SavedDesign stores full DesignState). Old saves without the field will get the default from TypeScript `?? 0.35`.

### Step 10: Rebuild + E2E test

Rebuild WASM: `cd solver && wasm-pack build --target web --dev`

Write E2E test in `web/e2e/system-controls.spec.ts`:
```typescript
test('changing source impedance updates chart', async ({ page }) => {
  await setupSystem(page, '1-Way');
  await openAccordion(page, 'System');
  // Add a shunt component first so source R has visible effect
  await openAccordion(page, 'Crossover');
  await page.locator('select[title*="Add passive"]').first().selectOption('shunt_c');
  await openAccordion(page, 'System');
  await expectChartChange(page, async () => {
    await setNumericInput(page, 'Source R', '2');
  });
});
```

Run: `npx playwright test` — all must pass (45 existing + 1 new).

### Step 11: Commit

```bash
git add solver/src/crossover.rs solver/src/system.rs solver/src/system_api.rs \
  solver/tests/crossover_tests.rs web/src/types/index.ts web/src/compute.ts \
  web/src/components/SystemPanel.tsx web/e2e/system-controls.spec.ts
git commit -m "feat: configurable source impedance (was hardcoded 0.35Ω)

Users can now set amplifier output impedance + cable resistance in the
System panel. Affects passive crossover behavior — especially shunt
components (Zobel, notch, shunt R/L/C).

Default 0.35Ω (typical SS amp + cable). Range 0-10Ω for tube amps.

Ref: VituixCAD manual p.27 line 908"
```

---

## Task 2.2: Filter Bypass Toggle

**Problem:** Users can't temporarily disable a passive or active filter block to hear/see the difference without deleting and re-adding it. VituixCAD has per-block bypass checkbox (manual p.9 line 325): "Selected block can be bypassed by checkbox below B button on the right. Bypassed blocks are grayed in schema view."

### Step 1: Rust — Add bypass to PassiveBlock

**File: `solver/src/crossover.rs`**

Option A (cleanest): Don't modify the enum. Instead, change the `Way` struct to use a wrapper:
```rust
// In system.rs:
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PassiveFilterEntry {
    #[serde(flatten)]
    pub block: PassiveBlock,
    #[serde(default)]
    pub bypassed: bool,
}
```

Then `Way.passive_filters: Vec<PassiveFilterEntry>` instead of `Vec<PassiveBlock>`.

Option B (simpler but more changes): Keep `Vec<PassiveBlock>` and add a separate `Vec<bool>` for bypass state.

**Recommendation:** Option A is cleaner but requires changing every reference to `way.passive_filters`. Option B is less invasive. Choose Option B for now — it keeps the Rust change minimal and puts bypass logic in the frontend/API layer.

Actually, simplest approach: filter out bypassed blocks before passing to `passive_transfer_function()`. The bypass state lives in the frontend types only, and `buildSolverInput()` in `compute.ts` strips bypassed blocks from the list sent to WASM.

**Decision: bypass is a frontend concern.** The solver always receives only active (non-bypassed) blocks. The bypass checkbox in the UI simply removes the block from the array sent to the solver, without deleting it from the DesignState.

### Step 2: TypeScript — Add bypass to PassiveFilter type

**File: `web/src/types/index.ts`**

Add `bypassed?: boolean` to each variant of the PassiveFilter union type. OR add a wrapper:
```typescript
export interface PassiveFilterEntry {
  filter: PassiveFilter;
  bypassed: boolean;
}
```

Then `WayDesign.passive_filters: PassiveFilterEntry[]`.

**Simpler approach:** Just add `bypassed?: boolean` as an optional field to the discriminated union. Since TypeScript unions allow extra properties:
```typescript
export type PassiveFilter =
  | { type: 'SeriesR'; ohms: number; bypassed?: boolean }
  | { type: 'SeriesL'; henries: number; dcr_ohms: number; bypassed?: boolean }
  // ... etc for all 10 types
```

### Step 3: TypeScript — Strip bypassed in buildSolverInput

**File: `web/src/compute.ts`**

In `buildSolverInput()`, filter out bypassed passive filters before sending to WASM:
```typescript
passive_filters: way.passive_filters.filter(pf => !pf.bypassed),
```

Same for active EQ filters if they also get bypass support:
```typescript
active_filters: [...activeFilters.filter(af => !af.bypassed)],
```

### Step 4: React — Add bypass checkbox in PassiveWizard

**File: `web/src/components/PassiveWizard.tsx`**

In the filter list (lines 69-115), add a bypass checkbox next to the remove button:
```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <label style={{ fontSize: 10, cursor: 'pointer', opacity: pf.bypassed ? 0.5 : 1 }}>
    <input type="checkbox" checked={!pf.bypassed}
      onChange={(e) => updatePf({ ...pf, bypassed: !e.target.checked } as PassiveFilter)} />
    {' '}<strong>{formatType(pf.type)}</strong>
  </label>
  <button ... onClick={removePf}>x</button>
</div>
```

When bypassed, grey out the entire component card:
```tsx
<div key={i} style={{
  border: '1px solid var(--graf-warm-200)', borderRadius: 4,
  padding: '3px 6px', marginBottom: 3, fontSize: 11,
  opacity: pf.bypassed ? 0.4 : 1,
}}>
```

### Step 5: React — Add bypass to PerWayEqEditor

**File: `web/src/components/PerWayEqEditor.tsx`**

Same pattern: checkbox per EQ filter, grey when bypassed.

Add `bypassed?: boolean` to the `ActiveFilter` type in `types/index.ts`.

### Step 6: React — Update CrossoverSchematic

**File: `web/src/components/CrossoverSchematic.tsx`**

Bypassed blocks should render with:
- Dashed stroke instead of solid
- Reduced opacity (0.3)
- "BYPASS" label or strikethrough

Check how each block type is rendered (lines 111-196) and add conditional styling.

### Step 7: E2E tests

**File: `web/e2e/passive-crossover.spec.ts`** — add tests:

```typescript
test('bypassing a passive filter removes its effect', async ({ page }) => {
  await setupSystem(page, '1-Way');
  await openAccordion(page, 'Crossover');

  // Add a series inductor
  await page.locator('select[title*="Add passive"]').first().selectOption('series_l');
  await page.waitForTimeout(500);
  const withFilter = await getSolverResult(page);

  // Bypass it (uncheck the checkbox)
  const bypassCheck = page.locator('.accordion-body input[type="checkbox"]').first();
  await bypassCheck.uncheck();
  await page.waitForTimeout(500);
  const bypassed = await getSolverResult(page);

  // Bypassed result should match no-filter baseline
  // (or at least, the inductor's attenuation at 10kHz should disappear)
  const idx10k = bypassed.frequencies_hz.findIndex(f => f >= 10000);
  const diffWithFilter = Math.abs(withFilter.system_spl_db[idx10k] - bypassed.system_spl_db[idx10k]);
  expect(diffWithFilter).toBeGreaterThan(3); // inductor attenuates HF by >3 dB
});

test('un-bypassing restores filter effect', async ({ page }) => {
  // ... set up, add filter, bypass, then un-bypass
  // Assert SPL matches the "with filter" state
});
```

### Step 8: Commit

```bash
git commit -m "feat: filter bypass toggle for passive and active blocks

Per-block bypass checkbox in PassiveWizard and PerWayEqEditor.
Bypassed blocks are greyed in UI and shown dashed in schematic.
Solver receives only active (non-bypassed) blocks.

Ref: VituixCAD manual p.9 line 325"
```

---

## After Both Tasks

### Build + deploy
```bash
cd solver && wasm-pack build --target web --release
cd ../web && npm run build
scp -i ~/.ssh/id_ed25519 -r web/dist/* deploy@57.129.6.118:/var/www/ls/
```

### Update CLAUDE.md
- Add "Source R" parameter to component table
- Add bypass feature description
- Update test count

### Update master plan
Mark Tasks 2.1 and 2.2 as ✅ in `docs/plans/2026-04-08-master-plan.md`.

### Push
```bash
git push
```

---

## Checklist Before Closing Session

- [ ] `cargo test` — all pass (101+ tests)
- [ ] `npx playwright test` — all pass (45+ tests)
- [ ] Source impedance: UI control works, different values produce different charts
- [ ] Filter bypass: checkbox works for passive AND active, schematic shows bypass state
- [ ] Deployed to ls.graf.me.uk
- [ ] CLAUDE.md updated
- [ ] Master plan updated with ✅ marks
- [ ] All changes pushed to origin
