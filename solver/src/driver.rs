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
