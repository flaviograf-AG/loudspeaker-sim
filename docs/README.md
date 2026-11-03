# LS Graf Simulator — Documentation

Technical documentation for **[ls.graf.me.uk](https://ls.graf.me.uk)**, a browser-based loudspeaker enclosure and multi-way crossover simulator powered by a Rust/WebAssembly physics solver and a React 19 + TypeScript frontend.

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [`LLM-VARIABLE-INVENTORY.md`](./LLM-VARIABLE-INVENTORY.md) | Complete input/output JSON schema and optimization guide for the `loudspeaker-solver` CLI and WASM API |
| [`REFERENCES.md`](./REFERENCES.md) | Academic papers, textbooks, and equations cited across the Rust solver modules |
| [`feature-audit-hornresp-xsim.md`](./feature-audit-hornresp-xsim.md) | Feature parity matrix comparing LS Graf Simulator against Hornresp v60, XSim4, and VituixCAD |
| [`qspeakers-comparison.md`](./qspeakers-comparison.md) | Comparison against QSpeakers (enclosure types, alignments, driver database, circuit modeling) |
| [`cross-validation-results.md`](./cross-validation-results.md) | 80-point numerical cross-validation of the Rust equivalent-circuit solver against QSpeakers C++ |
| [`test-cases-10-complex.md`](./test-cases-10-complex.md) | Reference benchmark outputs across 10 single-enclosure and multi-way system configurations |
| [`references/README.md`](./references/README.md) | Reference manuals and derivations (`transmission_line_derivation_perry_s_marshall.pdf`, `vituixcad-extracted.txt`) |
| [`plans/`](./plans/) | Architectural design documents, solver audits, and phase roadmaps |

---

## System Architecture

```
DesignState (web/src/App.tsx)
   │
   ├──► buildSolverInput() (web/src/compute.ts) ──► WASM simulate_system() (solver/src/lib.rs)
   │                                                       │
   │                                                       ▼
   │                                                SystemResult JSON
   │                                                       │
   └──► Direct UI Readers:                                 ├──► SystemPlotArea.tsx (7 ECharts + Polar Directivity)
        ├── WayEditor.tsx (Driver T/S, Presets, FRD/ZMA)   ├──► EnclosureInputs.tsx (Fb, Port Resonance, Alignments)
        ├── PresetSelector.tsx (1,308-Driver Explorer)     └──► OptimizerPanel.tsx (Nelder-Mead / DE / Hybrid)
        ├── CrossoverPanel.tsx (Active & Passive Wizard)
        ├── CrossoverSchematic.tsx (Live SVG Circuit)
        ├── EnclosureSchematic.tsx (Live SVG Cross-Section)
        └── CabinetCalculator.tsx (3D Cut-List & Bracing)
```

---

## Core Capabilities

### 1. Seven Acoustic Enclosure Models (`solver/src/`)
- **Sealed (`sealed.rs`)**: Small (1972) equivalent circuit with box leakage losses ($Q_L$) and one-click alignment presets (Butterworth $Q_{tc}=0.707$, Bessel $Q_{tc}=0.577$, Chebyshev $Q_{tc}=1.0$).
- **Vented (`vented.rs`)**: Small (1973) Helmholtz resonator supporting round and rectangular/slot ports, flared/unflanged end corrections, alignment presets (B4, QB3, SC4, EBS), port air velocity tracking, and first organ-pipe standing-wave resonance warnings ($f_{\text{pipe}} = c_0 / (2 L_{\text{eff}})$).
- **Transmission Line (`transmission_line.rs`, `transfer_matrix.rs`)**: 32-segment acoustic transfer-matrix (TMM) chain with configurable driver offset ($0\text{–}49\%$), 3 taper profiles (Straight, Conical, Exponential), Bradbury (1976) fibrous stuffing absorption (global or per-zone), and $180^\circ$ fold losses.
- **Horn (`horn.rs`)**: Up to 4 chained horn segments with 6 flare profiles (Conical, Exponential, Hyperbolic/Salmon, Tractrix, Parabolic, Le Cléac'h), sealed or vented rear chamber, throat compression chamber, and solid-angle radiation loading ($\pi/2$ to $4\pi\text{ sr}$).
- **Bandpass (`bandpass.rs`)**:
  - **4th-Order Single-Reflex**: Sealed rear chamber + vented front chamber.
  - **6th-Order Dual-Reflex**: Vented rear chamber + vented front chamber summing both port acoustic volume velocities in complex phase ($U_{\text{front}} - U_{\text{rear}}$), with independent front and rear port tuning ($F_{b,\text{front}}, F_{b,\text{rear}}$) and organ-pipe resonance markers.
- **Passive Radiator (`passive_radiator.rs`)**: Coupled mass-spring-damper radiator model with 1st-party passive radiator presets (Seas, Scan-Speak, Purifi, SB Acoustics) plus 8"/10"/12" templates.
- **Open Baffle (`open_baffle.rs`)**: Dipole acoustic radiation with Olson (1969) finite-baffle path-length diffraction and asymmetrical driver offset.

### 2. Verified Driver Database (`web/src/presets/`)
- **1,308 Verified Drivers Across 23 Manufacturers**: Two-tier merge combining **Tier 1 Official Manufacturer Catalogues** (`first_party_catalogue_db.ts` — B&C, Beyma, BMS, Celestion, Dayton Audio, Eighteen Sound, Eminence, FaitalPRO, Jensen, Lavoce, Monacor, Mundorf, Peerless, Precision Devices, PRV Audio, Purifi, RCF, Redcatt, SB Acoustics, Scan-Speak, Seas, Sica, Tang Band, Visaton, Wavecor) and **Tier 2 Community Archive** (`driver_base_db.ts`).
- **6-Point Physics Validation & Quarantine**: Every imported driver is checked against 6 physical consistency laws ($Q_{ts} = \frac{Q_{es} Q_{ms}}{Q_{es}+Q_{ms}}$, $f_s = \frac{1}{2\pi\sqrt{M_{ms} C_{ms}}}$, $V_{as} = \rho_0 c_0^2 S_d^2 C_{ms}$, $Q_{es} = \frac{2\pi f_s M_{ms} R_e}{(Bl)^2}$, $\eta_0$, and $X_{\text{max}}$ bounds).
- **Provenance & Burn-In Switcher**: Displays passed T/S verification checks (`X/6`), direct datasheet URLs, recommended enclosure volumes without overwriting T/S compliance $V_{as}$, and a `Before Burn-In` / `After Burn-In` parameter switcher where manufacturer data provides both states.

### 3. Multi-Way Crossovers, Optimizer & Polar Directivity
- **Passive Crossovers (`crossover.rs`)**: 15 ABCD-matrix ladder topologies (1st–4th order LP/HP, Zobel, L-pad, series/parallel RLC notch) driven through a configurable amplifier + cable **Source Impedance** ($R_s$, default $0.35\ \Omega$) and per-component bypass toggles.
- **Active Filters & DSP Export**: 16 active filter blocks (Butterworth, Linkwitz-Riley, Bessel, Chebyshev, PEQ, Shelving, Linkwitz Transform, All-Pass) with per-filter bypass and 48 kHz / 96 kHz **miniDSP biquad coefficient export**.
- **Automated Optimizer (`optimizer.rs`)**: Nelder-Mead, Differential Evolution, and DE+NM Hybrid optimization with flat/tilted target curves, per-parameter lock checkboxes, minimum impedance constraints, and E12/E24/E48 passive component snapping.
- **Baffle Step & Off-Axis Polar Directivity (`SystemPlotArea.tsx`)**: Optional overlay modeling finite-baffle diffraction ($f_{\text{step}} \approx \frac{c_0}{\pi W}$) and circular-piston off-axis directivity ($D(\theta) = \frac{2 J_1(ka \sin\theta)}{ka \sin\theta}$) at $0^\circ$, $30^\circ$, and $60^\circ$.

---

## Testing & Verification

```bash
# 1. Rust physics solver unit & integration tests (95 tests)
cargo test --manifest-path solver/Cargo.toml

# 2. Build WebAssembly package
wasm-pack build solver --target web --out-dir pkg

# 3. Driver database & provenance verification suites (33 tests)
node web/scripts/test-first-party-catalogue.mjs
node web/scripts/test-driver-base-import.mjs

# 4. Frontend production build & Playwright E2E suite
npm --prefix web run build
npx --prefix web playwright test
```
