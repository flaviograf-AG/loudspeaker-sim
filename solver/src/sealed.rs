//! Sealed (closed) box loudspeaker model.
//!
//! A sealed box adds acoustic compliance in parallel with the driver's mechanical
//! compliance, raising the system resonance and Q factor. Box losses (Ql) reduce
//! the effective system Q.
//!
//! Reference: Small, R.H. "Closed-Box Loudspeaker Systems — Part I: Analysis"
//! JAES Vol. 20, No. 10 (1972), Equations 1–20.

use num_complex::Complex;

use crate::driver::driver_electrical_impedance;
use crate::constants::{RHO_0, TWO_PI};
use crate::sweep::{compute_group_delay_ms, pressure_to_spl_db};
use crate::types::{DerivedDriver, SealedBoxParams, SimulationResult};

/// Computed system-level parameters for a sealed box.
pub struct SealedSystemParams {
    /// System resonance frequency (Hz)
    pub fc_hz: f64,
    /// System total Q factor (including box losses)
    pub qtc: f64,
    /// Compliance ratio α = Vas / Vb
    pub alpha: f64,
}

/// Compute sealed box system parameters.
///
/// Small (1972), Eq. 11: Fc = Fs × √(1 + Vas/Vb)
/// Small (1972), Eq. 12: Qtc = Qts × √(1 + Vas/Vb)
/// Box losses: 1/Qtc_total = 1/Qtc + 1/Ql  (Small 1972, Eq. 13)
pub fn sealed_system_params(driver: &DerivedDriver, enclosure: &SealedBoxParams) -> SealedSystemParams {
    let alpha = driver.params.vas_m3 / enclosure.volume_m3;
    let sqrt_factor = (1.0 + alpha).sqrt();

    let qtc_lossless = driver.qts * sqrt_factor;

    // Apply box losses via Ql
    // 1/Qtc_total = 1/Qtc + 1/Ql
    // Reference: Small (1972), Eq. 13
    let qtc = if enclosure.ql > 0.0 && enclosure.ql < 1e6 {
        1.0 / (1.0 / qtc_lossless + 1.0 / enclosure.ql)
    } else {
        qtc_lossless
    };

    SealedSystemParams {
        fc_hz: driver.params.fs_hz * sqrt_factor,
        qtc,
        alpha,
    }
}

/// Compute frequency response for a sealed box system.
///
/// Uses the electromechanical circuit model to compute impedance, SPL,
/// and displacement at each frequency point.
///
/// Box losses (Ql) are modeled as a resistance in parallel with the box
/// compliance in the mechanical circuit:
///   R_loss = Mms × ωc / Ql_effective
/// where Ql_effective captures only the box absorption losses.
///
/// SPL is computed at 1m in half-space (2π steradians) for ka << 1.
/// Reference: Beranek (1986), Ch. 4; Small (1972), Eq. 15–17.
pub fn sealed_frequency_response(
    driver: &DerivedDriver,
    enclosure: &SealedBoxParams,
    frequencies_hz: &[f64],
    drive_voltage_rms: f64,
) -> SimulationResult {
    let sys = sealed_system_params(driver, enclosure);
    let p = &driver.params;

    let n = frequencies_hz.len();
    let mut spl_db = Vec::with_capacity(n);
    let mut impedance_ohm = Vec::with_capacity(n);
    let mut impedance_phase_deg = Vec::with_capacity(n);
    let mut displacement_mm = Vec::with_capacity(n);
    let mut pressure_phases = Vec::with_capacity(n);

    let j = Complex::new(0.0, 1.0);

    // Combined compliance: driver + box in series (mechanical domain)
    let cms_total = driver.cms / (1.0 + sys.alpha);
    let omega_c = TWO_PI * sys.fc_hz;

    // Box loss resistance (mechanical domain).
    // Ql models absorption in the box lining. In the equivalent circuit,
    // this is a resistance in parallel with Cms_box. In the Cms_total
    // formulation, the equivalent series loss resistance is:
    //   R_ql = Mms × ωc / Ql
    // This adds damping beyond the driver's own Rms.
    // Reference: Small (1972), Eq. 13
    let r_ql = if enclosure.ql > 0.0 && enclosure.ql < 1e6 {
        driver.mms * omega_c / enclosure.ql
    } else {
        0.0
    };
    let rms_total = driver.rms + r_ql;

    for &f in frequencies_hz {
        let omega = TWO_PI * f;
        let s = j * omega;

        // === Electrical impedance ===
        // Zin = Re + sLe + Bl² / (sMms + Rms_total + 1/(sCms_total))
        let z_mech = s * driver.mms + rms_total + 1.0 / (s * cms_total);
        let z_mot = driver.bl * driver.bl / z_mech;
        let z_in = driver_electrical_impedance(p, s) + z_mot;

        impedance_ohm.push(z_in.norm());
        impedance_phase_deg.push(z_in.arg().to_degrees());

        // === Voice coil current and cone velocity ===
        let i_coil = drive_voltage_rms / z_in;
        let force = driver.bl * i_coil;
        let v_cone = force / z_mech;

        // === Cone displacement: x = v / (jω) ===
        let x_cone = v_cone / (j * omega);
        displacement_mm.push(x_cone.norm() * 1000.0);

        // === Sound pressure at 1m (half-space, ka << 1) ===
        // p = ρ₀ × ω × Sd × v_cone / (2π × r), r = 1m
        // Reference: Beranek (1986), Eq. 4.19
        let p_acoustic = RHO_0 * omega * p.sd_m2 * v_cone
            / (2.0 * std::f64::consts::PI);
        spl_db.push(pressure_to_spl_db(p_acoustic.norm()));
        pressure_phases.push(p_acoustic.arg());
    }

    // Group delay: -dφ/dω computed via numerical differentiation
    let group_delay_ms = compute_group_delay_ms(frequencies_hz, &pressure_phases);

    SimulationResult {
        frequencies_hz: frequencies_hz.to_vec(),
        spl_db,
        impedance_ohm,
        impedance_phase_deg,
        cone_displacement_mm: displacement_mm,
        group_delay_ms,
        acoustic_phase_deg: pressure_phases.iter().map(|p| p.to_degrees()).collect(),
        port_velocity_ms: None,
    }
}
