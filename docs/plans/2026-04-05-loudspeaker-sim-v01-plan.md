# Loudspeaker Simulator v0.1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a browser-based loudspeaker enclosure simulator with sealed, vented, and transmission line models, producing real-time SPL/impedance/displacement plots.

**Architecture:** Rust solver crate compiled to WASM via wasm-pack, consumed by a React 19 + Vite frontend. All computation client-side. Static deploy to ls.graf.me.uk.

**Tech Stack:** Rust (nalgebra, num-complex, serde, wasm-bindgen), React 19, TypeScript, Vite, uPlot, Graf Design System (GDS)

**Design doc:** `docs/plans/2026-04-05-loudspeaker-sim-design.md`

**IP rules:** Clean-room Rust implementation. Can study Hornresp VB6 and os-lem Python to understand algorithms. Implement from acoustic theory with citations. No verbatim code copy. Use Hornresp v60 as test oracle.

---

## Prerequisites

- Rust toolchain: `rustup`, `cargo`, `wasm-pack` (NOT currently installed — Task 0 handles this)
- Node.js 22 + npm 10 (already installed)
- wasm32-unknown-unknown target for Rust

---

## Task 0: Install Rust Toolchain + Project Scaffold

**Context:** No Rust toolchain exists on this Windows machine. We need rustup, cargo, wasm-pack, and the WASM target. Then create the monorepo structure.

**Step 1: Install Rust via rustup**

Run:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustc --version
```
Expected: `rustc 1.x.x`

If `curl | sh` doesn't work on Windows Git Bash, download and run `rustup-init.exe` from https://rustup.rs instead:
```bash
# Alternative for Windows:
winget install Rustlang.Rustup
```

**Step 2: Add WASM target and install wasm-pack**

Run:
```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
wasm-pack --version
```
Expected: `wasm-pack 0.x.x`

**Step 3: Create Rust solver crate**

Run:
```bash
cd C:/Users/deper/Cursor/Cursor-hornresp
cargo init --lib solver
```

Then replace `solver/Cargo.toml`:

```toml
[package]
name = "loudspeaker-solver"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
nalgebra = "0.33"
num-complex = "0.4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
wasm-bindgen = "0.2"

[dev-dependencies]
approx = "0.5"

[profile.release]
opt-level = "s"       # Optimize for WASM size
lto = true
```

**Step 4: Verify Rust builds**

Run:
```bash
cd solver && cargo build
```
Expected: `Compiling loudspeaker-solver v0.1.0` ... `Finished`

**Step 5: Create React frontend**

Run:
```bash
cd C:/Users/deper/Cursor/Cursor-hornresp
npm create vite@latest web -- --template react-ts
cd web && npm install
```

**Step 6: Verify frontend builds**

Run:
```bash
cd C:/Users/deper/Cursor/Cursor-hornresp/web && npm run build
```
Expected: Build succeeds, `dist/` created.

**Step 7: Create project files**

Create `C:/Users/deper/Cursor/Cursor-hornresp/.gitignore`:
```
# Rust
solver/target/
solver/pkg/

# Node
web/node_modules/
web/dist/

# OS
.DS_Store
Thumbs.db

# Executables (reference only, not tracked)
*.exe
```

Create `C:/Users/deper/Cursor/Cursor-hornresp/CLAUDE.md`:
```markdown
# CLAUDE.md — Loudspeaker Simulator

## Project Overview
Browser-based loudspeaker enclosure + crossover simulator. Combines Hornresp (enclosure modeling) and XSim (crossover design) functionality in a single web app.

## Architecture
- `solver/` — Rust crate compiled to WASM. All acoustic simulation math lives here.
- `web/` — React 19 + Vite + TypeScript frontend. GDS for styling.
- Static deploy to ls.graf.me.uk. Zero server dependencies.

## Build Commands
```bash
# Rust solver → WASM
cd solver && wasm-pack build --target web --release

# React frontend
cd web && npm run build

# Development
cd solver && cargo test                    # run solver tests
cd solver && cargo test -- --nocapture     # with output
cd web && npm run dev                      # Vite dev server
```

## IP Rules
- Clean-room Rust implementation
- Can study Hornresp VB6 and os-lem Python to learn algorithms
- Implement from published acoustic theory (Thiele, Small, Beranek, Bailey, etc.)
- Every equation must have a comment citing its source
- No verbatim code copied from any source
- Use Hornresp v60 + XSim4 as behavioral test oracles

## Key Design Decisions
- Rust/WASM for solver performance and IP separation
- All computation client-side (no server)
- Logarithmic frequency sweep, typically 500 points 10Hz–20kHz
- Transfer Matrix Method for transmission lines
- Modified Nodal Analysis for crossover networks (v0.2+)

## Testing
- `cargo test` in solver/ for unit + integration tests
- Oracle tests compare output against Hornresp v60 reference data in solver/tests/validation/
- Every formula has a test proving it matches published values

## Design Docs
- Design: `docs/plans/2026-04-05-loudspeaker-sim-design.md`
- Plan: `docs/plans/2026-04-05-loudspeaker-sim-v01-plan.md`
- References: `docs/REFERENCES.md`
```

**Step 8: Commit scaffold**

```bash
cd C:/Users/deper/Cursor/Cursor-hornresp
git add solver/Cargo.toml solver/src/lib.rs web/package.json web/vite.config.ts web/tsconfig.json web/src/ .gitignore CLAUDE.md docs/
git commit -m "feat: project scaffold — Rust solver crate + React frontend + CLAUDE.md"
```

---

## Task 1: Physical Constants + Types

**Context:** Foundation types and constants used by every module. Small, self-contained, easy to test.

**Files:**
- Create: `solver/src/constants.rs`
- Create: `solver/src/types.rs`
- Modify: `solver/src/lib.rs`

**Step 1: Write the test**

Create `solver/tests/constants_tests.rs`:
```rust
use loudspeaker_solver::constants::*;

#[test]
fn physical_constants_are_reasonable() {
    // Air density at 20°C, 1 atm
    assert!((RHO_0 - 1.2041).abs() < 1e-4);
    // Speed of sound at 20°C
    assert!((C_0 - 343.21).abs() < 0.1);
    // Characteristic impedance = ρ₀ × c₀
    assert!((Z_0 - RHO_0 * C_0).abs() < 0.01);
    // Reference pressure for SPL
    assert!((P_REF - 20e-6).abs() < 1e-10);
}
```

**Step 2: Run test to verify it fails**

Run: `cd solver && cargo test constants_tests`
Expected: FAIL — module `constants` not found

**Step 3: Implement constants.rs**

```rust
//! Physical constants for acoustic simulation.
//!
//! All values at standard conditions: 20°C, 1 atm, dry air.
//! Reference: Beranek, L.L. "Acoustics" (1954, revised 1986), Table 1.1

/// Air density (kg/m³) at 20°C, 1 atm
pub const RHO_0: f64 = 1.2041;

/// Speed of sound in air (m/s) at 20°C
pub const C_0: f64 = 343.21;

/// Characteristic acoustic impedance of air (Pa·s/m)
pub const Z_0: f64 = RHO_0 * C_0;

/// Reference sound pressure for SPL calculations (Pa)
/// 0 dB SPL = 20 µPa — threshold of human hearing at 1 kHz
pub const P_REF: f64 = 20e-6;

/// Standard drive voltage (V RMS) — 2.83V = 1W into 8Ω
pub const DEFAULT_DRIVE_V_RMS: f64 = 2.83;

/// Two times PI, used frequently in ω = 2πf
pub const TWO_PI: f64 = 2.0 * std::f64::consts::PI;
```

**Step 4: Implement types.rs**

```rust
//! Core data types for the loudspeaker solver.

use serde::{Deserialize, Serialize};

/// Thiele-Small parameters as entered by the user.
/// Reference: Small, R.H. "Direct-Radiator Loudspeaker System Analysis" (JAES, 1972)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverParams {
    /// Resonant frequency (Hz)
    pub fs_hz: f64,
    /// DC resistance (Ω)
    pub re_ohm: f64,
    /// Voice coil inductance (H) — user enters mH, convert before storing
    pub le_h: f64,
    /// Electrical Q factor (dimensionless)
    pub qes: f64,
    /// Mechanical Q factor (dimensionless)
    pub qms: f64,
    /// Equivalent compliance volume (m³) — user enters L, convert before storing
    pub vas_m3: f64,
    /// Effective cone area (m²) — user enters cm², convert before storing
    pub sd_m2: f64,
    /// Maximum linear excursion (m) — user enters mm, convert before storing
    pub xmax_m: f64,
}

/// Derived electromechanical parameters (computed from DriverParams).
/// These are the canonical form used by the solver.
#[derive(Debug, Clone)]
pub struct DerivedDriver {
    /// All user-facing params preserved
    pub params: DriverParams,
    /// Total Q factor: Qts = (Qes × Qms) / (Qes + Qms)
    pub qts: f64,
    /// Mechanical compliance (m/N)
    pub cms: f64,
    /// Moving mass (kg)
    pub mms: f64,
    /// Mechanical resistance (N·s/m)
    pub rms: f64,
    /// Force factor (T·m)
    pub bl: f64,
}

/// Sealed box enclosure parameters.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SealedBoxParams {
    /// Internal box volume (m³) — user enters L, convert before storing
    pub volume_m3: f64,
    /// Box loss factor Ql (dimensionless, typically 5–15; default 7)
    pub ql: f64,
}

/// Vented box (bass reflex) enclosure parameters.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VentedBoxParams {
    /// Internal box volume (m³)
    pub volume_m3: f64,
    /// Port cross-sectional area (m²)
    pub port_area_m2: f64,
    /// Port physical length (m) — before end corrections
    pub port_length_m: f64,
    /// Number of ports (default 1)
    pub num_ports: u32,
    /// Port is flanged (affects end correction)
    pub port_flanged: bool,
    /// Box loss factor Ql
    pub ql: f64,
}

/// Transmission line enclosure parameters.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransmissionLineParams {
    /// Line physical length (m)
    pub length_m: f64,
    /// Cross-sectional area at driver end (m²)
    pub area_driver_m2: f64,
    /// Cross-sectional area at open end (m²) — same as driver end if straight
    pub area_mouth_m2: f64,
    /// Number of segments for TMM discretization (default 20)
    pub num_segments: u32,
    /// Stuffing density (kg/m³) — 0 = no stuffing
    pub stuffing_density_kg_m3: f64,
    /// Specific flow resistivity of stuffing material (Pa·s/m²)
    /// Typical polyester fill: ~3500–8000; fiberglass: ~10000–40000
    /// Reference: Bradbury (1976)
    pub flow_resistivity_pa_s_m2: f64,
    /// Open end (true = quarter-wave TL) or closed end
    pub open_end: bool,
}

/// Enclosure configuration — one of the supported types.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EnclosureConfig {
    Sealed(SealedBoxParams),
    Vented(VentedBoxParams),
    TransmissionLine(TransmissionLineParams),
}

/// Full simulation input sent from JS to WASM.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationInput {
    pub driver: DriverParams,
    pub enclosure: EnclosureConfig,
    pub freq_start_hz: f64,
    pub freq_end_hz: f64,
    pub freq_points: usize,
    pub drive_voltage_rms: f64,
}

