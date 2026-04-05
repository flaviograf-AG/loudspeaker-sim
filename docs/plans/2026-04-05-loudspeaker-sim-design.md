# LoudSpeaker Simulator — Design Document

> **Project:** Browser-based loudspeaker enclosure + crossover simulator  
> **Domain:** `ls.graf.me.uk`  
> **Date:** 2026-04-05  
> **Status:** Draft — awaiting approval  

---

## 1. Vision

A modern, browser-based tool that combines **enclosure modeling** (Hornresp territory) and **crossover design** (XSim territory) into a single integrated workflow. Runs entirely client-side (React + Rust/WASM). No server, no accounts, no install. Open it, design a complete multi-way speaker system, see the response curves instantly.

Today, DIY speaker builders juggle two separate desktop apps:
1. **Hornresp** (VB6) — model each driver in its enclosure
2. **XSim** (Delphi) — design the crossover network between drivers

Both are Windows-only, closed-source, and show their age. No web tool unifies both workflows. We do.

**Not a clone of either.** Original UI, original code. All simulation math derived from published acoustic theory. Hornresp and XSim are used as behavioral references (test oracles) for validation.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────┐
│                    Browser                       │
│                                                  │
│  ┌──────────────┐     ┌──────────────────────┐  │
│  │  React UI    │────▶│  Rust/WASM Solver     │  │
│  │              │◀────│                        │  │
│  │  - Params    │     │  - Driver model        │  │
│  │  - Plots     │     │  - Enclosure models    │  │
│  │  - Presets   │     │  - Frequency sweep     │  │
│  │  - Export    │     │  - Transfer matrices   │  │
│  └──────────────┘     └──────────────────────┘  │
│         │                                        │
│         ▼                                        │
│  ┌──────────────┐                                │
│  │ localStorage │  (saved designs)               │
│  └──────────────┘                                │
└─────────────────────────────────────────────────┘
         │
    Static files served from ls.graf.me.uk
    (GitHub Pages, Nginx, or any CDN)
```

### 2.1 Rust Solver Crate (`solver/`)

A standalone Rust library compiled to WASM via `wasm-pack`. Zero JavaScript in the solver — pure Rust with `wasm-bindgen` exports.

**Dependencies:**
- `nalgebra` — complex matrix construction and linear solves
- `num-complex` — `Complex<f64>` arithmetic
- `serde` + `serde_json` — serialize input/output across WASM boundary
- `wasm-bindgen` — JS interop

**No runtime dependencies on numpy, scipy, or any Python code.**

### 2.2 React Frontend (`web/`)

- **Vite** build toolchain (fast, WASM-friendly)
- **React 19** with TypeScript
- **Plotting:** uPlot (lightweight, fast for real-time updates) or Plotly.js (richer but heavier)
- **UI:** Graf Design System (GDS) — `github.com/flaviograf-AG/graf-design-system`. Consistent with other Graf y Asociados products.
- **State:** React context or Zustand — parameters flow in, results flow out

### 2.3 Data Flow

```
User edits parameter (e.g., box volume)
        ↓
React state update
        ↓
Debounced call to WASM solver (< 50ms)
        ↓
Solver returns: { frequencies_hz: [], spl_db: [], impedance_ohm: [], displacement_mm: [] }
        ↓
