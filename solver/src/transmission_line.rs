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

    let n = frequencies_hz.len();
    let mut spl_db = Vec::with_capacity(n);
    let mut impedance_ohm = Vec::with_capacity(n);
    let mut impedance_phase_deg = Vec::with_capacity(n);
    let mut displacement_mm = Vec::with_capacity(n);
    let mut group_delay_ms = Vec::with_capacity(n);

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
        // Open end: radiation impedance (simplified piston in baffle)
        //   Zrad ≈ ρ₀c₀/Sm × (0.5×(ka)² + j×0.6133×ka) for ka < 1
        //   Reference: Beranek, "Acoustics" (1986), Eq. 5.12
        let mouth_area = tl.area_mouth_m2;
        let a_mouth = (mouth_area / std::f64::consts::PI).sqrt();
        let ka = (omega / C_0) * a_mouth;
        let z_rad = if tl.open_end {
            let z0_mouth = RHO_0 * C_0 / mouth_area;
            Complex::new(z0_mouth * 0.5 * ka * ka, z0_mouth * 0.6133 * ka)
        } else {
            // Closed end: effectively infinite impedance
            Complex::new(1e12, 0.0)
        };

        // Line input impedance from transfer matrix:
        //   Zline = (A×Zrad + B) / (C×Zrad + D)
        let a = t_total[0][0];
        let b = t_total[0][1];
        let c_mat = t_total[1][0];
        let d = t_total[1][1];
        let z_line = (a * z_rad + b) / (c_mat * z_rad + d);

        // Convert line acoustic impedance to mechanical domain
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

        // Volume velocity at mouth
        let u_driver = p.sd_m2 * v_cone;
        let u_mouth = u_driver / (c_mat * z_rad + d);

        // Radiated sound: driver front + mouth radiation
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
        port_velocity_ms: None,
    }
}