/// Full simulation output returned from WASM to JS.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationResult {
    pub frequencies_hz: Vec<f64>,
    pub spl_db: Vec<f64>,
    pub impedance_ohm: Vec<f64>,
    pub impedance_phase_deg: Vec<f64>,
    pub cone_displacement_mm: Vec<f64>,
    pub group_delay_ms: Vec<f64>,
    /// Port air velocity — only present for Vented enclosures
    pub port_velocity_ms: Option<Vec<f64>>,
}
```

**Step 5: Wire up lib.rs**

Replace `solver/src/lib.rs`:
```rust
pub mod constants;
pub mod types;
```

**Step 6: Run tests**

Run: `cd solver && cargo test`
Expected: All pass

**Step 7: Commit**

```bash
git add solver/src/ solver/tests/
git commit -m "feat(solver): add physical constants and core types with citations"
```

---

## Task 2: Driver Parameter Derivation

**Context:** Convert user-facing Thiele-Small parameters to the derived electromechanical form used by the solver. This is the first real physics code.

**Files:**
- Create: `solver/src/driver.rs`
- Create: `solver/tests/driver_tests.rs`
- Modify: `solver/src/lib.rs`

**Step 1: Write the failing test**

Create `solver/tests/driver_tests.rs`:
```rust
use approx::assert_relative_eq;
use loudspeaker_solver::driver::derive_driver;
use loudspeaker_solver::types::DriverParams;

/// Reference driver: a typical 6.5" woofer.
/// Hand-calculated derived values verified against Thiele-Small theory.
fn reference_driver() -> DriverParams {
    DriverParams {
        fs_hz: 37.0,
        re_ohm: 6.5,
        le_h: 0.5e-3, // 0.5 mH
        qes: 0.42,
        qms: 3.5,
        vas_m3: 18.0e-3, // 18 L
        sd_m2: 132.0e-4, // 132 cm²
        xmax_m: 6.0e-3,  // 6 mm
    }
}

#[test]
fn qts_is_parallel_combination() {
    let d = derive_driver(&reference_driver());
    // Qts = (Qes × Qms) / (Qes + Qms)
    let expected_qts = (0.42 * 3.5) / (0.42 + 3.5);
    assert_relative_eq!(d.qts, expected_qts, epsilon = 1e-6);
}

#[test]
fn cms_from_vas_and_sd() {
    let d = derive_driver(&reference_driver());
    // Cms = Vas / (ρ₀ × c₀² × Sd²)
    // Vas = 18e-3 m³, Sd = 132e-4 m², ρ₀ = 1.2041, c₀ = 343.21
    let rho = 1.2041_f64;
    let c = 343.21_f64;
    let sd = 132.0e-4_f64;
    let expected_cms = 18.0e-3 / (rho * c * c * sd * sd);
    assert_relative_eq!(d.cms, expected_cms, epsilon = 1e-10);
}

#[test]
fn mms_from_fs_and_cms() {
    let d = derive_driver(&reference_driver());
    // Mms = 1 / ((2π × Fs)² × Cms)
    let omega_s = 2.0 * std::f64::consts::PI * 37.0;
    let expected_mms = 1.0 / (omega_s * omega_s * d.cms);
    assert_relative_eq!(d.mms, expected_mms, epsilon = 1e-10);
}

#[test]
fn rms_from_qms() {
    let d = derive_driver(&reference_driver());
    // Rms = 1 / (2π × Fs × Cms × Qms) = Mms × ωs / Qms
    let omega_s = 2.0 * std::f64::consts::PI * 37.0;
    let expected_rms = d.mms * omega_s / 3.5;
    assert_relative_eq!(d.rms, expected_rms, epsilon = 1e-10);
}

#[test]
fn bl_from_qes() {
    let d = derive_driver(&reference_driver());
    // Bl = √(Re × Mms × ωs / Qes)
    let omega_s = 2.0 * std::f64::consts::PI * 37.0;
    let expected_bl = (6.5 * d.mms * omega_s / 0.42).sqrt();
    assert_relative_eq!(d.bl, expected_bl, epsilon = 1e-6);
}

#[test]
fn round_trip_consistency() {
    // Verify derived params reconstruct Fs, Qes, Qms
    let p = reference_driver();
    let d = derive_driver(&p);
    let omega_s = 2.0 * std::f64::consts::PI * p.fs_hz;

    // Fs = 1 / (2π × √(Mms × Cms))
    let fs_check = 1.0 / (2.0 * std::f64::consts::PI * (d.mms * d.cms).sqrt());
    assert_relative_eq!(fs_check, p.fs_hz, epsilon = 1e-6);

    // Qms = Mms × ωs / Rms
    let qms_check = d.mms * omega_s / d.rms;
    assert_relative_eq!(qms_check, p.qms, epsilon = 1e-6);

    // Qes = Re × Mms × ωs / Bl²
    let qes_check = p.re_ohm * d.mms * omega_s / (d.bl * d.bl);
    assert_relative_eq!(qes_check, p.qes, epsilon = 1e-6);
}
```

**Step 2: Run test to verify it fails**

Run: `cd solver && cargo test driver_tests`
Expected: FAIL — module `driver` not found

**Step 3: Implement driver.rs**

```rust
//! Thiele-Small parameter derivation.
//!
//! Converts user-facing T/S parameters to the canonical electromechanical
//! form (Bl, Mms, Cms, Rms) used internally by all enclosure solvers.
//!
//! Reference: Small, R.H. "Direct-Radiator Loudspeaker System Analysis"
//! JAES Vol. 20, No. 5 (1972), Equations 1–14.

use crate::constants::{C_0, RHO_0, TWO_PI};
use crate::types::{DerivedDriver, DriverParams};

/// Derive canonical electromechanical parameters from Thiele-Small inputs.
pub fn derive_driver(p: &DriverParams) -> DerivedDriver {
    let omega_s = TWO_PI * p.fs_hz;

    // Qts: total Q — parallel combination of Qes and Qms
    // Small (1972), Eq. 6
    let qts = (p.qes * p.qms) / (p.qes + p.qms);

    // Cms: mechanical compliance (m/N)
    // Derived from Vas = ρ₀ × c₀² × Sd² × Cms
    // Small (1972), Eq. 3
    let cms = p.vas_m3 / (RHO_0 * C_0 * C_0 * p.sd_m2 * p.sd_m2);

    // Mms: moving mass (kg)
    // From resonance: ωs = 1/√(Mms × Cms) → Mms = 1/(ωs² × Cms)
    // Small (1972), Eq. 1
    let mms = 1.0 / (omega_s * omega_s * cms);

    // Rms: mechanical resistance (N·s/m)
    // From Qms = ωs × Mms / Rms → Rms = ωs × Mms / Qms
    // Small (1972), Eq. 5
    let rms = omega_s * mms / p.qms;

    // Bl: force factor (T·m)
    // From Qes = Re × Mms × ωs / Bl² → Bl = √(Re × Mms × ωs / Qes)
    // Small (1972), Eq. 4
    let bl = (p.re_ohm * mms * omega_s / p.qes).sqrt();

    DerivedDriver {
        params: p.clone(),
        qts,
        cms,
        mms,
        rms,
        bl,
    }
}
```

**Step 4: Add module to lib.rs**

Add `pub mod driver;` to `solver/src/lib.rs`.

**Step 5: Run tests**

Run: `cd solver && cargo test`
Expected: All pass (constants + driver tests)

**Step 6: Commit**

```bash
git add solver/src/driver.rs solver/tests/driver_tests.rs solver/src/lib.rs
git commit -m "feat(solver): driver T/S parameter derivation with round-trip tests"
```

---

## Task 3: Frequency Sweep Utility

**Context:** Generate logarithmically-spaced frequency arrays and convert SPL/impedance results. Used by all enclosure models.

**Files:**
- Create: `solver/src/sweep.rs`
- Create: `solver/tests/sweep_tests.rs`
- Modify: `solver/src/lib.rs`

**Step 1: Write the failing test**

Create `solver/tests/sweep_tests.rs`:
```rust
use approx::assert_relative_eq;
use loudspeaker_solver::sweep::*;

#[test]
fn log_spacing_endpoints() {
    let freqs = log_frequency_sweep(20.0, 20000.0, 100);
    assert_eq!(freqs.len(), 100);
    assert_relative_eq!(freqs[0], 20.0, epsilon = 1e-10);
    assert_relative_eq!(freqs[99], 20000.0, epsilon = 1e-6);
}

#[test]
fn log_spacing_is_geometric() {
    let freqs = log_frequency_sweep(10.0, 10000.0, 4);
    // 10, 100, 1000, 10000 — ratio of 10 between each
    assert_relative_eq!(freqs[1] / freqs[0], freqs[2] / freqs[1], epsilon = 1e-10);
}

#[test]
fn spl_from_pressure_reference() {
    // 1 Pa = 94 dB SPL
    let spl = pressure_to_spl_db(1.0);
    assert_relative_eq!(spl, 93.979, epsilon = 0.01);
}

#[test]
fn spl_at_reference_is_zero() {
    let spl = pressure_to_spl_db(20e-6);
    assert_relative_eq!(spl, 0.0, epsilon = 0.01);
}
```

**Step 2: Run test to verify it fails**

Run: `cd solver && cargo test sweep_tests`
Expected: FAIL

**Step 3: Implement sweep.rs**

```rust
//! Frequency sweep generation and level conversion utilities.

use crate::constants::P_REF;

/// Generate a logarithmically-spaced frequency array.
///
/// N points from f_start to f_end (inclusive), equally spaced on a log scale.
/// This is the standard for acoustic frequency response plots.
pub fn log_frequency_sweep(f_start: f64, f_end: f64, n_points: usize) -> Vec<f64> {
    assert!(n_points >= 2, "Need at least 2 frequency points");
    assert!(f_start > 0.0 && f_end > f_start, "Invalid frequency range");

    let log_start = f_start.ln();
    let log_end = f_end.ln();
    let step = (log_end - log_start) / (n_points as f64 - 1.0);

    (0..n_points)
        .map(|i| (log_start + step * i as f64).exp())
        .collect()
}

/// Convert RMS pressure (Pa) to SPL in dB.
///
/// SPL = 20 × log₁₀(p / p_ref), where p_ref = 20 µPa
/// Reference: Beranek, "Acoustics" (1954), Ch. 1
pub fn pressure_to_spl_db(p_rms: f64) -> f64 {
    20.0 * (p_rms / P_REF).log10()
}

/// Convert complex pressure magnitude to SPL in dB.
pub fn magnitude_to_spl_db(magnitude: f64) -> f64 {
    pressure_to_spl_db(magnitude)
}
```

**Step 4: Wire up and test**

Add `pub mod sweep;` to lib.rs.

Run: `cd solver && cargo test`
Expected: All pass

**Step 5: Commit**

```bash
git add solver/src/sweep.rs solver/tests/sweep_tests.rs solver/src/lib.rs
git commit -m "feat(solver): log frequency sweep and SPL conversion utilities"
```

---

## Task 4: Sealed Box Solver

**Context:** The simplest enclosure model. Second-order high-pass response. This proves the full solver pipeline works end-to-end.

**Files:**
- Create: `solver/src/sealed.rs`
- Create: `solver/tests/sealed_tests.rs`
- Modify: `solver/src/lib.rs`

**Step 1: Write the failing test**

Create `solver/tests/sealed_tests.rs`:
```rust
use approx::assert_relative_eq;
use loudspeaker_solver::driver::derive_driver;
use loudspeaker_solver::sealed::*;
use loudspeaker_solver::types::{DriverParams, SealedBoxParams};

fn test_driver() -> DriverParams {
    DriverParams {
        fs_hz: 37.0,
        re_ohm: 6.5,
        le_h: 0.5e-3,
        qes: 0.42,
        qms: 3.5,
        vas_m3: 18.0e-3,
        sd_m2: 132.0e-4,
        xmax_m: 6.0e-3,
    }
}

