# FRD/ZMA Solver Bridge — Measured Driver Data for System Simulation & Optimization

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to import measured FRD/ZMA files per way, replacing the T/S-based driver simulation with real measurement data. This makes the crossover optimizer work against actual driver behavior (cone breakup, diffraction, etc.) instead of idealized models.

**Architecture:** Add an optional `measured_data` field to each Way. When present, the system solver uses the FRD/ZMA data (interpolated to the system frequency grid) instead of running the enclosure simulation. The optimizer then tunes crossover parameters against real driver response, making L-Pad and passive component optimization physically meaningful.

**Tech Stack:** Rust (WASM), React 19, TypeScript. FRD/ZMA parsers already exist in `web/src/io/`.

---

## Overview of Tasks

| # | Task | Scope | Files |
|---|------|-------|-------|
| 1 | Add MeasuredDriverData to Rust types | Rust types + serde | `types.rs`, `system_api.rs` |
| 2 | System solver uses measured data when present | Solver logic | `system.rs` |
| 3 | Wire measured data through WASM API | API bridge | `system_api.rs`, `lib.rs` |
| 4 | Add FRD/ZMA import per way in UI | React components | `MultiWayEditor.tsx`, types |
| 5 | Pass measured data to system solver | WASM bridge | `wasm-bridge.ts`, `App.tsx` |
| 6 | Test with real SB Acoustics FRD/ZMA files | Verification | `tests/`, examples |

---

## Task 1: Add MeasuredDriverData to Rust Types

### Files
- Modify: `solver/src/types.rs` — add `MeasuredDriverData` struct
- Modify: `solver/src/system_api.rs` — add JSON-serializable version
- Modify: `solver/src/system.rs` — add field to `Way`

### Step 1: Add MeasuredDriverData struct to types.rs

After `SimulationResult` struct (~line 400), add:

```rust
/// Measured driver data from FRD/ZMA files.
/// When present on a Way, replaces T/S-based simulation with real measurements.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeasuredDriverData {
    /// Frequency points (Hz) — from FRD file
    pub frequencies_hz: Vec<f64>,
    /// SPL at 1m (dB) — from FRD file
    pub spl_db: Vec<f64>,
    /// Acoustic phase (degrees) — from FRD file
    pub phase_deg: Vec<f64>,
    /// Electrical impedance magnitude (Ohm) — from ZMA file (optional)
    pub impedance_ohm: Vec<f64>,
    /// Electrical impedance phase (degrees) — from ZMA file (optional)
    pub impedance_phase_deg: Vec<f64>,
}
```

### Step 2: Add optional field to Way in system.rs

In `Way` struct (~line 23), add after `enabled`:

```rust
    /// Measured FRD/ZMA data. When Some, bypasses T/S+enclosure simulation.
    pub measured: Option<MeasuredDriverData>,
```

### Step 3: Add to WayJson in system_api.rs

In `WayJson` struct (~line 91), add:

```rust
    #[serde(default)]
    pub measured: Option<MeasuredDriverData>,
```

And in `SystemInputJson::to_project()`, pass it through:

```rust
    measured: w.measured.clone(),
```

### Step 4: Run tests, commit

Run: `cd solver && cargo test`
Expected: All 95 tests pass (new field is Option, defaults to None).

---

## Task 2: System Solver Uses Measured Data When Present

### Files
- Modify: `solver/src/system.rs` — branch on `way.measured`

### Step 1: Replace the simulation call with measured data branch

In `solve_system()` (~line 100), the current code does:
```rust
let raw_input = SimulationInput { ... };
let raw_result = solve_simulation(&raw_input)?;
```

Replace with:

```rust
// If measured FRD/ZMA data is available, use it instead of T/S simulation.
// Interpolate measured data to the system frequency grid.
let (raw_spl, raw_phase, raw_z_mag, raw_z_phase, raw_displacement) = if let Some(ref m) = way.measured {
    // Interpolate measured data onto system frequency grid (log-freq linear interp)
    let interp = |src_f: &[f64], src_v: &[f64], target_f: f64| -> f64 {
        if src_f.is_empty() { return 0.0; }
        if target_f <= src_f[0] { return src_v[0]; }
        if target_f >= *src_f.last().unwrap() { return *src_v.last().unwrap(); }
        for w in src_f.windows(2).zip(src_v.windows(2)) {
            let (fw, vw) = w;
            if target_f >= fw[0] && target_f <= fw[1] {
                let t = (target_f.ln() - fw[0].ln()) / (fw[1].ln() - fw[0].ln());
                return vw[0] + t * (vw[1] - vw[0]);
            }
        }
        *src_v.last().unwrap()
    };

    let spl: Vec<f64> = freqs.iter().map(|&f| interp(&m.frequencies_hz, &m.spl_db, f)).collect();
    let phase: Vec<f64> = freqs.iter().map(|&f| interp(&m.frequencies_hz, &m.phase_deg, f)).collect();
    let z_mag: Vec<f64> = if m.impedance_ohm.is_empty() {
        vec![way.driver.re_ohm; n] // fallback to Re if no ZMA
    } else {
        freqs.iter().map(|&f| interp(&m.frequencies_hz, &m.impedance_ohm, f)).collect()
    };
    let z_phase: Vec<f64> = if m.impedance_phase_deg.is_empty() {
        vec![0.0; n]
    } else {
        freqs.iter().map(|&f| interp(&m.frequencies_hz, &m.impedance_phase_deg, f)).collect()
    };
    way_max_displacement_mm.push(0.0); // no displacement data from FRD
    (spl, phase, z_mag, z_phase, false)
} else {
    // T/S-based simulation (existing code)
    let raw_input = SimulationInput {
        driver: way.driver.clone(),
        enclosure: way.enclosure.clone(),
        freq_start_hz: project.freq_start_hz,
        freq_end_hz: project.freq_end_hz,
        freq_points: project.freq_points,
        drive_voltage_rms: project.drive_voltage_rms,
    };
    let raw_result = solve_simulation(&raw_input)?;
    let max_disp = raw_result.cone_displacement_mm.iter().cloned().fold(0.0_f64, f64::max);
    way_max_displacement_mm.push(max_disp);
    (raw_result.spl_db, raw_result.acoustic_phase_deg, raw_result.impedance_ohm, raw_result.impedance_phase_deg, true)
};
```