Plots re-render
```

All computation happens synchronously in the main thread for v0.1. If sweep times exceed 100ms, move to Web Worker in v0.2.

---

## 3. Solver Design (Clean-Room)

### 3.1 IP Strategy

| Source | Usage | Rule |
|--------|-------|------|
| Published papers (Small, Thiele, Beranek, Bailey, King) | Equations | Direct implementation with citation |
| Acoustic textbooks | Theory | Reference for algorithm design |
| Hornresp (the application) | Behavioral oracle | Run same inputs, compare outputs for validation |
| Hornresp decompiled VB6 code | Study algorithms & logic | Read, learn, understand. Reimplement in Rust — no verbatim copy of VB6 |
| os-lem Python source (MIT) | Study solver architecture & math | Read, learn, understand. Reimplement in Rust. Include MIT notice in THIRD_PARTY_NOTICES if any algorithm is directly adapted |
| XSim4 (freeware, Delphi) | Study crossover solver & circuit modeling | Read, learn, understand. Reimplement in Rust — no verbatim copy of Delphi code |

Every equation in the solver will have a comment citing its source (author, year, equation number).

### 3.2 Physical Constants

```rust
pub const RHO_0: f64 = 1.2041;    // Air density (kg/m³) at 20°C
pub const C_0: f64 = 343.21;      // Speed of sound (m/s) at 20°C
pub const P_REF: f64 = 20e-6;     // Reference pressure (Pa) for SPL
```

### 3.3 Driver Model (Thiele-Small Parameters)

Inputs (user-facing):
```
Fs   — Resonant frequency (Hz)
Re   — DC resistance (Ω)
Le   — Voice coil inductance (mH)
Qes  — Electrical Q factor
Qms  — Mechanical Q factor
Vas  — Equivalent compliance volume (L)
Sd   — Effective cone area (cm²)
Xmax — Maximum linear excursion (mm)  [for displacement limits]
```

Derived internally:
```
Qts = (Qes × Qms) / (Qes + Qms)
Cms = Vas / (ρ₀ × c₀² × Sd²)         — mechanical compliance
Mms = 1 / ((2π × Fs)² × Cms)          — moving mass
Rms = 1 / (2π × Fs × Cms × Qms)       — mechanical resistance
Bl  = √(Re × Mms × 2π × Fs / Qes)     — force factor
```

**References:**
- Small, R.H. "Direct-Radiator Loudspeaker System Analysis" (JAES, 1972)
- Thiele, A.N. "Loudspeakers in Vented Boxes" (JAES, 1971)

### 3.4 Enclosure Models

#### 3.4.1 Sealed Box

Lumped compliance + driver. The simplest model.

**Equations:**
- System resonance: `Fc = Fs × √(1 + Vas/Vb)`
- System Q: `Qtc = Qts × √(1 + Vas/Vb)`
- Transfer function: second-order high-pass with Fc and Qtc

**Reference:** Small, R.H. "Closed-Box Loudspeaker Systems" (JAES, 1972)

#### 3.4.2 Vented Box (Bass Reflex)

Helmholtz resonator: box volume + port (duct).

**Equations:**
- Port resonance: `Fb = (c₀ / 2π) × √(Sp / (Lp × Vb))` where Sp = port area, Lp = effective port length
- End correction: `Lp_eff = Lp + 0.85 × d` (flanged), `+ 0.6 × d` (unflanged)
- Transfer function: fourth-order high-pass (two coupled resonators)
- Port velocity: derived from volume velocity at port resonance

**Reference:** Small, R.H. "Vented-Box Loudspeaker Systems" (JAES, 1973)

#### 3.4.3 Transmission Line (TL)

Distributed acoustic waveguide behind the driver. This is the complex one.

**Approach:** Transfer Matrix Method (TMM)
- Divide the line into N segments
- Each segment has a 2×2 transfer matrix relating pressure and volume velocity at its ends
- Cascade matrices: `T_total = T_1 × T_2 × ... × T_N`
- Account for damping material (stuffing) via complex propagation constant

**Segment transfer matrix:**
```
T = | cos(kL)           j×Z₀×sin(kL)  |
    | j×sin(kL)/Z₀      cos(kL)       |
