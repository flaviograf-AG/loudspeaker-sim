//! Passive radiator enclosure model.
//!
//! A sealed box with a passive cone (no motor) instead of a port.
//! The passive radiator is tuned by adjusting its mass.
//! Produces a 4th-order high-pass response similar to vented,
//! but without port turbulence noise.
//!
//! Reference: Small, R.H. "Passive-Radiator Loudspeaker Systems" (JAES, 1974)

use num_complex::Complex;

use crate::constants::{C_0, RHO_0, TWO_PI};
use crate::sweep::{compute_group_delay_ms, pressure_to_spl_db};
use crate::types::{DerivedDriver, PassiveRadiatorParams, SimulationResult};

pub fn passive_radiator_frequency_response(
    driver: &DerivedDriver,
    enc: &PassiveRadiatorParams,
    frequencies_hz: &[f64],
    drive_voltage_rms: f64,
) -> SimulationResult {
    let p = &driver.params;
    let j = Complex::new(0.0, 1.0);

    // Box compliance
    let cab = enc.volume_m3 / (RHO_0 * C_0 * C_0);

    // Driver acoustic elements
    let sd2 = p.sd_m2 * p.sd_m2;
    let mas = driver.mms / sd2;
    let ras = driver.rms / sd2;
    let cas = driver.cms * sd2;

    // Passive radiator acoustic elements
    let pr_sd2 = enc.pr_sd_m2 * enc.pr_sd_m2;
    let map = enc.pr_mms_kg / pr_sd2;
    let rap = enc.pr_rms / pr_sd2;
    let cap = enc.pr_cms * pr_sd2;

    let n = frequencies_hz.len();
    let mut spl_db = Vec::with_capacity(n);
    let mut impedance_ohm = Vec::with_capacity(n);
    let mut impedance_phase_deg = Vec::with_capacity(n);
    let mut displacement_mm = Vec::with_capacity(n);
    let mut pressure_phases = Vec::with_capacity(n);

    for &f in frequencies_hz {
        let omega = TWO_PI * f;
        let s = j * omega;

        // Box compliance with Ql loss
        let z_cab = 1.0 / (s * cab);
        let z_cab_loss = if enc.ql > 0.0 && enc.ql < 1e6 {
            let fb = 1.0 / (TWO_PI * (map * cab).sqrt());
            let r_ab = Complex::new(enc.ql / (TWO_PI * fb * cab), 0.0);
            (z_cab * r_ab) / (z_cab + r_ab)
        } else { z_cab };

        // Passive radiator impedance: mass + compliance + resistance
        let z_pr = s * map + rap + 1.0 / (s * cap);

        // Box load: Cab ∥ PR (both connected to the box volume)
        let z_box = (z_cab_loss * z_pr) / (z_cab_loss + z_pr);

        // Driver acoustic impedance
        let z_acoustic = s * mas + ras + 1.0 / (s * cas) + z_box;

        // Electrical domain
        let z_mech = sd2 * z_acoustic;
        let z_mot = driver.bl * driver.bl / z_mech;
        let z_in = p.re_ohm + s * p.le_h + z_mot;

        impedance_ohm.push(z_in.norm());
        impedance_phase_deg.push(z_in.arg().to_degrees());

        let i_coil = drive_voltage_rms / z_in;
        let force = driver.bl * i_coil;
        let v_cone = force / z_mech;
        let x_cone = v_cone / (j * omega);
        displacement_mm.push(x_cone.norm() * 1000.0);

        // Volume velocities
        let u_driver = p.sd_m2 * v_cone;
        // Pressure in box from driver
        let p_box = u_driver * z_box;
        // Passive radiator velocity
        let u_pr = p_box / z_pr;
        // Radiated sound: driver front + passive radiator front
        let p_driver = RHO_0 * omega * u_driver / (2.0 * std::f64::consts::PI);
        let p_pr = RHO_0 * omega * u_pr * enc.pr_sd_m2 / (2.0 * std::f64::consts::PI);
        let p_total = p_driver + p_pr;
        spl_db.push(pressure_to_spl_db(p_total.norm()));
        pressure_phases.push(p_total.arg());
    }

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
