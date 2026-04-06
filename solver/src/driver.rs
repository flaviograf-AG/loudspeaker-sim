//! Thiele-Small parameter derivation.
//!
//! Converts user-facing T/S parameters to the canonical electromechanical
//! form (Bl, Mms, Cms, Rms) used internally by all enclosure solvers.
//!
//! Reference: Small, R.H. "Direct-Radiator Loudspeaker System Analysis"
//! JAES Vol. 20, No. 5 (1972), Equations 1–14.

use num_complex::Complex;

use crate::constants::{C_0, RHO_0, TWO_PI};
use crate::types::{DerivedDriver, DriverParams};

/// Compute driver electrical impedance (Re + voice coil reactance).
/// Uses Ke semi-inductance model when ke > 0, otherwise simple sLe.
///
/// Simple model: Ze = Re + s×Le
/// Semi-inductance: Ze = Re + Ke × s^0.5  (Thorborg et al., JAES 2010)
///
/// The s^0.5 term models the frequency-dependent skin effect in the
/// voice coil, which causes impedance to rise as √f rather than f.
pub fn driver_electrical_impedance(p: &DriverParams, s: Complex<f64>) -> Complex<f64> {
    let z_coil = if p.ke > 0.0 {
        // Semi-inductance: Ke × s^0.5
        // s^0.5 = exp(0.5 × ln(s))
        let s_half = (s.ln() * 0.5).exp();
        p.ke * s_half
    } else {
        // Simple inductance: s × Le
        s * p.le_h
    };
    Complex::new(p.re_ohm, 0.0) + z_coil
}

/// Derive canonical electromechanical parameters from Thiele-Small inputs.
pub fn derive_driver(p: &DriverParams) -> DerivedDriver {
    let omega_s = TWO_PI * p.fs_hz;

    // Qts: total Q — parallel combination of Qes and Qms
    // Small (1972), Eq. 6
    let qts = (p.qes * p.qms) / (p.qes + p.qms);

    // Cms: mechanical compliance (m/N)
    // Derived from Vas = ρ₀ × c₀² × Sd² × Cms
    // For tweeters with unknown Vas, use a small default to avoid div-by-zero
    // Small (1972), Eq. 3
    let vas = if p.vas_m3 > 0.0 { p.vas_m3 } else { 1e-5 }; // 0.01L fallback for tweeters
    let cms = vas / (RHO_0 * C_0 * C_0 * p.sd_m2 * p.sd_m2);

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