```

Where:
- `k = ω/c - jα` — complex wave number (α = absorption from stuffing)
- `Z₀ = ρ₀c₀/S` — characteristic impedance of segment
- `L` = segment length
- `S` = cross-sectional area (can taper)

**Stuffing model:**
- Bradbury's flow resistivity model: absorption α as function of stuffing density and frequency
- `α(f) = R_f / (2 × ρ₀ × c₀)` (simplified; full model includes frequency-dependent terms)

**TL topologies for v0.1:**
- Straight TL (constant cross-section)
- Tapered TL (linearly varying cross-section)
- Terminated: open end (quarter-wave) or closed end

**References:**
- Bailey, A.R. "A Non-Resonant Loudspeaker Enclosure Design" (Wireless World, 1965)
- King, M.J. "Quarter-Wave Design" (published online series, 2005-2020)
- Bradbury, L.J.S. "The Use of Fibrous Materials in Loudspeaker Enclosures" (JAES, 1976)
- Leach, W.M. "Electroacoustics and Audio Amplifier Design" — Chapter on TL modeling

### 3.5 Solver Pipeline

```rust
pub struct SimulationInput {
    driver: DriverParams,
    enclosure: EnclosureConfig,  // enum: Sealed | Vented | TransmissionLine
    freq_start_hz: f64,
    freq_end_hz: f64,
    freq_points: usize,          // typically 500-1000
    drive_voltage_rms: f64,      // default 2.83V (1W into 8Ω)
}

pub struct SimulationResult {
    frequencies_hz: Vec<f64>,
    spl_db: Vec<f64>,            // on-axis SPL at 1m
    impedance_ohm: Vec<f64>,     // magnitude
    impedance_phase_deg: Vec<f64>,
    cone_displacement_mm: Vec<f64>,
    port_velocity_ms: Option<Vec<f64>>,  // vented only
    group_delay_ms: Vec<f64>,
}
```

**Sweep strategy:** Logarithmic frequency spacing from `freq_start` to `freq_end`.

At each frequency point:
1. Build the electromechano-acoustic impedance network
2. Solve for voice coil current, cone velocity, and acoustic pressures
3. Compute SPL from radiated pressure
4. Compute impedance from V/I at driver terminals

For sealed/vented: direct algebraic transfer functions (fast, closed-form).
For TL: transfer matrix cascade + numerical solution at each frequency point.

### 3.6 Crossover Network Solver

Integrates passive crossover design (XSim territory) into the same tool.

**Approach:** Nodal analysis (modified nodal analysis / MNA) of arbitrary RLC networks.

The crossover network is an electrical circuit connecting the amplifier source to one or more driver loads. Each driver's electrical impedance (from T/S model or imported ZMA data) acts as a frequency-dependent load.

**Components:**
```rust
pub enum CrossoverComponent {
    Resistor { ohms: f64 },
    Inductor { henries: f64, dcr_ohms: f64 },  // DCR = DC resistance of real inductor
    Capacitor { farads: f64 },
}