#[test]
fn sealed_system_resonance() {
    let driver = derive_driver(&test_driver());
    let enclosure = SealedBoxParams {
        volume_m3: 18.0e-3, // Vb = Vas → α = 1 → Fc = Fs × √2
        ql: 7.0,
    };
    let params = sealed_system_params(&driver, &enclosure);

    // When Vb = Vas, compliance ratio α = Vas/Vb = 1
    // Fc = Fs × √(1 + α) = 37 × √2 ≈ 52.33
    let expected_fc = 37.0 * 2.0_f64.sqrt();
    assert_relative_eq!(params.fc_hz, expected_fc, epsilon = 0.1);
}

#[test]
fn sealed_system_qtc() {
    let driver = derive_driver(&test_driver());
    let enclosure = SealedBoxParams {
        volume_m3: 18.0e-3,
        ql: 7.0,
    };
    let params = sealed_system_params(&driver, &enclosure);

    // Qtc = Qts × √(1 + α)
    let qts = (0.42 * 3.5) / (0.42 + 3.5);
    let expected_qtc = qts * 2.0_f64.sqrt();
    assert_relative_eq!(params.qtc, expected_qtc, epsilon = 0.01);
}

#[test]
fn sealed_spl_is_flat_above_resonance() {
    let driver = derive_driver(&test_driver());
    let enclosure = SealedBoxParams {
        volume_m3: 18.0e-3,
        ql: 7.0,
    };

    // SPL at 1kHz and 2kHz should be nearly identical (flat passband)
    let result = sealed_frequency_response(&driver, &enclosure, &[1000.0, 2000.0], 2.83);
    let diff = (result.spl_db[0] - result.spl_db[1]).abs();
    assert!(diff < 0.5, "Passband should be flat, got {} dB difference", diff);
}

#[test]
fn sealed_spl_rolls_off_below_resonance() {
    let driver = derive_driver(&test_driver());
    let enclosure = SealedBoxParams {
        volume_m3: 18.0e-3,
        ql: 7.0,
    };

    // Well below Fc, sealed box rolls off at -12 dB/octave
    // Check SPL at 10 Hz vs 20 Hz (one octave apart, both well below Fc ≈ 52 Hz)
    let result = sealed_frequency_response(&driver, &enclosure, &[10.0, 20.0], 2.83);
    let rolloff = result.spl_db[1] - result.spl_db[0]; // should be ~12 dB
    assert!(rolloff > 10.0 && rolloff < 14.0,
        "Expected ~12 dB/octave rolloff, got {} dB", rolloff);
}

#[test]
fn sealed_impedance_peak_at_fc() {
    let driver = derive_driver(&test_driver());
    let enclosure = SealedBoxParams {
        volume_m3: 18.0e-3,
        ql: 7.0,
    };

    // Sweep around Fc, impedance should peak there
    let freqs: Vec<f64> = (20..=100).map(|f| f as f64).collect();
    let result = sealed_frequency_response(&driver, &enclosure, &freqs, 2.83);

    let max_idx = result.impedance_ohm.iter()
        .enumerate()
        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
        .unwrap().0;

    let peak_freq = freqs[max_idx];
    let expected_fc = 37.0 * 2.0_f64.sqrt();
    assert!((peak_freq - expected_fc).abs() < 5.0,
        "Impedance peak at {} Hz, expected ~{:.0} Hz", peak_freq, expected_fc);
}
```

**Step 2: Run test to verify it fails**

Run: `cd solver && cargo test sealed_tests`
Expected: FAIL

**Step 3: Implement sealed.rs**

```rust
//! Sealed (closed) box loudspeaker model.
//!
//! A sealed box adds acoustic compliance in parallel with the driver's mechanical
//! compliance, raising the system resonance and Q factor.
//!
//! Reference: Small, R.H. "Closed-Box Loudspeaker Systems — Part I: Analysis"
//! JAES Vol. 20, No. 10 (1972), Equations 1–20.

use num_complex::Complex;

use crate::constants::{C_0, RHO_0, TWO_PI};
use crate::sweep::pressure_to_spl_db;
use crate::types::{DerivedDriver, SealedBoxParams, SimulationResult};

/// Computed system-level parameters for a sealed box.
pub struct SealedSystemParams {
    /// System resonance frequency (Hz)
    pub fc_hz: f64,
    /// System total Q factor
    pub qtc: f64,
    /// Compliance ratio α = Vas / Vb
    pub alpha: f64,
}

/// Compute sealed box system parameters.
///
/// Small (1972), Eq. 11: Fc = Fs × √(1 + Vas/Vb)
/// Small (1972), Eq. 12: Qtc = Qts × √(1 + Vas/Vb)
pub fn sealed_system_params(driver: &DerivedDriver, enclosure: &SealedBoxParams) -> SealedSystemParams {
    let alpha = driver.params.vas_m3 / enclosure.volume_m3;
    let sqrt_factor = (1.0 + alpha).sqrt();

    SealedSystemParams {
        fc_hz: driver.params.fs_hz * sqrt_factor,
        qtc: driver.qts * sqrt_factor,
        alpha,
    }
}

/// Compute frequency response for a sealed box system.
///
/// The transfer function is a second-order high-pass:
///   H(s) = s² / (s² + s×ωc/Qtc + ωc²)
///
/// where s = jω, ωc = 2π×Fc.
///
/// SPL is computed at 1m in half-space (2π steradians).
/// Reference: Small (1972), Eq. 15–17.
pub fn sealed_frequency_response(
    driver: &DerivedDriver,
    enclosure: &SealedBoxParams,
    frequencies_hz: &[f64],
    drive_voltage_rms: f64,
) -> SimulationResult {
    let sys = sealed_system_params(driver, enclosure);
    let omega_c = TWO_PI * sys.fc_hz;
    let p = &driver.params;

    // Reference SPL: sensitivity at 1m, 2.83V, 2π space
    // η₀ = (ρ₀ × Bl² × Sd²) / (2π × c₀ × Mms² × Re)
    // SPL_ref = 112.0 + 10×log₁₀(η₀) ... but we compute directly from transfer function.
    //
    // Direct approach: compute pressure from cone velocity at each frequency.
    // p(r=1m) = (ρ₀ × Sd × ω × v_cone) / (2π × r) for ka << 1 (piston in half-space)
    // Reference: Beranek, "Acoustics", Eq. 4.19

    let mut spl_db = Vec::with_capacity(frequencies_hz.len());
    let mut impedance_ohm = Vec::with_capacity(frequencies_hz.len());
    let mut impedance_phase_deg = Vec::with_capacity(frequencies_hz.len());
    let mut displacement_mm = Vec::with_capacity(frequencies_hz.len());
    let mut group_delay_ms = Vec::with_capacity(frequencies_hz.len());

    let j = Complex::new(0.0, 1.0);

    for &f in frequencies_hz {
        let omega = TWO_PI * f;
        let s = j * omega;

        // === Electrical impedance ===
        // Zin = Re + s×Le + (Bl²) / (s×Mms + Rms + 1/(s×Cms_total))
        // where Cms_total = Cms × Vb / (Vas + Vb) = Cms / (1 + α)
        let cms_total = driver.cms / (1.0 + sys.alpha);
        let z_mech = s * driver.mms + driver.rms + 1.0 / (s * cms_total);
        let z_mot = driver.bl * driver.bl / z_mech; // motional impedance
        let z_in = p.re_ohm + s * p.le_h + z_mot;

        impedance_ohm.push(z_in.norm());
        impedance_phase_deg.push(z_in.arg().to_degrees());

        // === Voice coil current ===
        let i_coil = drive_voltage_rms / z_in;

        // === Cone velocity ===
        // F = Bl × I, v = F / Z_mech
        let force = driver.bl * i_coil;
        let v_cone = force / z_mech;

        // === Cone displacement ===
        // x = v / (jω)
        let x_cone = v_cone / (j * omega);
        displacement_mm.push(x_cone.norm() * 1000.0); // m → mm

        // === Sound pressure at 1m (half-space, ka << 1) ===
        // p = (ρ₀ × ω × Sd × v_cone) / (2π × r)
        // Simplified for r = 1m, 2π radiation
        // Reference: Beranek (1986), Ch. 4
        let p_acoustic = RHO_0 * omega * p.sd_m2 * v_cone / (2.0 * std::f64::consts::PI);
        spl_db.push(pressure_to_spl_db(p_acoustic.norm()));

        // === Group delay ===
        // τ = -dφ/dω, approximated numerically below
        // For now, compute from transfer function phase
        let ratio = s * s / (s * s + s * omega_c / sys.qtc + omega_c * omega_c);
        group_delay_ms.push(-ratio.arg() / omega * 1000.0);
    }

    SimulationResult {
        frequencies_hz: frequencies_hz.to_vec(),
        spl_db,
        impedance_ohm,
        impedance_phase_deg,
        cone_displacement_mm: displacement_mm,
        group_delay_ms,
        port_velocity_ms: None,
    }
}
```

**Step 4: Wire up and test**

Add `pub mod sealed;` to lib.rs.

Run: `cd solver && cargo test`
Expected: All pass

**Step 5: Commit**

```bash
git add solver/src/sealed.rs solver/tests/sealed_tests.rs solver/src/lib.rs
git commit -m "feat(solver): sealed box model — impedance, SPL, displacement"
```

---

## Task 5: Vented Box Solver

**Context:** Fourth-order high-pass from coupled Helmholtz resonator. More complex than sealed — two resonances (driver + port), port velocity output.

**Files:**
- Create: `solver/src/vented.rs`
- Create: `solver/tests/vented_tests.rs`
- Modify: `solver/src/lib.rs`

**Step 1: Write the failing test**

Create `solver/tests/vented_tests.rs`:
```rust
use approx::assert_relative_eq;
use loudspeaker_solver::driver::derive_driver;
use loudspeaker_solver::types::{DriverParams, VentedBoxParams};
use loudspeaker_solver::vented::*;

fn test_driver() -> DriverParams {
    DriverParams {
        fs_hz: 37.0,
        re_ohm: 6.5,
        le_h: 0.5e-3,
        qes: 0.42,
        qms: 3.5,
        vas_m3: 18.0e-3,
        sd_m2: 132.0e-4,
        xmax_m: 6.0e-3,
    }
}

fn test_enclosure() -> VentedBoxParams {
    VentedBoxParams {
        volume_m3: 25.0e-3, // 25 L
        port_area_m2: 20.0e-4, // 20 cm² (circular port ~5cm diameter)
        port_length_m: 0.15,   // 15 cm
        num_ports: 1,
        port_flanged: true,
        ql: 7.0,
    }
}

#[test]
fn port_resonance_frequency() {
    let enc = test_enclosure();
    let fb = port_resonance_hz(&enc);
    // Fb = c₀/(2π) × √(Sp/(Lp_eff × Vb))
    // With end correction for flanged: Lp_eff = Lp + 0.85 × d
    // d = √(4 × Sp / π) = √(4 × 20e-4 / π) ≈ 0.0505 m
    // Lp_eff ≈ 0.15 + 0.85 × 0.0505 ≈ 0.193 m
    // Fb ≈ 343.21/(2π) × √(20e-4 / (0.193 × 25e-3)) ≈ 35.0 Hz (approximate)
    assert!(fb > 25.0 && fb < 50.0, "Port resonance {} Hz out of range", fb);
}

#[test]
fn vented_has_two_impedance_peaks() {
    let driver = derive_driver(&test_driver());
    let enc = test_enclosure();
    let freqs: Vec<f64> = (15..=100).map(|f| f as f64).collect();
    let result = vented_frequency_response(&driver, &enc, &freqs, 2.83);

    // Find local maxima in impedance
    let peaks: Vec<usize> = (1..result.impedance_ohm.len() - 1)
        .filter(|&i| {
            result.impedance_ohm[i] > result.impedance_ohm[i - 1]
                && result.impedance_ohm[i] > result.impedance_ohm[i + 1]
        })
        .collect();

    assert_eq!(peaks.len(), 2,
        "Vented box should have exactly 2 impedance peaks, found {}", peaks.len());
}

