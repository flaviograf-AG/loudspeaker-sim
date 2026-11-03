# Academic References

Every equation in the Rust solver cites its primary literature source. This document collects all references used across `solver/src/` and `web/src/`.

## Core Electromechanical & Enclosure Theory

| Author | Title | Year | Used in |
|--------|-------|------|---------|
| Small, R.H. | "Direct-Radiator Loudspeaker System Analysis" (*JAES* Vol. 20, No. 5) | 1972 | `driver.rs`, `driver_import.rs` — Thiele-Small parameter derivation & 6-point physical consistency checks |
| Small, R.H. | "Closed-Box Loudspeaker Systems — Part I: Analysis" (*JAES* Vol. 20, No. 10) | 1972 | `sealed.rs` — system $F_c$, $Q_{tc}$, box losses $Q_L$, transfer function |
| Small, R.H. | "Vented-Box Loudspeaker Systems — Part I: Small-Signal Analysis" (*JAES* Vol. 21, No. 5) | 1973 | `vented.rs` — Helmholtz resonance, port mass/compliance, B4/QB3/SC4/EBS alignments |
|Small, R.H. | "Passive-Radiator Loudspeaker Systems — Part I: Analysis" (*JAES* Vol. 22, No. 8) | 1974 | `passive_radiator.rs` — coupled drone-cone compliance, mass, and mechanical loss |
| Keele, D.B. | "Low-Frequency Horn Design Using Thiele/Small Driver Parameters" (*AES Preprint*) & Dual-Reflex Bandpass Notes | 1977–1979 | `bandpass.rs` (4th-order single-reflex & 6th-order dual-reflex acoustic network), `horn.rs` |
| Thorborg, K. & Unruh, A. | "Electrical Equivalent Circuit Model for Dynamic Moving-Coil Transducers Incorporating Semi-Inductance" (*JAES* Vol. 58, No. 6) | 2010 | `driver.rs` — frequency-dependent voice-coil semi-inductance $K_e (j\omega)^{0.5}$ |
| Beranek, L.L. | *Acoustics* (McGraw-Hill, 1954; rev. 1986) | 1954 | `constants.rs`, `sealed.rs`, `vented.rs`, `SystemPlotArea.tsx` — radiation impedance & circular-piston directivity $2 J_1(ka \sin\theta)/(ka \sin\theta)$ |
| Kinsler, L.E. & Frey, A.R. | *Fundamentals of Acoustics* (3rd ed., Wiley) | 1982 | `vented.rs`, `bandpass.rs` — flanged/unflanged port end corrections & half-wavelength organ-pipe resonance $f_{\text{pipe}} = c_0 / (2 L_{\text{eff}})$ |
| Olson, H.F. | "Direct Radiator Loudspeaker Enclosures" (*JAES* Vol. 17, No. 1) | 1969 | `open_baffle.rs`, `SystemPlotArea.tsx` — finite-baffle diffraction & $6\text{ dB}$ baffle step |

## Transmission Lines & Waveguides

| Author | Title | Year | Used in |
|--------|-------|------|---------|
| Bailey, A.R. | "A Non-Resonant Loudspeaker Enclosure Design" (*Wireless World*) | 1965 | `transmission_line.rs` — fibrous-damped quarter-wave transmission line |
| Bradbury, L.J.S. | "The Use of Fibrous Materials in Loudspeaker Enclosures" (*JAES* Vol. 24, No. 3) | 1976 | `transfer_matrix.rs` — complex propagation constant & characteristic impedance in fibrous stuffing |
| Leach, W.M. | *Introduction to Electroacoustics and Audio Amplifier Design* | 2003 | `transfer_matrix.rs` — 2-port acoustic ABCD transfer matrix formulation |
| King, M.J. | "Quarter Wavelength Loudspeaker Design" | 2005–2020 | `transmission_line.rs` — driver offset harmonic suppression & multi-zone stuffing |
| Marshall, Perry S. | "Transmission Line Derivation" (`docs/references/transmission_line_derivation_perry_s_marshall.pdf`) | — | `transmission_line.rs` — taper geometry, fold loss, and driver tap position |
| Le Cléac'h, J.-M. | "Waveguides and Horns" (ETF Lecture Notes) | 2009 | `horn.rs` — Le Cléac'h, Tractrix, Hyperbolic (Salmon), and Parabolic flare profiles |

## Crossovers, Filters & Optimization

| Author | Title | Year | Used in |
|--------|-------|------|---------|
| Linkwitz, S.H. | "Active Crossover Networks for Noncoincident Drivers" (*JAES* Vol. 24, No. 1) | 1976 | `crossover.rs` — Linkwitz-Riley 2nd/4th-order alignment & Linkwitz Transform biquad |
| Bristow-Johnson, R. | "Cookbook Formulae for Audio EQ Biquad Filter Coefficients" | 1994–2005 | `crossover.rs` — 16 active filter transfer functions & miniDSP biquad synthesis |
| Nelder, J.A. & Mead, R. | "A Simplex Method for Function Minimization" (*Computer Journal* Vol. 7) | 1965 | `optimizer.rs` — Nelder-Mead simplex & Differential Evolution hybrid crossover optimizer |

## File Formats

| Format | Description | Used by |
|--------|-------------|---------|
| FRD | Frequency Response Data (`freq_hz`, `spl_db`, `phase_deg`) | Hornresp, XSim, VituixCAD, REW, ARTA |
| ZMA | Electrical Impedance Data (`freq_hz`, `z_ohm`, `phase_deg`) | Hornresp, XSim, VituixCAD, Dayton DATS |
| CSV | Full multi-column simulation export | Spreadsheet / Python / MATLAB analysis |
