//! Sealed (closed) box loudspeaker model.
//!
//! A sealed box adds acoustic compliance in parallel with the driver's mechanical
//! compliance, raising the system resonance and Q factor.
//!
//! Reference: Small, R.H. "Closed-Box Loudspeaker Systems — Part I: Analysis"
//! JAES Vol. 20, No. 10 (1972), Equations 1–20.

use num_complex::Complex;

use crate::constants::{RHO_0, TWO_PI};
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
/// Uses the electromechanical circuit model to compute impedance, SPL,
/// and displacement at each frequency point.
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
    let omega_c = TWO_PI * sys.fc_hz;
    let p = &driver.params;

    let n = frequencies_hz.len();
    let mut spl_db = Vec::with_capacity(n);
    let mut impedance_ohm = Vec::with_capacity(n);
    let mut impedance_phase_deg = Vec::with_capacity(n);
    let mut displacement_mm = Vec::with_capacity(n);
    let mut group_delay_ms = Vec::with_capacity(n);

    let j = Complex::new(0.0, 1.0);

    // Total compliance: Cms in series with box compliance
    // Cms_total = Cms / (1 + α)
    let cms_total = driver.cms / (1.0 + sys.alpha);

    for &f in frequencies_hz {
        let omega = TWO_PI * f;
        let s = j * omega;

        // === Electrical impedance ===
        // Zin = Re + s×Le + Bl² / (s×Mms + Rms + 1/(s×Cms_total))
        let z_mech = s * driver.mms + driver.rms + 1.0 / (s * cms_total);
        let z_mot = driver.bl * driver.bl / z_mech;
        let z_in = p.re_ohm + s * p.le_h + z_mot;

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

        // === Group delay from transfer function ===
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