#[test]
fn vented_rolls_off_at_24db_per_octave() {
    let driver = derive_driver(&test_driver());
    let enc = test_enclosure();

    // Well below tuning: -24 dB/octave (4th order)
    let result = vented_frequency_response(&driver, &enc, &[5.0, 10.0], 2.83);
    let rolloff = result.spl_db[1] - result.spl_db[0];
    // Should be ~24 dB per octave (allow 18–28 for tolerance)
    assert!(rolloff > 18.0 && rolloff < 30.0,
        "Expected ~24 dB/octave rolloff, got {} dB", rolloff);
}

#[test]
fn vented_has_port_velocity() {
    let driver = derive_driver(&test_driver());
    let enc = test_enclosure();
    let result = vented_frequency_response(&driver, &enc, &[30.0, 40.0, 50.0], 2.83);
    assert!(result.port_velocity_ms.is_some(), "Vented should return port velocity");

    let pv = result.port_velocity_ms.as_ref().unwrap();
    // Port velocity should be non-zero near tuning
    assert!(pv.iter().all(|&v| v > 0.0), "Port velocity should be positive");
}
```

**Step 2: Run test to verify it fails**

Run: `cd solver && cargo test vented_tests`
Expected: FAIL

**Step 3: Implement vented.rs**

```rust
//! Vented (bass reflex) box loudspeaker model.
//!
//! A vented box uses a port (duct) tuned to the Helmholtz resonance of the
//! box volume. This creates a fourth-order high-pass alignment with steeper
//! rolloff but extended bass compared to sealed.
//!
//! Reference: Small, R.H. "Vented-Box Loudspeaker Systems — Part I: Small-Signal Analysis"
//! JAES Vol. 21, No. 5 (1973), Equations 1–30.

use num_complex::Complex;

use crate::constants::{C_0, RHO_0, TWO_PI};
use crate::sweep::pressure_to_spl_db;
use crate::types::{DerivedDriver, SimulationResult, VentedBoxParams};

/// Compute effective port length including end corrections.
///
/// Flanged end correction: 0.85 × radius (one end flanged, one end free)
/// Unflanged end correction: 0.6 × radius
/// Reference: Kinsler & Frey, "Fundamentals of Acoustics" (1982), Table 9.1
pub fn effective_port_length(enc: &VentedBoxParams) -> f64 {
    let port_diameter = (4.0 * enc.port_area_m2 / std::f64::consts::PI).sqrt();
    let radius = port_diameter / 2.0;

    // End correction: one end is inside box (flanged), other depends on mounting
    let correction = if enc.port_flanged {
        0.85 * radius // flanged (flush-mounted)
    } else {
        0.6 * radius // unflanged (free-standing)
    };

    // Both ends get a correction (inner + outer)
    enc.port_length_m + 2.0 * correction
}

/// Compute port tuning frequency (Helmholtz resonance of box + port).
///
/// Fb = c₀/(2π) × √(Sp / (Lp_eff × Vb))
/// Reference: Small (1973), Eq. 5
pub fn port_resonance_hz(enc: &VentedBoxParams) -> f64 {
    let lp_eff = effective_port_length(enc);
    let total_port_area = enc.port_area_m2 * enc.num_ports as f64;
    C_0 / TWO_PI * (total_port_area / (lp_eff * enc.volume_m3)).sqrt()
}

/// Compute frequency response for a vented box system.
///
/// Uses the full electromechano-acoustic equivalent circuit:
/// - Driver: Re, Le, Bl, Mms, Rms, Cms
/// - Box compliance: Cab = Vb / (ρ₀ × c₀²)
/// - Port mass: Map = ρ₀ × Lp_eff / Sp
/// - Port loss: Rap (small, from viscous losses)
///
/// Reference: Small (1973), Fig. 2 equivalent circuit
pub fn vented_frequency_response(
    driver: &DerivedDriver,
    enclosure: &VentedBoxParams,
    frequencies_hz: &[f64],
    drive_voltage_rms: f64,
) -> SimulationResult {
    let p = &driver.params;
    let j = Complex::new(0.0, 1.0);

    // Acoustic parameters
    let cab = enclosure.volume_m3 / (RHO_0 * C_0 * C_0); // box compliance
    let lp_eff = effective_port_length(enclosure);
    let total_port_area = enclosure.port_area_m2 * enclosure.num_ports as f64;
    let map = RHO_0 * lp_eff / total_port_area; // port acoustic mass

    // Driver acoustic parameters (mechanical → acoustic domain via Sd²)
    let sd2 = p.sd_m2 * p.sd_m2;
    let mas = driver.mms / sd2;       // acoustic mass
    let ras = driver.rms / sd2;       // acoustic resistance
    let cas = driver.cms * sd2;       // acoustic compliance

    // Port loss — small viscous term
    let rap = 0.0; // Simplified: real port losses are complex; add in future version

    let mut spl_db = Vec::with_capacity(frequencies_hz.len());
    let mut impedance_ohm = Vec::with_capacity(frequencies_hz.len());
    let mut impedance_phase_deg = Vec::with_capacity(frequencies_hz.len());
    let mut displacement_mm = Vec::with_capacity(frequencies_hz.len());
    let mut group_delay_ms = Vec::with_capacity(frequencies_hz.len());
    let mut port_velocity = Vec::with_capacity(frequencies_hz.len());

    for &f in frequencies_hz {
        let omega = TWO_PI * f;
        let s = j * omega;

        // === Acoustic circuit (Small 1973, Fig. 2) ===
        // The box compliance Cab is shared between driver and port.
        // Driver side: Zas = s×Mas + Ras + 1/(s×Cas)
        // Port side: Zap = s×Map + Rap
        // Box compliance: Zcab = 1/(s×Cab)
        //
        // At the junction node (box pressure):
        // Volume velocity: Ud (driver) = Up (port) flows into Cab
        //
        // Total acoustic impedance seen by driver (reflected back):
        // Zab = Zcab in parallel with Zap
        let z_cab = 1.0 / (s * cab);
        let z_port = s * map + rap;
        let z_ab = (z_cab * z_port) / (z_cab + z_port); // parallel combination

        // Driver acoustic impedance including box load
        let z_driver_acoustic = s * mas + ras + 1.0 / (s * cas) + z_ab;

        // Convert back to electrical domain
        // Zmot = Bl² / (Sd² × Z_driver_acoustic) ... but we work in acoustic domain
        // Actually: Z_in = Re + s×Le + Bl²/(Sd² × Z_driver_acoustic) isn't right.
        // Correct: the mechanical impedance = Sd² × acoustic impedance
        let z_mech_total = sd2 * z_driver_acoustic;
        let z_mot = driver.bl * driver.bl / z_mech_total;
        let z_in = p.re_ohm + s * p.le_h + z_mot;

        impedance_ohm.push(z_in.norm());
        impedance_phase_deg.push(z_in.arg().to_degrees());

        // === Cone velocity and displacement ===
        let i_coil = drive_voltage_rms / z_in;
        let force = driver.bl * i_coil;
        let v_cone = force / z_mech_total;
        let x_cone = v_cone / (j * omega);
        displacement_mm.push(x_cone.norm() * 1000.0);

        // === Volume velocities ===
        // Driver volume velocity: Ud = Sd × v_cone
        let u_driver = p.sd_m2 * v_cone;

        // Box pressure: Pb = Ud × Zab (acoustic pressure in box)
        let p_box = u_driver * z_ab;

        // Port volume velocity: Up = Pb / Zap
        let u_port = p_box / z_port;

        // Port air velocity: v_port = Up / Sp
        let v_port = u_port / total_port_area;
        port_velocity.push(v_port.norm());

        // === Radiated sound ===
        // Total volume velocity radiating: Ud (driver front) + Up (port)
        // Both radiate into half-space
        // p = ρ₀ × ω × (Ud + Up) / (2π × r) for r = 1m
        // Note: driver rear radiates through port, signs matter.
        // Driver front: +Ud, Port: +Up (both radiate outward in typical alignment)
        let u_total = u_driver + u_port;
        let p_acoustic = RHO_0 * omega * u_total / (2.0 * std::f64::consts::PI);
        spl_db.push(pressure_to_spl_db(p_acoustic.norm()));

        // Group delay (simplified — from pressure phase)
        group_delay_ms.push(-p_acoustic.arg() / omega * 1000.0);
    }

    SimulationResult {
        frequencies_hz: frequencies_hz.to_vec(),
        spl_db,
        impedance_ohm,
        impedance_phase_deg,
        cone_displacement_mm: displacement_mm,
        group_delay_ms,
        port_velocity_ms: Some(port_velocity),
    }
}
```

**Step 4: Wire up and test**

Add `pub mod vented;` to lib.rs.

Run: `cd solver && cargo test`
Expected: All pass

**Step 5: Commit**

```bash
git add solver/src/vented.rs solver/tests/vented_tests.rs solver/src/lib.rs
git commit -m "feat(solver): vented box model — dual resonance, port velocity"
```

---

## Task 6: Transfer Matrix Primitives

**Context:** The transmission line model uses cascaded transfer matrices. This task builds the reusable matrix primitives before the full TL solver.

**Files:**
- Create: `solver/src/transfer_matrix.rs`
- Create: `solver/tests/transfer_matrix_tests.rs`
- Modify: `solver/src/lib.rs`

**Step 1: Write the failing test**

Create `solver/tests/transfer_matrix_tests.rs`:
```rust
use approx::assert_relative_eq;
use num_complex::Complex;
use loudspeaker_solver::transfer_matrix::*;

#[test]
fn identity_segment_passes_through() {
    // Zero-length segment should be identity matrix
    let j = Complex::new(0.0, 1.0);
    let omega = 2.0 * std::f64::consts::PI * 100.0;
    let k = Complex::new(omega / 343.21, 0.0);
    let z0 = Complex::new(1.2041 * 343.21 / 0.01, 0.0); // area = 0.01 m²

    let tm = duct_transfer_matrix(k, z0, 0.0);

    // Should be identity: [[1,0],[0,1]]
    assert_relative_eq!(tm[0][0].re, 1.0, epsilon = 1e-10);
    assert_relative_eq!(tm[0][1].norm(), 0.0, epsilon = 1e-10);
    assert_relative_eq!(tm[1][0].norm(), 0.0, epsilon = 1e-10);
    assert_relative_eq!(tm[1][1].re, 1.0, epsilon = 1e-10);
}

#[test]
fn cascade_of_two_halves_equals_whole() {
    let omega = 2.0 * std::f64::consts::PI * 200.0;
    let k = Complex::new(omega / 343.21, -0.5); // lossy
    let z0 = Complex::new(1.2041 * 343.21 / 0.01, 0.0);
    let length = 0.5;

    let whole = duct_transfer_matrix(k, z0, length);
    let half = duct_transfer_matrix(k, z0, length / 2.0);
    let cascaded = cascade_2x2(&half, &half);

    for i in 0..2 {
        for ji in 0..2 {
            assert_relative_eq!(cascaded[i][ji].re, whole[i][ji].re, epsilon = 1e-10);
            assert_relative_eq!(cascaded[i][ji].im, whole[i][ji].im, epsilon = 1e-10);
        }
    }
}