Then update the per-frequency loop to use these arrays instead of `raw_result`:

```rust
for (i, &f) in freqs.iter().enumerate() {
    let omega = TWO_PI * f;
    let z_driver = Complex::from_polar(raw_z_mag[i], raw_z_phase[i].to_radians());
    // ... rest uses raw_spl[i], raw_phase[i] instead of raw_result.spl_db[i]

    // Use actual acoustic phase from FRD (not minimum-phase approx)
    let p_mag = 10.0_f64.powf(raw_spl[i] / 20.0) * 20e-6;
    let p_raw = Complex::from_polar(p_mag, raw_phase[i].to_radians());
    // ... rest of the loop unchanged
```

The key change: when FRD has real phase data, we use `Complex::from_polar(mag, phase)` instead of `Complex::new(mag, 0.0)`. This gives physically accurate summation in the crossover region.

### Step 2: Run tests, commit

Run: `cd solver && cargo test`
Expected: All tests pass (measured is None in all existing tests).

---

## Task 3: Wire Measured Data Through WASM API

### Files
- Modify: `solver/src/lib.rs` — no changes needed (WayJson already passes through)
- Verify: the `to_project()` conversion carries `measured` field

### Step 1: Verify to_project handles measured field

In `system_api.rs`, `SystemInputJson::to_project()` maps WayJson → Way.
Add `measured: w.measured.clone()` to the Way construction.

### Step 2: Run tests, commit

---

## Task 4: Add FRD/ZMA Import Per Way in UI

### Files
- Modify: `web/src/types/index.ts` — add `measured` to WayInput
- Modify: `web/src/components/MultiWayEditor.tsx` — add FRD/ZMA import buttons per way
- The parsers already exist: `web/src/io/frd.ts`, `web/src/io/zma.ts`

### Step 1: Add measured to WayInput type

```typescript
export interface WayInput {
  // ... existing fields ...
  measured?: {
    frequencies_hz: number[];
    spl_db: number[];
    phase_deg: number[];
    impedance_ohm: number[];
    impedance_phase_deg: number[];
  };
}
```

### Step 2: Add FRD/ZMA import UI to MultiWayEditor

After the driver inputs section, add import buttons:

```tsx
<div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
  <label className="graf-btn graf-btn-sm graf-btn-outline" style={{ cursor: 'pointer', fontSize: 11 }}>
    Import FRD
    <input type="file" accept=".frd,.txt" hidden onChange={(e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      file.text().then(text => {
        const frd = parseFrd(text);
        updateWay(activeWay, {
          measured: {
            ...way.measured,
            frequencies_hz: frd.frequencies,
            spl_db: frd.spl_db,
            phase_deg: frd.phase_deg,
            impedance_ohm: way.measured?.impedance_ohm ?? [],
            impedance_phase_deg: way.measured?.impedance_phase_deg ?? [],
          }
        });
      });
    }} />
  </label>
  <label className="graf-btn graf-btn-sm graf-btn-outline" style={{ cursor: 'pointer', fontSize: 11 }}>
    Import ZMA
    <input type="file" accept=".zma,.txt" hidden onChange={(e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      file.text().then(text => {
        const zma = parseZma(text);
        updateWay(activeWay, {
          measured: {
            ...way.measured,
            frequencies_hz: way.measured?.frequencies_hz ?? zma.frequencies,
            spl_db: way.measured?.spl_db ?? [],
            phase_deg: way.measured?.phase_deg ?? [],
            impedance_ohm: zma.impedance_ohm,
            impedance_phase_deg: zma.phase_deg,
          }
        });
      });
    }} />
  </label>
  {way.measured && (
    <button className="graf-btn graf-btn-sm" style={{ fontSize: 11 }}
      onClick={() => updateWay(activeWay, { measured: undefined })}
      title="Remove measured data and revert to T/S simulation">
      Clear FRD/ZMA
    </button>
  )}
</div>
{way.measured && (
  <div style={{ fontSize: 10, color: 'var(--graf-warm-500)', marginTop: 2 }}>
    FRD: {way.measured.spl_db.length > 0 ? `${way.measured.spl_db.length} points` : 'none'}
    {' | '}
    ZMA: {way.measured.impedance_ohm.length > 0 ? `${way.measured.impedance_ohm.length} points` : 'none'}
    {' — Using measured data (T/S simulation bypassed)'}
  </div>
)}
```

