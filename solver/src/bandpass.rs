//! 4th-order bandpass enclosure model.
//!
//! The driver fires into a sealed rear chamber. The front chamber
//! is vented — all acoustic output comes through the port.
//! This produces a bandpass-shaped SPL response.
//!
//! Reference: Fincham, L.R. "A Bandpass Filter Loudspeaker System" (AES, 1983)

use num_complex::Complex;

use crate::constants::{C_0, RHO_0, TWO_PI};
use crate::sweep::{compute_group_delay_ms, pressure_to_spl_db};
use crate::types::{BandpassParams, DerivedDriver, SimulationResult};

pub fn bandpass_frequency_response(
    driver: &DerivedDriver,
    enc: &BandpassParams,
    frequencies_hz: &[f64],
    drive_voltage_rms: f64,
) -> SimulationResult {
    let p = &driver.params;
    let j = Complex::new(0.0, 1.0);

    // Acoustic elements
    let cab_rear = enc.rear_volume_m3 / (RHO_0 * C_0 * C_0);
    let cab_front = enc.front_volume_m3 / (RHO_0 * C_0 * C_0);

    // Port
    let port_d = (4.0 * enc.port_area_m2 / std::f64::consts::PI).sqrt();
    let port_r = port_d / 2.0;
    let end_corr = if enc.port_flanged { 0.85 * port_r } else { 0.6 * port_r };
    let lp_eff = enc.port_length_m + 2.0 * end_corr;
    let map = RHO_0 * lp_eff / enc.port_area_m2;

    // Driver acoustic elements
    let sd2 = p.sd_m2 * p.sd_m2;
    let mas = driver.mms / sd2;
    let ras = driver.rms / sd2;
    let cas = driver.cms * sd2;

    // Port tuning
    let fb = C_0 / (TWO_PI) * (enc.port_area_m2 / (lp_eff * enc.front_volume_m3)).sqrt();

    let n = frequencies_hz.len();
    let mut spl_db = Vec::with_capacity(n);
    let mut impedance_ohm = Vec::with_capacity(n);
    let mut impedance_phase_deg = Vec::with_capacity(n);
    let mut displacement_mm = Vec::with_capacity(n);
    let mut pressure_phases = Vec::with_capacity(n);

    for &f in frequencies_hz {
        let omega = TWO_PI * f;
        let s = j * omega;

        // Rear chamber: sealed compliance with Ql loss
        let z_rear = {
            let z_c = 1.0 / (s * cab_rear);
            if enc.rear_ql > 0.0 && enc.rear_ql < 1e6 {
                let r_ab = enc.rear_ql / (TWO_PI * fb * cab_rear);
                let r_c = Complex::new(r_ab, 0.0);
                (z_c * r_c) / (z_c + r_c)
            } else { z_c }
        };

        // Front chamber: compliance ∥ port
        let z_front_c = 1.0 / (s * cab_front);
        let z_front_c_loss = if enc.front_ql > 0.0 && enc.front_ql < 1e6 {
            let r_ab = enc.front_ql / (TWO_PI * fb * cab_front);
            let r_c = Complex::new(r_ab, 0.0);
            (z_front_c * r_c) / (z_front_c + r_c)
        } else { z_front_c };
        let z_port = s * map;
        let z_front = (z_front_c_loss * z_port) / (z_front_c_loss + z_port);

        // Driver sees: rear compliance + front load
        // In acoustic domain: Z_total = Z_rear + Z_front (series)
        // Driver compliance is in parallel path
        let z_acoustic = s * mas + ras + 1.0 / (s * cas) + z_rear + z_front;

        // Convert to electrical
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

        // Port output: volume velocity through port
        let u_driver = p.sd_m2 * v_cone;
        // Pressure in front chamber from driver
        let p_front = u_driver * z_front;
        let u_port = p_front / z_port;

        // SPL: only port radiates (driver is enclosed)
        let p_acoustic = RHO_0 * omega * u_port / (2.0 * std::f64::consts::PI);
        spl_db.push(pressure_to_spl_db(p_acoustic.norm()));
        pressure_phases.push(p_acoustic.arg());
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