#[test]
fn reciprocity_det_equals_one() {
    // For a passive lossless segment, det(T) = 1
    let omega = 2.0 * std::f64::consts::PI * 500.0;
    let k = Complex::new(omega / 343.21, 0.0); // lossless
    let z0 = Complex::new(1.2041 * 343.21 / 0.005, 0.0);
    let tm = duct_transfer_matrix(k, z0, 0.3);

    let det = tm[0][0] * tm[1][1] - tm[0][1] * tm[1][0];
    assert_relative_eq!(det.re, 1.0, epsilon = 1e-10);
    assert_relative_eq!(det.im, 0.0, epsilon = 1e-10);
}
```

**Step 2: Run test to verify it fails**

Run: `cd solver && cargo test transfer_matrix_tests`
Expected: FAIL

**Step 3: Implement transfer_matrix.rs**

```rust
//! Transfer matrix primitives for acoustic waveguide modeling.
//!
//! The transfer matrix (ABCD matrix) relates pressure and volume velocity
//! at the input of an acoustic element to its output:
//!
//!   |P_in |   | A  B | |P_out |
//!   |U_in | = | C  D | |U_out |
//!
//! For a uniform duct segment of length L:
//!   A = D = cos(kL)
//!   B = j×Z₀×sin(kL)
//!   C = j×sin(kL)/Z₀
//!
//! Reference: Leach, W.M. "Electroacoustics and Audio Amplifier Design",
//! Chapter on transmission line loudspeakers, Eq. 8.25–8.30.

use num_complex::Complex;

/// 2×2 transfer matrix stored as [[A, B], [C, D]].
pub type TransferMatrix2x2 = [[Complex<f64>; 2]; 2];

/// Compute the transfer matrix for a uniform duct segment.
///
/// # Arguments
/// * `k` — Complex wave number (rad/m). Real part = ω/c, imaginary part = -α (absorption)
/// * `z0` — Characteristic acoustic impedance = ρ₀c₀/S (Pa·s/m³)
/// * `length` — Segment length (m)
///
/// Reference: Leach, "Electroacoustics", Eq. 8.26
pub fn duct_transfer_matrix(
    k: Complex<f64>,
    z0: Complex<f64>,
    length: f64,
) -> TransferMatrix2x2 {
    let kl = k * length;
    let cos_kl = kl.cos();
    let sin_kl = kl.sin();
    let j = Complex::new(0.0, 1.0);

    [
        [cos_kl, j * z0 * sin_kl],
        [j * sin_kl / z0, cos_kl],
    ]
}

/// Cascade (multiply) two 2×2 transfer matrices.
///
/// T_total = T1 × T2
/// This models two acoustic elements in series.
pub fn cascade_2x2(t1: &TransferMatrix2x2, t2: &TransferMatrix2x2) -> TransferMatrix2x2 {
    [
        [
            t1[0][0] * t2[0][0] + t1[0][1] * t2[1][0],
            t1[0][0] * t2[0][1] + t1[0][1] * t2[1][1],
        ],
        [
            t1[1][0] * t2[0][0] + t1[1][1] * t2[1][0],
            t1[1][0] * t2[0][1] + t1[1][1] * t2[1][1],
        ],
    ]
}

/// Identity transfer matrix (no-op element).
pub fn identity_2x2() -> TransferMatrix2x2 {
    let zero = Complex::new(0.0, 0.0);
    let one = Complex::new(1.0, 0.0);
    [[one, zero], [zero, one]]
}

/// Compute complex wave number with stuffing absorption.
///
/// k = ω/c₀ - j×α(ω)
///
/// Absorption model (simplified Bradbury):
///   α = Rf / (2 × ρ₀ × c₀)
///
/// Full frequency-dependent model from Bradbury (1976):
///   α(ω) = (Rf / (2ρ₀c₀)) × (1 + (some f-dependent correction))
///
/// For v0.1 we use the simplified frequency-independent form.
/// Reference: Bradbury, L.J.S. "The Use of Fibrous Materials in
/// Loudspeaker Enclosures" (JAES, 1976), Eq. 12.
pub fn complex_wave_number(
    omega: f64,
    c0: f64,
    rho0: f64,
    flow_resistivity: f64,
) -> Complex<f64> {
    let k_real = omega / c0;
    let alpha = flow_resistivity / (2.0 * rho0 * c0);
    Complex::new(k_real, -alpha)
}

/// Characteristic acoustic impedance for a duct of given cross-section.
///
/// Z₀ = ρ₀ × c₀ / S
pub fn characteristic_impedance(rho0: f64, c0: f64, area: f64) -> Complex<f64> {
    Complex::new(rho0 * c0 / area, 0.0)
}
```

**Step 4: Wire up and test**

Add `pub mod transfer_matrix;` to lib.rs.

Run: `cd solver && cargo test`
Expected: All pass

**Step 5: Commit**

```bash
git add solver/src/transfer_matrix.rs solver/tests/transfer_matrix_tests.rs solver/src/lib.rs
git commit -m "feat(solver): transfer matrix primitives for waveguide modeling"
```

---

## Task 7: Transmission Line Solver

**Context:** The TL model divides the line into N segments, builds transfer matrices per segment (with optional taper and stuffing), cascades them, and solves for the driver load impedance and radiated sound.

**Files:**
- Create: `solver/src/transmission_line.rs`
- Create: `solver/tests/tl_tests.rs`
- Modify: `solver/src/lib.rs`

**Step 1: Write the failing test**

Create `solver/tests/tl_tests.rs`:
```rust
use approx::assert_relative_eq;
use loudspeaker_solver::driver::derive_driver;
use loudspeaker_solver::transmission_line::*;
use loudspeaker_solver::types::{DriverParams, TransmissionLineParams};

fn test_driver() -> DriverParams {
    DriverParams {
        fs_hz: 37.0,
        re_ohm: 6.5,
        le_h: 0.5e-3,
        qes: 0.42,
        qms: 3.5,
        vas_m3: 18.0e-3,
        sd_m2: 132.0e-4,
        xmax_m: 6.0e-3,
    }
}

fn quarter_wave_tl() -> TransmissionLineParams {
    // Quarter wave at ~37 Hz: λ/4 = c/(4×f) = 343/(4×37) ≈ 2.32 m
    TransmissionLineParams {
        length_m: 2.32,
        area_driver_m2: 132.0e-4, // match driver Sd
        area_mouth_m2: 132.0e-4,  // straight (no taper)
        num_segments: 20,
        stuffing_density_kg_m3: 0.0, // no stuffing
        flow_resistivity_pa_s_m2: 0.0,
        open_end: true,
    }
}

#[test]
fn tl_quarter_wave_dip_near_fs() {
    let driver = derive_driver(&test_driver());
    let tl = quarter_wave_tl();

    // Sweep around the quarter-wave frequency
    let freqs: Vec<f64> = (25..=50).map(|f| f as f64).collect();
    let result = tl_frequency_response(&driver, &tl, &freqs, 2.83);

    // Impedance should have a minimum near the quarter-wave frequency
    // (the open pipe presents zero impedance at its resonance)
    let min_idx = result.impedance_ohm.iter()
        .enumerate()
        .min_by(|a, b| a.1.partial_cmp(b.1).unwrap())
        .unwrap().0;

    let dip_freq = freqs[min_idx];
    // Quarter wave of 2.32m: f = c/(4L) = 343/(4×2.32) ≈ 37 Hz
    assert!((dip_freq - 37.0).abs() < 5.0,
        "Impedance dip at {} Hz, expected near 37 Hz", dip_freq);
}

#[test]
fn tl_with_stuffing_damps_resonances() {
    let driver = derive_driver(&test_driver());
    let mut tl = quarter_wave_tl();

    // Without stuffing
    let freqs: Vec<f64> = (20..=200).map(|f| f as f64).collect();
    let result_bare = tl_frequency_response(&driver, &tl, &freqs, 2.83);

    // With stuffing
    tl.stuffing_density_kg_m3 = 10.0; // light polyester fill
    tl.flow_resistivity_pa_s_m2 = 5000.0;
    let result_stuffed = tl_frequency_response(&driver, &tl, &freqs, 2.83);

    // Stuffing should reduce impedance variation (flatter curve)
    let bare_range = result_bare.impedance_ohm.iter().cloned()
        .fold(f64::INFINITY, f64::min)
        ..=*result_bare.impedance_ohm.iter()
        .max_by(|a, b| a.partial_cmp(b).unwrap()).unwrap();
    let stuffed_range = result_stuffed.impedance_ohm.iter().cloned()
        .fold(f64::INFINITY, f64::min)
        ..=*result_stuffed.impedance_ohm.iter()
        .max_by(|a, b| a.partial_cmp(b).unwrap()).unwrap();

    let bare_span = bare_range.end() - bare_range.start();
    let stuffed_span = stuffed_range.end() - stuffed_range.start();

    assert!(stuffed_span < bare_span,
        "Stuffing should reduce impedance variation: bare={:.1}, stuffed={:.1}",
        bare_span, stuffed_span);
}

#[test]
fn tapered_tl_shifts_frequency() {
    let driver = derive_driver(&test_driver());
    let mut tl = quarter_wave_tl();

    // Expand mouth area — tapered line shifts effective length
    tl.area_mouth_m2 = 300.0e-4; // wider mouth

    let freqs: Vec<f64> = (20..=60).map(|f| f as f64).collect();
    let result = tl_frequency_response(&driver, &tl, &freqs, 2.83);

    // Should still produce a valid response (no NaN/Inf)
    assert!(result.spl_db.iter().all(|v| v.is_finite()),
        "Tapered TL produced non-finite SPL values");
    assert!(result.impedance_ohm.iter().all(|v| v.is_finite()),
        "Tapered TL produced non-finite impedance values");
}
```

**Step 2: Run test to verify it fails**

Run: `cd solver && cargo test tl_tests`
Expected: FAIL

**Step 3: Implement transmission_line.rs**

```rust
//! Transmission line (TL) loudspeaker model.
//!
//! Uses the Transfer Matrix Method (TMM) to model a distributed acoustic
//! waveguide behind the driver. The line is divided into N segments, each
//! with its own cross-sectional area (for tapered lines) and damping.
//!
//! References:
//! - Bailey, A.R. "A Non-Resonant Loudspeaker Enclosure Design"
//!   (Wireless World, 1965) — original TL concept
//! - King, M.J. "Quarter Wavelength Loudspeaker Design" (2005-2020)
//!   — practical TL design methodology
//! - Bradbury, L.J.S. "The Use of Fibrous Materials in Loudspeaker Enclosures"
//!   (JAES, 1976) — stuffing absorption model

use num_complex::Complex;

use crate::constants::{C_0, RHO_0, TWO_PI};
use crate::sweep::pressure_to_spl_db;
use crate::transfer_matrix::{
    cascade_2x2, characteristic_impedance, complex_wave_number, duct_transfer_matrix,
    identity_2x2,
};
use crate::types::{DerivedDriver, SimulationResult, TransmissionLineParams};

/// Compute cross-sectional area at position x along a linearly-tapered line.
///
/// Linear taper in radius (not area), so area varies quadratically:
///   r(x) = r_driver + (r_mouth - r_driver) × (x / L)
///   S(x) = π × r(x)²
fn area_at_position(tl: &TransmissionLineParams, x: f64) -> f64 {
    let r_driver = (tl.area_driver_m2 / std::f64::consts::PI).sqrt();
    let r_mouth = (tl.area_mouth_m2 / std::f64::consts::PI).sqrt();
    let r = r_driver + (r_mouth - r_driver) * (x / tl.length_m);
    std::f64::consts::PI * r * r
}

