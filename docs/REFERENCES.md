# Academic References

Every equation in the solver has a comment citing its source. This document collects all references.

## Core Theory

| Author | Title | Year | Used in |
|--------|-------|------|---------|
| Small, R.H. | "Direct-Radiator Loudspeaker System Analysis" (JAES Vol. 20, No. 5) | 1972 | `driver.rs` — T/S parameter derivation (Eq. 1–14) |
| Small, R.H. | "Closed-Box Loudspeaker Systems — Part I: Analysis" (JAES Vol. 20, No. 10) | 1972 | `sealed.rs` — system Fc, Qtc, transfer function (Eq. 11–17) |
| Small, R.H. | "Vented-Box Loudspeaker Systems — Part I: Small-Signal Analysis" (JAES Vol. 21, No. 5) | 1973 | `vented.rs` — Helmholtz resonance, acoustic circuit (Eq. 1–30) |
| Beranek, L.L. | "Acoustics" (1954, revised 1986) | 1954 | `constants.rs` — physical constants (Table 1.1); `sealed.rs`, `vented.rs`, `transmission_line.rs` — radiation impedance (Eq. 4.19, 5.12) |

## Transmission Lines

| Author | Title | Year | Used in |
|--------|-------|------|---------|
| Bailey, A.R. | "A Non-Resonant Loudspeaker Enclosure Design" (Wireless World) | 1965 | `transmission_line.rs` — TL concept |
| King, M.J. | "Quarter Wavelength Loudspeaker Design" | 2005–2020 | `transmission_line.rs` — practical TL methodology |
| Bradbury, L.J.S. | "The Use of Fibrous Materials in Loudspeaker Enclosures" (JAES) | 1976 | `transfer_matrix.rs` — stuffing absorption model (Eq. 12) |
| Leach, W.M. | "Electroacoustics and Audio Amplifier Design" | — | `transfer_matrix.rs` — transfer matrix formulation (Eq. 8.25–8.30) |
| Kinsler & Frey | "Fundamentals of Acoustics" | 1982 | `vented.rs` — port end corrections (Table 9.1) |
| Marshall, Perry S. | "Transmission Line Derivation" | — | `transmission_line.rs` — TL theory derivation, driver position effects, stuffing models. PDF in `docs/references/` |
| transmissionlinespeakers.com | "Designing a Transmission Line with SpicyTL" | — | TL design methodology — driver offset, taper profiles, stuffing zones. https://transmissionlinespeakers.com/en/designing-a-transmission-line-with-spicytl/ |

## File Formats

| Format | Description | Used by |
|--------|-------------|---------|
| FRD | Frequency Response Data (freq, SPL, phase) | Hornresp, XSim, VituixCAD, REW, ARTA |
| ZMA | Impedance measurement (freq, Z, phase) | Hornresp, XSim, VituixCAD, DATS |
| CSV | All simulation data | Spreadsheet analysis |