### Step 3: TypeScript check, commit

Run: `cd web && npx tsc --noEmit`

---

## Task 5: Pass Measured Data to System Solver

### Files
- Modify: `web/src/solver/wasm-bridge.ts` — no changes needed (SystemInput already includes ways with all fields)
- Verify: the JSON serialization includes `measured` when present

The existing `runSystemSimulation` and `runOptimizer` both serialize the full SystemInput as JSON. Since `measured` is an optional field on WayInput, it will be included in the JSON when present. The Rust side deserializes it via `#[serde(default)]`.

### Step 1: Verify end-to-end by manually constructing a test case

In the browser console, after importing an FRD file, verify that:
1. The system simulation runs without error
2. The per-way SPL plot shows the FRD data (not the T/S curve)
3. The system SPL shows the crossover applied to the FRD data

### Step 2: Run optimizer with FRD data

Set up a 2-way system where both ways have FRD data imported. Run the optimizer.
Verify: crossover frequencies and gain values change, cost decreases.

---

## Task 6: Test with Real Driver Data

### Files
- Create: `solver/tests/frd_tests.rs` — test measured data path

### Step 1: Create synthetic FRD test data

```rust
#[test]
fn system_with_measured_data_bypasses_simulation() {
    use loudspeaker_solver::types::MeasuredDriverData;
    // Create a way with flat 90 dB measured response
    let measured = MeasuredDriverData {
        frequencies_hz: vec![100.0, 1000.0, 10000.0],
        spl_db: vec![90.0, 90.0, 90.0],
        phase_deg: vec![0.0, 0.0, 0.0],
        impedance_ohm: vec![8.0, 8.0, 8.0],
        impedance_phase_deg: vec![0.0, 0.0, 0.0],
    };
    // Build a way with measured data and an LR4 LP at 2kHz
    let project = SpeakerProject {
        ways: vec![Way {
            // T/S params still required for Xmax/Re but simulation bypassed
            driver: DriverParams { ... },
            enclosure: EnclosureConfig::Sealed(...),
            measured: Some(measured),
            active_filters: vec![ActiveFilter::LR4LowPass { freq_hz: 2000.0 }],
            // ... other fields ...
        }],
        freq_start_hz: 100.0, freq_end_hz: 10000.0, freq_points: 50,
        drive_voltage_rms: 2.83,
    };
    let result = solve_system(&project).unwrap();
    // At 500 Hz (well below LP), SPL should be ~90 dB (measured data, no filter rolloff)
    // At 5000 Hz (above LP), SPL should be much lower (LR4 rolloff)
    let spl_500 = result.system_spl_db[...]; // find index near 500 Hz
    let spl_5000 = result.system_spl_db[...]; // find index near 5000 Hz
    assert!(spl_500 > 85.0, "Below LP should be near measured 90 dB");
    assert!(spl_5000 < spl_500 - 20.0, "Above LP should be rolled off");
}
```

### Step 2: Obtain real FRD/ZMA files

Download from manufacturer websites:
- SB Acoustics SB17NRXC35-4: https://sbacoustics.com (measurement data section)
- Scan-Speak D2008/851200: check diyaudio.com or hificollective.co.uk for published FRD

Alternatively, export FRD/ZMA from our own T/S simulation and re-import as a round-trip test.

### Step 3: Run optimizer with real FRD data and compare to T/S-based results

This is the key validation: does the optimizer produce better real-world results when given measured data?

---

## Verification Plan

After all 6 tasks:

1. `cargo test` — all solver tests pass
2. `npx tsc --noEmit` — TypeScript compiles
3. `npm run build` — production build succeeds
4. Visual test in browser:
   - Single-way: import FRD, verify SPL plot shows FRD data instead of T/S curve
   - Multi-way: import FRD for both ways, run optimizer, verify crossover is applied to FRD data
   - Round-trip: export FRD from T/S sim, re-import, verify identical plot
5. Optimizer test: compare cost and ripple with FRD vs T/S for same driver pair
6. Deploy to ls.graf.me.uk

---

## Implementation Order Summary

```
Task 1 (Rust types)      ← MeasuredDriverData struct, Option on Way
Task 2 (solver logic)    ← interpolation + branch in solve_system
Task 3 (WASM bridge)     ← verify JSON passthrough
Task 4 (UI import)       ← FRD/ZMA file input per way
Task 5 (integration)     ← verify end-to-end
Task 6 (real data test)  ← validate with actual measurements
```

Tasks 1-3 are Rust-side. Task 4 is TypeScript. Tasks 5-6 are integration/verification.