/// Compute TL frequency response using cascaded transfer matrices.
pub fn tl_frequency_response(
    driver: &DerivedDriver,
    tl: &TransmissionLineParams,
    frequencies_hz: &[f64],
    drive_voltage_rms: f64,
) -> SimulationResult {
    let p = &driver.params;
    let j = Complex::new(0.0, 1.0);
    let n_seg = tl.num_segments.max(1) as usize;
    let seg_length = tl.length_m / n_seg as f64;

    let mut spl_db = Vec::with_capacity(frequencies_hz.len());
    let mut impedance_ohm = Vec::with_capacity(frequencies_hz.len());
    let mut impedance_phase_deg = Vec::with_capacity(frequencies_hz.len());
    let mut displacement_mm = Vec::with_capacity(frequencies_hz.len());
    let mut group_delay_ms = Vec::with_capacity(frequencies_hz.len());

    for &f in frequencies_hz {
        let omega = TWO_PI * f;
        let k = complex_wave_number(omega, C_0, RHO_0, tl.flow_resistivity_pa_s_m2);

        // Build cascaded transfer matrix for all segments
        let mut t_total = identity_2x2();
        for seg in 0..n_seg {
            let x_mid = (seg as f64 + 0.5) * seg_length;
            let area = area_at_position(tl, x_mid);
            let z0 = characteristic_impedance(RHO_0, C_0, area);
            let t_seg = duct_transfer_matrix(k, z0, seg_length);
            t_total = cascade_2x2(&t_total, &t_seg);
        }

        // Termination impedance at mouth
        // Open end: radiation impedance of a piston in a baffle (simplified)
        //   Zrad ≈ ρ₀c₀/Sm × (0.5×(ka)² + j×0.6×ka) for ka < 1
        //   where a = √(Sm/π), k = ω/c₀
        // Reference: Beranek, "Acoustics" (1986), Eq. 5.12
        let mouth_area = tl.area_mouth_m2;
        let a_mouth = (mouth_area / std::f64::consts::PI).sqrt();
        let ka = (omega / C_0) * a_mouth;
        let z_rad = if tl.open_end {
            let z0_mouth = RHO_0 * C_0 / mouth_area;
            Complex::new(z0_mouth * 0.5 * ka * ka, z0_mouth * 0.6133 * ka)
        } else {
            // Closed end: infinite impedance (rigid wall)
            Complex::new(1e12, 0.0)
        };

        // Apply transfer matrix: [P_in, U_in] = T × [P_out, U_out]
        // At termination: P_out = Zrad × U_out
        // So: P_in = (A×Zrad + B) × U_out
        //     U_in = (C×Zrad + D) × U_out
        // Line input impedance: Zline = P_in/U_in = (A×Zrad + B)/(C×Zrad + D)
        let a = t_total[0][0];
        let b = t_total[0][1];
        let c_mat = t_total[1][0];
        let d = t_total[1][1];

        let z_line = (a * z_rad + b) / (c_mat * z_rad + d);

        // Convert line acoustic impedance to mechanical domain
        // The driver sees the line input impedance through its cone area:
        //   Z_mech_line = Sd² × Z_acoustic_line
        let sd2 = p.sd_m2 * p.sd_m2;
        let z_mech_line = sd2 * z_line;

        // Total mechanical impedance on driver
        let s = j * omega;
        let z_mech_total = s * driver.mms + driver.rms + 1.0 / (s * driver.cms) + z_mech_line;

        // Electrical impedance
        let z_mot = driver.bl * driver.bl / z_mech_total;
        let z_in = p.re_ohm + s * p.le_h + z_mot;

        impedance_ohm.push(z_in.norm());
        impedance_phase_deg.push(z_in.arg().to_degrees());

        // Current, velocity, displacement
        let i_coil = drive_voltage_rms / z_in;
        let force = driver.bl * i_coil;
        let v_cone = force / z_mech_total;
        let x_cone = v_cone / (j * omega);
        displacement_mm.push(x_cone.norm() * 1000.0);

        // Volume velocity into line
        let u_driver = p.sd_m2 * v_cone;

        // Volume velocity at mouth: U_out = U_in / (C×Zrad + D)
        let u_mouth = u_driver / (c_mat * z_rad + d);

        // Radiated sound: driver front + mouth
        // Driver front radiates directly; mouth radiates with phase from propagation
        // Total: p = ρ₀ω/(2π) × (Sd×v_cone + Sm×u_mouth/Sm) at r=1m
        // Simplified: both as monopoles
        let p_driver = RHO_0 * omega * u_driver / (2.0 * std::f64::consts::PI);
        let p_mouth = RHO_0 * omega * u_mouth / (2.0 * std::f64::consts::PI);
        let p_total = p_driver + p_mouth;
        spl_db.push(pressure_to_spl_db(p_total.norm()));

        group_delay_ms.push(-p_total.arg() / omega * 1000.0);
    }

    SimulationResult {
        frequencies_hz: frequencies_hz.to_vec(),
        spl_db,
        impedance_ohm,
        impedance_phase_deg,
        cone_displacement_mm: displacement_mm,
        group_delay_ms,
        port_velocity_ms: None, // TL doesn't have a discrete "port"
    }
}
```

**Step 4: Wire up and test**

Add `pub mod transmission_line;` to lib.rs.

Run: `cd solver && cargo test`
Expected: All pass

**Step 5: Commit**

```bash
git add solver/src/transmission_line.rs solver/tests/tl_tests.rs solver/src/lib.rs
git commit -m "feat(solver): transmission line model with TMM, taper, stuffing"
```

---

## Task 8: WASM API Entry Points

**Context:** Expose the solver to JavaScript via wasm-bindgen. Single entry point: JSON in → JSON out.

**Files:**
- Modify: `solver/src/lib.rs`
- Create: `solver/tests/api_tests.rs`

**Step 1: Write the failing test**

Create `solver/tests/api_tests.rs`:
```rust
use loudspeaker_solver::types::*;
use loudspeaker_solver::solve_simulation;

#[test]
fn sealed_simulation_end_to_end() {
    let input = SimulationInput {
        driver: DriverParams {
            fs_hz: 37.0,
            re_ohm: 6.5,
            le_h: 0.5e-3,
            qes: 0.42,
            qms: 3.5,
            vas_m3: 18.0e-3,
            sd_m2: 132.0e-4,
            xmax_m: 6.0e-3,
        },
        enclosure: EnclosureConfig::Sealed(SealedBoxParams {
            volume_m3: 18.0e-3,
            ql: 7.0,
        }),
        freq_start_hz: 20.0,
        freq_end_hz: 20000.0,
        freq_points: 500,
        drive_voltage_rms: 2.83,
    };

    let result = solve_simulation(&input);

    assert_eq!(result.frequencies_hz.len(), 500);
    assert_eq!(result.spl_db.len(), 500);
    assert_eq!(result.impedance_ohm.len(), 500);
    assert_eq!(result.cone_displacement_mm.len(), 500);
    assert!(result.port_velocity_ms.is_none());

    // All values should be finite
    assert!(result.spl_db.iter().all(|v| v.is_finite()));
    assert!(result.impedance_ohm.iter().all(|v| v.is_finite() && *v > 0.0));
}

#[test]
fn vented_simulation_end_to_end() {
    let input = SimulationInput {
        driver: DriverParams {
            fs_hz: 37.0,
            re_ohm: 6.5,
            le_h: 0.5e-3,
            qes: 0.42,
            qms: 3.5,
            vas_m3: 18.0e-3,
            sd_m2: 132.0e-4,
            xmax_m: 6.0e-3,
        },
        enclosure: EnclosureConfig::Vented(VentedBoxParams {
            volume_m3: 25.0e-3,
            port_area_m2: 20.0e-4,
            port_length_m: 0.15,
            num_ports: 1,
            port_flanged: true,
            ql: 7.0,
        }),
        freq_start_hz: 20.0,
        freq_end_hz: 20000.0,
        freq_points: 500,
        drive_voltage_rms: 2.83,
    };

    let result = solve_simulation(&input);
    assert!(result.port_velocity_ms.is_some());
    assert_eq!(result.port_velocity_ms.as_ref().unwrap().len(), 500);
}

#[test]
fn tl_simulation_end_to_end() {
    let input = SimulationInput {
        driver: DriverParams {
            fs_hz: 37.0,
            re_ohm: 6.5,
            le_h: 0.5e-3,
            qes: 0.42,
            qms: 3.5,
            vas_m3: 18.0e-3,
            sd_m2: 132.0e-4,
            xmax_m: 6.0e-3,
        },
        enclosure: EnclosureConfig::TransmissionLine(TransmissionLineParams {
            length_m: 2.32,
            area_driver_m2: 132.0e-4,
            area_mouth_m2: 132.0e-4,
            num_segments: 20,
            stuffing_density_kg_m3: 10.0,
            flow_resistivity_pa_s_m2: 5000.0,
            open_end: true,
        }),
        freq_start_hz: 20.0,
        freq_end_hz: 20000.0,
        freq_points: 500,
        drive_voltage_rms: 2.83,
    };

    let result = solve_simulation(&input);
    assert!(result.spl_db.iter().all(|v| v.is_finite()));
}
```

**Step 2: Run test to verify it fails**

Run: `cd solver && cargo test api_tests`
Expected: FAIL — `solve_simulation` not found

**Step 3: Implement solve_simulation in lib.rs**

Replace `solver/src/lib.rs`:
```rust
pub mod constants;
pub mod driver;
pub mod sealed;
pub mod sweep;
pub mod transfer_matrix;
pub mod transmission_line;
pub mod types;
pub mod vented;

use driver::derive_driver;
use sealed::sealed_frequency_response;
use sweep::log_frequency_sweep;
use transmission_line::tl_frequency_response;
use types::*;
use vented::vented_frequency_response;
use wasm_bindgen::prelude::*;

