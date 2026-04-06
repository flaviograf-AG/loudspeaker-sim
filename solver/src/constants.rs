//! Physical constants for acoustic simulation.
//!
//! All values at standard conditions: 20°C, 1 atm, dry air.
//! Reference: Beranek, L.L. "Acoustics" (1954, revised 1986), Table 1.1

/// Air density (kg/m³) at 20°C, 1 atm
pub const RHO_0: f64 = 1.2041;

/// Speed of sound in air (m/s) at 20°C
pub const C_0: f64 = 343.21;

/// Characteristic acoustic impedance of air (Pa·s/m)
/// Z₀ = ρ₀ × c₀
pub const Z_0: f64 = RHO_0 * C_0;

/// Reference sound pressure for SPL calculations (Pa)
/// 0 dB SPL = 20 µPa — threshold of human hearing at 1 kHz
pub const P_REF: f64 = 20e-6;

/// Standard drive voltage (V RMS) — 2.83V = 1W into 8Ω
pub const DEFAULT_DRIVE_V_RMS: f64 = 2.83;

/// 2π, used frequently in ω = 2πf
pub const TWO_PI: f64 = 2.0 * std::f64::consts::PI;
