# Optimizer V3: Parameter Locks + Active/Passive Separation

> **Prerequisite:** Optimizer V2 (target curves, constraints, DE/NM hybrid, E-series) should be implemented first. This plan builds on top of V2.

## Problem Statement

Two fundamental design issues with the current optimizer:

1. **No parameter locking.** Users cannot fix specific component values. If you've already bought a 10µF capacitor, you should be able to tell the optimizer "don't touch this one — optimize everything else around it." VituixCAD has per-parameter Opt checkboxes (manual p.13, line 473: "Parameter will be included in frequency response optimizing if Opt field is checked. Otherwise parameter is excluded and existing value locked.")

2. **Active/passive crossover decision not separated.** The optimizer auto-builds its parameter list and includes active filter frequencies as optimizable variables even when the user explicitly set up a passive-only crossover. A user who chose passive crossover has made a design decision — the optimizer should not introduce active variables. Conversely, a pure DSP crossover should not optimize passive component values.

## Design (from VituixCAD reference)

VituixCAD's approach (manual pp. 12-17):
- Each passive component has an **Opt checkbox** — unchecked = locked
- Gain and delay per way have **label checkboxes** — checked = optimizable  
- Active filters are "common for all drivers, placed before power amplifier" (p.12 line 429)
- Passive filters are per-way and connected series/shunt in the network
- The optimizer only touches parameters with Opt=true
- Source impedance is implicit in the circuit model

## Architecture

### Rust solver changes

**File: `solver/src/optimizer.rs`**

Add `locked: bool` to `OptParam`:

```rust
#[derive(Debug, Clone)]
pub struct OptParam {
    pub kind: OptParamKind,  // CrossoverFreq, FilterFreq, WayGain, etc.
    pub locked: bool,        // true = skip during optimization
}
```

In `extract_values()` and `apply_values()`, skip locked params:
```rust
fn extract_values(project: &SpeakerProject, params: &[OptParam]) -> Vec<f64> {
    params.iter()
        .filter(|p| !p.locked)
        .map(|p| extract_single(project, &p.kind))
        .collect()
}
```

This means the optimizer's search space shrinks to only unlocked parameters. The simplex and DE populations are smaller, convergence is faster.

**File: `solver/src/crossover.rs`**

Add `source_impedance_ohm` as a parameter to `passive_transfer_function()` instead of the hardcoded 0.35Ω:

```rust
pub fn passive_transfer_function(
    blocks: &[PassiveBlock],
    load_impedance: Complex<f64>,
    omega: f64,
    source_impedance_ohm: f64,  // new: user-configurable
) -> Complex<f64> {
    let z_source = Complex::new(source_impedance_ohm, 0.0);
    // ... rest unchanged
}
```

Default 0.35Ω in system.rs, but expose as a system-level parameter.

### Frontend changes

**File: `web/src/components/OptimizerPanel.tsx`**

Replace auto-built param list with a user-controlled list:

```
┌─ Optimizer Parameters ─────────────────────┐
│                                             │
│  ☑ Crossover freq (Woofer↔Tweeter)  2500 Hz│
│  ☑ Woofer gain                       0.0 dB│
│  ☑ Tweeter gain                      0.0 dB│
│  ☐ Woofer delay (LOCKED)           0.0 µs  │
│                                             │
│  Passive components:                        │
│  ☑ Woofer L1                       0.68 mH │
│  ☐ Woofer C1 (LOCKED)            10.0 µF   │
│  ☑ Tweeter C1                      4.7 µF  │
│  ☑ Tweeter L1                      0.33 mH │
│                                             │
│  [Optimize]  [Lock All]  [Unlock All]       │
└─────────────────────────────────────────────┘
```

Each row has a checkbox (Opt) and the current value. Unchecked = locked.

**File: `web/src/types/index.ts`**

Add `crossover_mode` to `DesignState`:

```typescript
interface DesignState {
  // ... existing fields
  crossover_mode: 'active' | 'passive' | 'mixed';
}
```

When `crossover_mode = 'passive'`: optimizer only includes passive component values + crossover frequency. No active filter frequencies, no gain/delay.

When `crossover_mode = 'active'`: optimizer only includes active filter frequencies + gain + delay. Passive components are display-only.

When `crossover_mode = 'mixed'`: everything is available (current behavior), but each parameter still has individual lock/unlock.

## Tasks

### Task 1: Add `locked` flag to OptParam (Rust)
- Modify `OptParam` in `optimizer.rs`
- Update `extract_values` / `apply_values` to skip locked params
- Update `system_api.rs` to accept `locked` in JSON
- Write test: locked param stays at initial value after optimization
- **Commit**

### Task 2: Make source impedance configurable (Rust)
- Add `source_impedance_ohm` parameter to `passive_transfer_function`
- Update `system.rs` to pass it through (default 0.35Ω)
- Add to `SystemInput` / `WayInput` types
- Add to UI: NumericInput in System panel ("Amp + cable R", default 0.35Ω)
- Write test: different source impedance produces different shunt component effect
- **Commit**

### Task 3: Build per-parameter lock UI (React)
- Add lock checkboxes to OptimizerPanel.tsx
- Each passive component, crossover freq, gain, delay gets a checkbox
- Locked params are sent with `locked: true` in the optimizer input
- Add "Lock All" / "Unlock All" buttons
- Write E2E test: locked param doesn't change after optimization
- **Commit**

### Task 4: Add crossover_mode to DesignState (React)
- Add `crossover_mode` field to DesignState
- Setup wizard gets a crossover mode selector: "Active (DSP)" / "Passive" / "Mixed"
- When passive: hide active filter UI in CrossoverPanel
- When active: hide passive wizard in CrossoverPanel  
- Optimizer auto-excludes irrelevant parameter types based on mode
- Write E2E test: passive mode doesn't optimize active filter params
- **Commit**

### Task 5: Include all passive component values in optimizer params (Rust + React)
- Currently only `LPadAttenuation` is optimizable for passive components
- Add `PassiveValue { way_index, filter_index, field: "henries"|"farads"|"ohms" }` to `OptParamKind`
- OptimizerPanel shows every passive component value as an optimizable (or lockable) parameter
- This is the key missing piece: the optimizer needs to tune individual R/L/C values
- Write test: optimizer tunes a series inductor value to improve flatness
- **Commit**

### Task 6: E2E tests for full optimizer workflow
- Real scenario: 2-way passive crossover, lock one capacitor, optimize rest
- Verify locked value unchanged, other values changed, cost decreased
- Verify crossover_mode='passive' doesn't produce active filter params
- **Commit**

## Execution Order

```
Task 1 (locked flag)          ← Rust foundation
Task 2 (source impedance)    ← Rust, independent
Task 3 (lock UI)              ← React, depends on Task 1
Task 4 (crossover mode)       ← React, independent
Task 5 (passive param opt)    ← Rust+React, depends on Task 1
Task 6 (E2E tests)            ← depends on all above
```

Tasks 1+2 can run in parallel. Tasks 3+4 can run in parallel after Task 1.

## References

- VituixCAD manual pp. 12-17 (crossover, optimizer, parameter locking)
- Dickason, "Loudspeaker Design Cookbook" Ch. 5 (passive crossover design with source impedance)
- Our feature audit: `docs/feature-audit-hornresp-xsim.md` line 13 (amplifier output resistance flagged as gap)