/// Main solver entry point — dispatches to the appropriate enclosure model.
pub fn solve_simulation(input: &SimulationInput) -> SimulationResult {
    let driver = derive_driver(&input.driver);
    let freqs = log_frequency_sweep(input.freq_start_hz, input.freq_end_hz, input.freq_points);

    match &input.enclosure {
        EnclosureConfig::Sealed(enc) => {
            sealed_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
        EnclosureConfig::Vented(enc) => {
            vented_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
        EnclosureConfig::TransmissionLine(enc) => {
            tl_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
    }
}

/// WASM entry point: accepts JSON string, returns JSON string.
/// This is the only function called from JavaScript.
#[wasm_bindgen]
pub fn simulate(input_json: &str) -> Result<String, JsValue> {
    let input: SimulationInput = serde_json::from_str(input_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid input: {}", e)))?;

    let result = solve_simulation(&input);

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}
```

**Step 4: Run tests**

Run: `cd solver && cargo test`
Expected: All pass

**Step 5: Build WASM**

Run: `cd solver && wasm-pack build --target web --dev`
Expected: `pkg/` directory created with `.wasm` + JS glue code

**Step 6: Commit**

```bash
git add solver/src/lib.rs solver/tests/api_tests.rs
git commit -m "feat(solver): WASM API entry point — JSON in, JSON out"
```

---

## Task 9: React Frontend — Project Setup + WASM Integration

**Context:** Set up the Vite + React project to load and call the WASM solver. This is the bridge between JS and Rust.

**Files:**
- Modify: `web/package.json` (add dependencies)
- Modify: `web/vite.config.ts` (WASM support)
- Create: `web/src/solver/wasm-bridge.ts`
- Create: `web/src/types/index.ts`
- Modify: `web/src/App.tsx` (proof of life: call solver, log result)

**Step 1: Install dependencies**

Run:
```bash
cd C:/Users/deper/Cursor/Cursor-hornresp/web
npm install uplot zustand
npm install -D @anthropic-ai/sdk  # not needed, skip
npm install -D vite-plugin-wasm vite-plugin-top-level-await
```

**Step 2: Configure Vite for WASM**

Replace `web/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  build: {
    target: 'esnext',
  },
});
```

**Step 3: Create TypeScript types mirroring Rust structs**

Create `web/src/types/index.ts`:
```typescript
export interface DriverParams {
  fs_hz: number;
  re_ohm: number;
  le_h: number;
  qes: number;
  qms: number;
  vas_m3: number;
  sd_m2: number;
  xmax_m: number;
}

export interface SealedBoxParams {
  volume_m3: number;
  ql: number;
}

export interface VentedBoxParams {
  volume_m3: number;
  port_area_m2: number;
  port_length_m: number;
  num_ports: number;
  port_flanged: boolean;
  ql: number;
}

export interface TransmissionLineParams {
  length_m: number;
  area_driver_m2: number;
  area_mouth_m2: number;
  num_segments: number;
  stuffing_density_kg_m3: number;
  flow_resistivity_pa_s_m2: number;
  open_end: boolean;
}

export type EnclosureConfig =
  | { Sealed: SealedBoxParams }
  | { Vented: VentedBoxParams }
  | { TransmissionLine: TransmissionLineParams };

export interface SimulationInput {
  driver: DriverParams;
  enclosure: EnclosureConfig;
  freq_start_hz: number;
  freq_end_hz: number;
  freq_points: number;
  drive_voltage_rms: number;
}

export interface SimulationResult {
  frequencies_hz: number[];
  spl_db: number[];
  impedance_ohm: number[];
  impedance_phase_deg: number[];
  cone_displacement_mm: number[];
  group_delay_ms: number[];
  port_velocity_ms: number[] | null;
}

export type EnclosureType = 'sealed' | 'vented' | 'transmission_line';
```

**Step 4: Create WASM bridge**

Create `web/src/solver/wasm-bridge.ts`:
```typescript
import type { SimulationInput, SimulationResult } from '../types';

let wasmModule: { simulate: (json: string) => string } | null = null;

export async function initSolver(): Promise<void> {
  // wasm-pack generates an init function and the module
  const wasm = await import('../../../solver/pkg/loudspeaker_solver');
  await wasm.default();
  wasmModule = wasm;
}

export function runSimulation(input: SimulationInput): SimulationResult {
  if (!wasmModule) {
    throw new Error('WASM solver not initialized. Call initSolver() first.');
  }
  const resultJson = wasmModule.simulate(JSON.stringify(input));
  return JSON.parse(resultJson);
}
```

**Step 5: Proof of life in App.tsx**

Replace `web/src/App.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { initSolver, runSimulation } from './solver/wasm-bridge';
import type { SimulationInput, SimulationResult } from './types';

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
    Sealed: { volume_m3: 18e-3, ql: 7 },
  },
  freq_start_hz: 20,
  freq_end_hz: 20000,
  freq_points: 500,
  drive_voltage_rms: 2.83,
};

function App() {
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initSolver()
      .then(() => {
        setReady(true);
        const r = runSimulation(DEFAULT_INPUT);
        setResult(r);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;
  if (!ready) return <div>Loading solver...</div>;

  return (
    <div>
      <h1>Loudspeaker Simulator</h1>
      <p>Solver loaded. {result ? `Got ${result.frequencies_hz.length} frequency points.` : 'No result.'}</p>
      {result && (
        <pre style={{ fontSize: 12, maxHeight: 300, overflow: 'auto' }}>
          SPL range: {Math.min(...result.spl_db).toFixed(1)} to {Math.max(...result.spl_db).toFixed(1)} dB{'\n'}
          Impedance range: {Math.min(...result.impedance_ohm).toFixed(1)} to {Math.max(...result.impedance_ohm).toFixed(1)} Ω{'\n'}
          Max displacement: {Math.max(...result.cone_displacement_mm).toFixed(2)} mm
        </pre>
      )}
    </div>
  );
}

export default App;
```

**Step 6: Build and verify**

```bash
# Build WASM first
cd C:/Users/deper/Cursor/Cursor-hornresp/solver && wasm-pack build --target web --dev

# Start dev server
cd C:/Users/deper/Cursor/Cursor-hornresp/web && npm run dev
```

Open browser → verify "Solver loaded. Got 500 frequency points." message.

**Step 7: Commit**

```bash
git add web/ solver/pkg/
git commit -m "feat(web): React + WASM integration — solver loads and runs in browser"
```

---

## Task 10: Plot Components (SPL, Impedance, Displacement)

**Context:** The core UX — interactive frequency response plots using uPlot. Three plots stacked vertically, all sharing a logarithmic frequency axis.

**Files:**
- Create: `web/src/components/PlotArea.tsx`
- Create: `web/src/components/FrequencyPlot.tsx`
- Modify: `web/src/App.tsx`

**Step 1: Create reusable FrequencyPlot component**

Create `web/src/components/FrequencyPlot.tsx`:
```typescript
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface FrequencyPlotProps {
  title: string;
  frequencies: number[];
  series: { label: string; data: number[]; color: string; dash?: number[] }[];
  yLabel: string;
  yMin?: number;
  yMax?: number;
  /** Horizontal reference line (e.g., Xmax limit) */
  refLine?: { value: number; label: string; color: string };
  width?: number;
  height?: number;
}

export function FrequencyPlot({
  title,
  frequencies,
  series,
  yLabel,
  yMin,
  yMax,
  refLine,
  width = 800,
  height = 250,
}: FrequencyPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!containerRef.current || frequencies.length === 0) return;

    // Build uPlot data: [x, y1, y2, ...]
    const data: uPlot.AlignedData = [
      frequencies,
      ...series.map((s) => s.data),
    ];

    const opts: uPlot.Options = {
      title,
      width,
      height,
      scales: {
        x: {
          distr: 2, // logarithmic
          log: 10,
        },
        y: {
          range: [yMin ?? null, yMax ?? null] as [number | null, number | null],
        },
      },
      axes: [
        {
          label: 'Frequency (Hz)',
          values: (_self: uPlot, ticks: number[]) =>
            ticks.map((v) => (v >= 1000 ? `${v / 1000}k` : String(Math.round(v)))),
        },
        { label: yLabel },
      ],
      series: [
        {}, // x-axis
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: 2,
          dash: s.dash,
        })),
      ],
      cursor: {
        drag: { x: false, y: false },
      },
    };

    // Destroy previous plot
    if (plotRef.current) {
      plotRef.current.destroy();
    }

    plotRef.current = new uPlot(opts, data, containerRef.current);

    return () => {
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [frequencies, series, title, yLabel, yMin, yMax, width, height]);

  return <div ref={containerRef} />;
}
```

**Step 2: Create PlotArea that composes three plots**

Create `web/src/components/PlotArea.tsx`:
```typescript
import type { SimulationResult } from '../types';
import { FrequencyPlot } from './FrequencyPlot';

interface PlotAreaProps {
  result: SimulationResult | null;
  xmaxMm?: number;
}

export function PlotArea({ result, xmaxMm }: PlotAreaProps) {
  if (!result) return <div>Run a simulation to see plots.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <FrequencyPlot
        title="SPL (dB) — 1m, 2.83V"
        frequencies={result.frequencies_hz}
        series={[
          { label: 'SPL', data: result.spl_db, color: '#2563eb' },
        ]}
        yLabel="dB SPL"
        yMin={40}
        yMax={110}
      />

      <FrequencyPlot
        title="Impedance (Ω)"
        frequencies={result.frequencies_hz}
        series={[
          { label: '|Z|', data: result.impedance_ohm, color: '#dc2626' },
        ]}
        yLabel="Ohms"
        yMin={0}
      />

      <FrequencyPlot
        title="Cone Displacement (mm)"
        frequencies={result.frequencies_hz}
        series={[
          { label: 'Excursion', data: result.cone_displacement_mm, color: '#16a34a' },
        ]}
        yLabel="mm"
        yMin={0}
        refLine={xmaxMm ? { value: xmaxMm, label: 'Xmax', color: '#ef4444' } : undefined}
      />

      {result.port_velocity_ms && (
        <FrequencyPlot
          title="Port Air Velocity (m/s)"
          frequencies={result.frequencies_hz}
          series={[
            { label: 'Port vel.', data: result.port_velocity_ms, color: '#9333ea' },
          ]}
          yLabel="m/s"
          yMin={0}
        />
      )}
    </div>
  );
}
```

**Step 3: Wire into App.tsx**

Update App.tsx to use PlotArea instead of the raw text dump. Replace the `<pre>` block with:
```typescript
<PlotArea result={result} xmaxMm={6} />
```

**Step 4: Verify in browser**

Run: `cd web && npm run dev`
Open browser → verify three plots render with realistic curves.

**Step 5: Commit**

```bash
git add web/src/components/
git commit -m "feat(web): SPL, impedance, displacement plots with uPlot"
```

---

## Task 11: Parameter Panel + Live Reactivity

**Context:** The left-hand parameter panel with driver inputs, enclosure type selector, and enclosure-specific inputs. Every change triggers a re-solve + re-plot.

**Files:**
- Create: `web/src/components/DriverInputs.tsx`
- Create: `web/src/components/EnclosureSelector.tsx`
- Create: `web/src/components/SealedInputs.tsx`
- Create: `web/src/components/VentedInputs.tsx`
- Create: `web/src/components/TransmissionLineInputs.tsx`
- Create: `web/src/components/ParameterPanel.tsx`
- Create: `web/src/hooks/useSolver.ts`
- Modify: `web/src/App.tsx`

This task is large but all components follow the same pattern: labeled numeric input → state update → debounced re-solve. The implementation details are straightforward React form components, so the plan provides the architecture and key hook, not every input field.

**Step 1: Create the solver hook**

Create `web/src/hooks/useSolver.ts`:
```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { runSimulation } from '../solver/wasm-bridge';
import type { SimulationInput, SimulationResult } from '../types';

/**
 * Debounced solver hook. Runs simulation whenever input changes,
 * with a configurable debounce delay.
 */