pub struct CrossoverNetwork {
    components: Vec<(CrossoverComponent, NodeId, NodeId)>,  // component + two connection nodes
    drivers: Vec<(DriverLoad, NodeId, NodeId)>,              // driver impedance as load
    source: (NodeId, NodeId),                                 // amplifier connection
}
```

**At each frequency point:**
1. Build MNA matrix: stamp each R, L, C component and driver impedance into the admittance matrix
2. Solve for node voltages and branch currents
3. Compute voltage across each driver → derive SPL contribution using driver's acoustic transfer function (from FRD data or enclosure model)
4. Sum acoustic contributions (complex addition — preserves phase) → combined system SPL

**Driver load sources (two modes):**
- **Simulated:** Use the T/S + enclosure model from the enclosure solver (integrated workflow — no external files needed)
- **Measured:** Import FRD (frequency response) + ZMA (impedance) files — standard DIY audio formats

**Standard circuit blocks (presets, not restrictions):**
- 1st through 4th order high-pass / low-pass (Butterworth, Linkwitz-Riley, Bessel target curves)
- Zobel network (impedance equalization)
- Notch filter (resonance peak suppression)
- L-pad (level attenuation)
- Baffle step compensation

But like XSim, the user can wire **any** arbitrary RLC topology — not locked to named filters.

**Output per driver way:**
- SPL contribution (dB)
- Voltage across driver (V)
- Current through driver (A)
- Power dissipation per component (W)

**Combined output:**
- Summed system SPL (complex acoustic sum)
- System impedance seen by amplifier
- Group delay

**References:**
- Fincham, L.R. "A Bandpass Filter Loudspeaker System" (AES, 1983)
- Dickason, V. "Loudspeaker Design Cookbook" — crossover design chapters
- Small, R.H. "Constant-Voltage Crossover Network Design" (JAES, 1971)
- General MNA: Chung-Wen Ho et al. "The Modified Nodal Approach to Network Analysis" (IEEE, 1975)

### 3.7 FRD/ZMA File Import

Standard DIY audio data exchange formats:

**FRD (Frequency Response Data):**
```
# Comment lines start with *
20.0   65.3   -45.2    (frequency_hz  spl_db  phase_deg)
20.5   65.5   -44.8
...
```

**ZMA (Impedance Data):**
```
20.0   7.2   -12.5    (frequency_hz  impedance_ohm  phase_deg)
20.5   7.3   -12.3
...
```

Parser reads these text formats, interpolates to match the simulation frequency grid.

---

## 4. UI Design

### 4.1 Layout

```
┌─────────────────────────────────────────────────────┐
│  Logo  [Enclosure ▼] [Crossover ▼]  [System ▼]  [☰] │  ← top bar (3 modes)
├─────────────────────┬───────────────────────────────┤
│                     │                               │
│   Parameter Panel   │        Plot Area              │
│                     │                               │
│   Driver            │   ┌─────────────────────┐     │
│   ├ Fs: [40] Hz     │   │  SPL (dB)           │     │
│   ├ Re: [6.5] Ω     │   │                     │     │
│   ├ Qes: [0.4]      │   │  ~~~~~/\~~~~        │     │
│   ├ Qms: [3.5]      │   │                     │     │
│   ├ Vas: [18] L      │   └─────────────────────┘     │
│   ├ Sd: [132] cm²   │   ┌─────────────────────┐     │
│   └ Xmax: [6] mm    │   │  Impedance (Ω)      │     │
│                     │   │                     │     │
│   Enclosure         │   │     /\              │     │
│   ├ Volume: [18] L  │   │    /  \____         │     │
│   ├ ...             │   └─────────────────────┘     │
│                     │   ┌─────────────────────┐     │
│   [Presets ▼]       │   │  Displacement (mm)   │     │
│   [Save] [Load]     │   │  \_______/          │     │
│   [Export JSON]     │   └─────────────────────┘     │
│                     │                               │
└─────────────────────┴───────────────────────────────┘
```

### 4.2 Key UX Principles

- **Instant feedback:** Every parameter change triggers a re-solve + re-plot. No "Calculate" button.
- **Sensible defaults:** Open the app → see a working sealed box design immediately.
- **Parameter validation:** Physical constraints enforced (no negative volumes, Qes > 0, etc.)
- **Responsive:** Works on tablet. Desktop-first, but not desktop-only.

### 4.3 Plot Features (v0.1)

- SPL (dB SPL at 1m, 2.83V) — logarithmic frequency axis, 20Hz–20kHz
- Impedance magnitude (Ω) — same axis
- Cone displacement (mm) — highlights Xmax limit line
- Hover crosshair showing values at cursor frequency
- Toggle individual curves on/off

### 4.4 Presets

Ship with 5-10 built-in driver presets (generic, not brand-specific to avoid trademark issues):
- "Generic 6.5" Woofer" (Fs=35, Qts=0.38, Vas=20L)
- "Generic 10" Sub" (Fs=25, Qts=0.45, Vas=80L)
- "Generic 5" Midrange" (Fs=55, Qts=0.35, Vas=8L)
- etc.

Users can paste/type their own Thiele-Small parameters.

### 4.5 File I/O

Our app must speak the same file formats as the tools DIY builders already use.

**v0.1 — Core I/O:**

| Format | Import | Export | Description |
|--------|--------|--------|-------------|
| **JSON** (native) | Yes | Yes | Our own project format — full driver + enclosure + settings |
| **FRD** (`.frd`) | Yes | Yes | Frequency Response Data: `freq_hz  spl_db  phase_deg` per line. Standard DIY format used by Hornresp, XSim, VituixCAD, REW |
| **ZMA** (`.zma`) | Yes | Yes | Impedance data: `freq_hz  impedance_ohm  phase_deg` per line. Standard DIY format |
| **CSV** (`.csv`) | No | Yes | All chart data (freq, SPL, impedance, displacement, group delay) for spreadsheet use |
| **localStorage** | — | — | Auto-persist designs in browser between sessions |

**v0.2+ — Extended I/O:**

| Format | Import | Export | Description |
|--------|--------|--------|-------------|
| **AkAbak script** | No | Yes | Export as AkAbak simulation script (power user interop) |
| **Hornresp Record** | Yes | No | Import existing Hornresp designs (reverse-engineered format) |
| **TSV** (`.txt`) | No | Yes | Tab-separated values (Hornresp's native chart export format) |

**FRD format spec:**
```
* Comment lines start with asterisk
20.00    65.3    -45.2
20.50    65.5    -44.8
21.00    65.8    -44.3
...
(frequency_hz  spl_db  phase_deg — whitespace separated)
```

**ZMA format spec:**
```
* Impedance data
20.00    7.2    -12.5
20.50    7.3    -12.3
...
(frequency_hz  impedance_ohm  phase_deg — whitespace separated)
```

These are plain text, no header, comment lines start with `*` or `!`. Our parser handles both delimiters (tabs and spaces) and interpolates to our simulation frequency grid.

**Export FRD/ZMA from our enclosure solver** is critical — this lets users:
1. Model a driver + enclosure in our app
2. Export the simulated FRD + ZMA
3. Import into XSim (or our own crossover module in v0.2) for crossover design

This bridges the enclosure → crossover workflow even before we build our own crossover module.

---

## 5. Project Structure

```
Cursor-hornresp/
├── solver/                      # Rust crate (WASM library)
│   ├── Cargo.toml
│   ├── src/
│   │   ├── lib.rs              # WASM entry points
│   │   ├── driver.rs           # Thiele-Small driver model
│   │   ├── constants.rs        # Physical constants
│   │   ├── sealed.rs           # Sealed box model
│   │   ├── vented.rs           # Vented box model
│   │   ├── transmission_line.rs # TL model (TMM)
│   │   ├── transfer_matrix.rs  # Transfer matrix primitives
│   │   ├── radiation.rs        # Radiation impedance
│   │   ├── sweep.rs            # Frequency sweep orchestration
│   │   ├── types.rs            # Shared data types
│   │   ├── crossover/          # Crossover network solver (v0.2+)
│   │   │   ├── mod.rs
│   │   │   ├── mna.rs          # Modified Nodal Analysis matrix builder
│   │   │   ├── components.rs   # R, L, C component models
│   │   │   ├── network.rs      # Network topology and node management
│   │   │   ├── blocks.rs       # Preset circuit blocks (Butterworth, LR, Zobel, etc.)
│   │   │   └── frd_zma.rs      # FRD/ZMA file parsers
│   │   └── system.rs           # Multi-way system: combines enclosure + crossover results
│   └── tests/
│       ├── sealed_tests.rs
│       ├── vented_tests.rs
│       ├── tl_tests.rs
│       ├── crossover_tests.rs
│       └── validation/         # Comparison against Hornresp + XSim outputs
│           ├── hornresp_sealed_reference.json
│           ├── hornresp_vented_reference.json
│           ├── hornresp_tl_reference.json
│           └── xsim_crossover_reference.json
├── web/                         # React frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ParameterPanel.tsx
│   │   │   ├── EnclosureSelector.tsx
│   │   │   ├── DriverInputs.tsx
│   │   │   ├── SealedInputs.tsx
│   │   │   ├── VentedInputs.tsx
│   │   │   ├── TransmissionLineInputs.tsx
│   │   │   ├── PlotArea.tsx
│   │   │   ├── SPLPlot.tsx
│   │   │   ├── ImpedancePlot.tsx
│   │   │   ├── DisplacementPlot.tsx
│   │   │   ├── PresetSelector.tsx
│   │   │   └── SaveLoadControls.tsx
│   │   ├── solver/
│   │   │   └── wasm-bridge.ts  # Typed wrapper around WASM calls
│   │   ├── hooks/
│   │   │   ├── useSolver.ts    # Debounced solve on param change
│   │   │   └── useDesignStore.ts
│   │   ├── types/
│   │   │   └── index.ts        # TypeScript types mirroring Rust structs
│   │   └── presets/
│   │       └── drivers.ts      # Built-in driver presets
│   └── public/
│       └── favicon.svg
├── docs/
│   ├── plans/
│   │   └── 2026-04-05-loudspeaker-sim-design.md  (this file)
│   └── REFERENCES.md           # Academic citations for all equations
├── CLAUDE.md                    # Project-specific instructions
├── LICENSE                      # MIT or Apache-2.0
└── README.md
```

---

## 6. Build & Deploy

### 6.1 Build Pipeline

```bash
# Build Rust solver to WASM
cd solver && wasm-pack build --target web --release