export function useSolver(input: SimulationInput, debounceMs = 50) {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const solve = useCallback(() => {
    try {
      const r = runSimulation(input);
      setResult(r);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [input]);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(solve, debounceMs);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [solve, debounceMs]);

  return { result, error };
}
```

**Step 2: Create parameter panel components**

Each input component takes its params + onChange callback. Example pattern for `DriverInputs.tsx`:

```typescript
import type { DriverParams } from '../types';

interface Props {
  params: DriverParams;
  onChange: (params: DriverParams) => void;
}

export function DriverInputs({ params, onChange }: Props) {
  const update = (field: keyof DriverParams, value: number) =>
    onChange({ ...params, [field]: value });

  return (
    <fieldset>
      <legend>Driver (Thiele-Small)</legend>
      <label>Fs (Hz) <input type="number" value={params.fs_hz} step={1}
        onChange={e => update('fs_hz', +e.target.value)} /></label>
      <label>Re (Ω) <input type="number" value={params.re_ohm} step={0.1}
        onChange={e => update('re_ohm', +e.target.value)} /></label>
      <label>Le (mH) <input type="number" value={params.le_h * 1000} step={0.1}
        onChange={e => update('le_h', +e.target.value / 1000)} /></label>
      <label>Qes <input type="number" value={params.qes} step={0.01}
        onChange={e => update('qes', +e.target.value)} /></label>
      <label>Qms <input type="number" value={params.qms} step={0.1}
        onChange={e => update('qms', +e.target.value)} /></label>
      <label>Vas (L) <input type="number" value={params.vas_m3 * 1000} step={0.5}
        onChange={e => update('vas_m3', +e.target.value / 1000)} /></label>
      <label>Sd (cm²) <input type="number" value={params.sd_m2 * 1e4} step={1}
        onChange={e => update('sd_m2', +e.target.value / 1e4)} /></label>
      <label>Xmax (mm) <input type="number" value={params.xmax_m * 1000} step={0.5}
        onChange={e => update('xmax_m', +e.target.value / 1000)} /></label>
    </fieldset>
  );
}
```

Follow same pattern for `SealedInputs.tsx`, `VentedInputs.tsx`, `TransmissionLineInputs.tsx` — each with enclosure-specific fields using user-friendly units (L, cm, cm², kg/m³).

`EnclosureSelector.tsx` — radio buttons or tabs for sealed/vented/TL.

`ParameterPanel.tsx` — composes all the above, builds `SimulationInput`, passes to useSolver.

**Step 3: Wire into App.tsx with useSolver**

```typescript
function App() {
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState<SimulationInput>(DEFAULT_INPUT);
  const { result, error } = useSolver(input);
  // ... render ParameterPanel + PlotArea
}
```

**Step 4: Verify live reactivity**

Run: `cd web && npm run dev`
Change a parameter → plots should update within ~50ms.

**Step 5: Commit**

```bash
git add web/src/
git commit -m "feat(web): parameter panel with live solver reactivity"
```

---

## Task 12: Presets + Save/Load

**Context:** Built-in driver presets and localStorage persistence.

**Files:**
- Create: `web/src/presets/drivers.ts`
- Create: `web/src/components/PresetSelector.tsx`
- Create: `web/src/components/SaveLoadControls.tsx`
- Create: `web/src/hooks/useDesignStore.ts`

**Step 1: Create driver presets**

Create `web/src/presets/drivers.ts`:
```typescript
import type { DriverParams } from '../types';

export interface DriverPreset {
  name: string;
  description: string;
  params: DriverParams;
}

export const DRIVER_PRESETS: DriverPreset[] = [
  {
    name: 'Generic 6.5" Woofer',
    description: 'Typical mid-woofer for 2-way bookshelf speakers',
    params: {
      fs_hz: 37, re_ohm: 6.5, le_h: 0.5e-3,
      qes: 0.42, qms: 3.5, vas_m3: 18e-3,
      sd_m2: 132e-4, xmax_m: 6e-3,
    },
  },
  {
    name: 'Generic 10" Subwoofer',
    description: 'Long-throw subwoofer for sealed or vented boxes',
    params: {
      fs_hz: 25, re_ohm: 3.5, le_h: 1.2e-3,
      qes: 0.45, qms: 6.0, vas_m3: 80e-3,
      sd_m2: 346e-4, xmax_m: 12e-3,
    },
  },
  {
    name: 'Generic 5" Midrange',
    description: 'Dedicated midrange for 3-way systems',
    params: {
      fs_hz: 55, re_ohm: 5.5, le_h: 0.3e-3,
      qes: 0.35, qms: 4.0, vas_m3: 8e-3,
      sd_m2: 83e-4, xmax_m: 4e-3,
    },
  },
  {
    name: 'Generic 8" Full-Range',
    description: 'Wide-band driver for transmission line enclosures',
    params: {
      fs_hz: 40, re_ohm: 8.0, le_h: 0.6e-3,
      qes: 0.38, qms: 4.5, vas_m3: 35e-3,
      sd_m2: 214e-4, xmax_m: 5e-3,
    },
  },
  {
    name: 'Generic 12" PA Woofer',
    description: 'High-sensitivity woofer for horn-loaded or vented PA cabs',
    params: {
      fs_hz: 45, re_ohm: 5.5, le_h: 0.8e-3,
      qes: 0.30, qms: 8.0, vas_m3: 120e-3,
      sd_m2: 480e-4, xmax_m: 5e-3,
    },
  },
];
```

**Step 2: Create save/load with localStorage**

Create `web/src/hooks/useDesignStore.ts`:
```typescript
import type { SimulationInput } from '../types';

const STORAGE_KEY = 'ls-designs';

export interface SavedDesign {
  name: string;
  timestamp: number;
  input: SimulationInput;
}

export function loadDesigns(): SavedDesign[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDesign(name: string, input: SimulationInput): void {
  const designs = loadDesigns();
  designs.push({ name, timestamp: Date.now(), input });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
}

export function deleteDesign(index: number): void {
  const designs = loadDesigns();
  designs.splice(index, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
}

export function exportDesignJson(input: SimulationInput): string {
  return JSON.stringify(input, null, 2);
}

export function importDesignJson(json: string): SimulationInput {
  return JSON.parse(json);
}
```

**Step 3: Build PresetSelector and SaveLoadControls components**

Standard React components — dropdown for presets, save/load/export/import buttons.

**Step 4: Verify**

- Select a preset → parameters change → plots update
- Save a design → refresh page → load it back
- Export JSON → import JSON round-trip

**Step 5: Commit**

```bash
git add web/src/
git commit -m "feat(web): driver presets, localStorage save/load, JSON export/import"
```

---

## Task 13: FRD/ZMA/CSV Import + Export

**Context:** Hornresp exports SPL as `.frd` and impedance as `.zma` — standard DIY audio formats. Our app must import and export these to interoperate with XSim, VituixCAD, REW, and Hornresp itself. CSV export for spreadsheet use.

**Files:**
- Create: `web/src/io/frd.ts`
- Create: `web/src/io/zma.ts`
- Create: `web/src/io/csv.ts`
- Create: `web/src/components/ImportExportControls.tsx`

**Step 1: Implement FRD parser + writer**

Create `web/src/io/frd.ts`:
```typescript
/**
 * FRD (Frequency Response Data) format — standard DIY audio format.
 * Used by Hornresp, XSim, VituixCAD, REW, ARTA, etc.
 *
 * Format: whitespace-separated, one measurement per line
 *   frequency_hz  spl_db  phase_deg
 * Comment lines start with * or !
 */

export interface FrdData {
  frequencies: number[];
  spl_db: number[];
  phase_deg: number[];
}

export function parseFrd(text: string): FrdData {
  const frequencies: number[] = [];
  const spl_db: number[] = [];
  const phase_deg: number[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('*') || trimmed.startsWith('!')) continue;
    const parts = trimmed.split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every(n => !isNaN(n))) {
      frequencies.push(parts[0]);
      spl_db.push(parts[1]);
      phase_deg.push(parts[2]);
    }
  }
  return { frequencies, spl_db, phase_deg };
}

export function writeFrd(data: FrdData): string {
  const lines = ['* Frequency Response Data — exported from ls.graf.me.uk'];
  for (let i = 0; i < data.frequencies.length; i++) {
    lines.push(
      `${data.frequencies[i].toFixed(2)}\t${data.spl_db[i].toFixed(3)}\t${data.phase_deg[i].toFixed(3)}`
    );
  }
  return lines.join('\n');
}
```

**Step 2: Implement ZMA parser + writer**

Create `web/src/io/zma.ts` — identical structure, different field names:
```typescript
export interface ZmaData {
  frequencies: number[];
  impedance_ohm: number[];
  phase_deg: number[];
}

export function parseZma(text: string): ZmaData { /* same pattern as FRD */ }
export function writeZma(data: ZmaData): string { /* same pattern */ }
```

**Step 3: Implement CSV export**

Create `web/src/io/csv.ts`:
```typescript
import type { SimulationResult } from '../types';

export function writeAllDataCsv(result: SimulationResult): string {
  const headers = ['Frequency (Hz)', 'SPL (dB)', 'Impedance (Ohm)',
    'Impedance Phase (deg)', 'Displacement (mm)', 'Group Delay (ms)'];
  if (result.port_velocity_ms) headers.push('Port Velocity (m/s)');

  const lines = [headers.join(',')];
  for (let i = 0; i < result.frequencies_hz.length; i++) {
    const row = [
      result.frequencies_hz[i].toFixed(2),
      result.spl_db[i].toFixed(3),
      result.impedance_ohm[i].toFixed(3),
      result.impedance_phase_deg[i].toFixed(3),
      result.cone_displacement_mm[i].toFixed(4),
      result.group_delay_ms[i].toFixed(4),
    ];
    if (result.port_velocity_ms) row.push(result.port_velocity_ms[i].toFixed(4));
    lines.push(row.join(','));
  }
  return lines.join('\n');
}
```

**Step 4: Create import/export UI controls**

Buttons for:
- Export FRD (triggers browser download of `.frd` file)
- Export ZMA (triggers browser download of `.zma` file)
- Export CSV (triggers browser download of `.csv` file)
- Import FRD (file picker → parse → display as overlay on SPL plot)
- Import ZMA (file picker → parse → display as overlay on impedance plot)

**Step 5: Verify**

- Export FRD from our app → import into Hornresp/XSim → data matches
- Export ZMA → same verification
- Import a Hornresp-exported FRD → overlay renders correctly
- CSV opens in Excel/Google Sheets with correct columns

**Step 6: Commit**

```bash
git add web/src/io/ web/src/components/ImportExportControls.tsx
git commit -m "feat(web): FRD/ZMA/CSV import and export — standard DIY audio formats"
```

---

## Task 14: Final Polish + Build + Deploy

**Context:** Clean up the UI, add the GDS styling, build for production, deploy to ls.graf.me.uk.

**Files:**
- Modify: Various web/src/ files for GDS integration
- Create: `web/src/App.css` (or GDS integration)
- Modify: `web/vite.config.ts` (production build settings)

**Step 1: Add GDS styling**

Install or link GDS from `github.com/flaviograf-AG/graf-design-system`. Apply to layout, inputs, buttons, fieldsets.

**Step 2: Production build**

```bash
cd C:/Users/deper/Cursor/Cursor-hornresp/solver && wasm-pack build --target web --release
cd C:/Users/deper/Cursor/Cursor-hornresp/web && npm run build
```

Verify `web/dist/` contains all assets including `.wasm`.

**Step 3: Test production build locally**

```bash
cd web && npx serve dist
```

Open browser → verify everything works.

**Step 4: Deploy to ls.graf.me.uk**

Copy `web/dist/` contents to the server. Exact deployment method depends on hosting setup (SCP, rsync, Cloudflare Pages, GitHub Actions).

**Step 5: Create REFERENCES.md**

Create `docs/REFERENCES.md` listing every academic citation used in the solver code, organized by module.

**Step 6: Final commit**

```bash
git add .
git commit -m "feat: v0.1 — sealed + vented + TL simulator with reactive plots"
```

---

## Summary

| Task | What | Depends on |
|------|------|-----------|
| 0 | Install Rust + scaffold project | — |
| 1 | Physical constants + types | 0 |
| 2 | Driver T/S parameter derivation | 1 |
| 3 | Frequency sweep utility | 1 |
| 4 | Sealed box solver | 2, 3 |
| 5 | Vented box solver | 2, 3 |
| 6 | Transfer matrix primitives | 1 |
| 7 | Transmission line solver | 2, 3, 6 |
| 8 | WASM API entry points | 4, 5, 7 |
| 9 | React + WASM integration | 0, 8 |
| 10 | Plot components (uPlot) | 9 |
| 11 | Parameter panel + reactivity | 9, 10 |
| 12 | Presets + save/load | 11 |
| 13 | FRD/ZMA/CSV import + export | 9, 12 |
| 14 | Polish + build + deploy | 13 |
| 8 | WASM API entry points | 4, 5, 7 |
| 9 | React + WASM integration | 0, 8 |
| 10 | Plot components (uPlot) | 9 |
| 11 | Parameter panel + reactivity | 9, 10 |
| 12 | Presets + save/load | 11 |
| 13 | Polish + build + deploy | 12 |