# Build React frontend (imports WASM from solver/pkg/)
cd web && npm run build

# Output: web/dist/ — static files ready to deploy
```

### 6.2 Deployment

Static files from `web/dist/` deployed to `ls.graf.me.uk`. Options:
- **Manual:** SCP to server, serve with Nginx/Apache
- **GitHub Actions:** On push to `main`, build + deploy via SSH
- **Cloudflare Pages / Netlify:** Free tier, auto-deploy from Git

### 6.3 Development

```bash
# Terminal 1: Watch Rust changes, rebuild WASM
cd solver && cargo watch -s "wasm-pack build --target web --dev"

# Terminal 2: Vite dev server with HMR
cd web && npm run dev
```

---

## 7. Validation Strategy

### 7.1 Unit Tests (Rust)

- Driver parameter derivation: known Thiele-Small → verify Bl, Mms, Cms
- Sealed box: known Qtc, Fc for given driver + volume
- Vented box: known Fb, port resonance
- TL: verify transfer matrix identity properties (reciprocity, passivity)
- Edge cases: very small/large volumes, extreme Q values

### 7.2 Oracle Tests (vs Hornresp + XSim)

For each enclosure type:
1. Enter identical parameters in Hornresp v60
2. Record SPL, impedance, displacement at key frequencies
3. Store as `validation/*.json` reference files
4. Rust tests assert our output matches within ±0.5 dB (SPL), ±5% (impedance)

For crossover networks:
1. Build identical circuits in XSim4 with same FRD/ZMA data
2. Record per-driver SPL, combined SPL, system impedance
3. Store as `validation/xsim_*.json` reference files
4. Rust tests assert match within ±0.5 dB

This proves correctness without copying code.

### 7.3 Acoustic Sanity Checks

- Sealed box SPL rolls off at -12 dB/octave below Fc
- Vented box SPL rolls off at -24 dB/octave below Fb
- Impedance has correct number of peaks (1 for sealed, 2 for vented)
- TL shows quarter-wave dips at expected frequencies
- Energy conservation: SPL doesn't exceed physical limits

---

## 8. Hornresp Feature Parity Reference

Full feature inventory from Hornresp v60 manual (148 pages), for roadmap planning:

**Enclosure types (20+):**
- Closed box (with offset driver, with passive radiator)
- Bass reflex (vented)
- Open baffle (flat, H-shaped, U-shaped)
- 4th order bandpass
- 6th order bandpass (series + parallel)
- 8th order bandpass (series + parallel)
- Type A bandpass, Type B bandpass
- Double bass reflex
- Aperiodic bi-chamber (ABC)
- Horn-loaded (various profiles: exponential, cosh, sinh, conical, catenoidal, Le Cléac'h)
- Mass-loaded horn
- Offset driver horn
- Tapped horn
- Stubbed horn
- Compound horn
- Transmission line

**Analysis tools:**
- Schematic diagram (cross-section view)
- Acoustical impedance
- SPL response
- Electrical impedance (Ze)
- Cone displacement
- Phase response (wrapped + unwrapped)
- Group delay
- Directivity / polar pattern
- Impulse response
- Room gain generator
- Maximum SPL calculator
- Power compression
- Multiple speaker overlay (compare designs)
- Filter wizard (active/parametric EQ, Linkwitz transform)
- Efficiency calculator
- Driver power dissipation
- Particle velocity (inside enclosure/port)
- Throat adapter designer
- Wavefront simulator
- Loudspeaker wizard (real-time parameter adjustment)
- Lossy Le model (empirical motor impedance)
- Semi-inductance model
- FDD (frequency-dependent damping) model

**Horn parameters:**
- S1–S5: horn section areas
- L12–L45: section lengths
- T: horn profile parameter (0=catenoidal, <1=cosh, 1=exponential, >1=sinh, 99999.99=conical)
- AT: throat half-angle
- F12: segment cutoff frequency

---

## 9. Future Roadmap

| Version | Features |
|---------|----------|
| **v0.1** | Sealed + Vented + Transmission Line. SPL, impedance, displacement plots. Presets. Save/Load. FRD/ZMA/CSV export + FRD/ZMA import. |
| **v0.2** | Passive crossover designer (RLC network, MNA solver). FRD/ZMA import. Multi-driver combined SPL. |
| **v0.3** | Integrated workflow: enclosure model outputs feed crossover inputs (no external measurement needed for initial design). |
| **v0.4** | Horn/waveguide (conical, exponential). Polar pattern plot. Port velocity plot. |
| **v0.5** | Bandpass (4th/6th order). Passive radiator. Isobaric. |
| **v0.6** | Tapped horn. Back-loaded horn. |
| **v0.7** | Active crossover / EQ blocks. |
| **v0.8** | Driver database (community-contributed). User accounts. Cloud save. |

---

## 10. Key Academic References

| Topic | Reference |
|-------|-----------|
| Thiele-Small theory | Thiele, A.N. "Loudspeakers in Vented Boxes" (JAES, 1971); Small, R.H. "Direct-Radiator Loudspeaker System Analysis" (JAES, 1972) |
| Sealed box | Small, R.H. "Closed-Box Loudspeaker Systems" (JAES, 1972) |
| Vented box | Small, R.H. "Vented-Box Loudspeaker Systems" (JAES, 1973) |
| Transmission lines | Bailey, A.R. "A Non-Resonant Loudspeaker Enclosure Design" (Wireless World, 1965) |
| TL damping | Bradbury, L.J.S. "The Use of Fibrous Materials in Loudspeaker Enclosures" (JAES, 1976) |
| Quarter-wave TL | King, M.J. "Quarter Wavelength Loudspeaker Design" (2005-2020) |
| Transfer matrix method | Leach, W.M. "Electroacoustics and Audio Amplifier Design" |
| Radiation impedance | Beranek, L.L. "Acoustics" (1954, revised 1986) |
| Horn theory | Keele, D.B. "Optimum Horn Mouth Size" (AES Preprint, 1979) |
| Crossover design | Small, R.H. "Constant-Voltage Crossover Network Design" (JAES, 1971) |
| Crossover cookbook | Dickason, V. "Loudspeaker Design Cookbook" (7th ed.) |
| Bandpass filter systems | Fincham, L.R. "A Bandpass Filter Loudspeaker System" (AES, 1983) |
| Modified Nodal Analysis | Chung-Wen Ho et al. "The Modified Nodal Approach to Network Analysis" (IEEE, 1975) |
| Linkwitz-Riley filters | Linkwitz, S. "Active Crossover Networks for Non-coincident Drivers" (JAES, 1976) |
