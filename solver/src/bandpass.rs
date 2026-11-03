//! 4th-order and 6th-order bandpass enclosure models.
//!
//! - 4th-order (`order == 4`): The driver fires into a sealed rear chamber;
//!   the front chamber is vented and radiates through the front port.
//! - 6th-order (`order == 6`): Both the rear and front chambers are vented
//!   (dual-reflex parallel-tuned bandpass) and both ports radiate into free space.
//!
//! Reference: Fincham, L.R. "A Bandpass Filter Loudspeaker System" (AES, 1983)
//! Reference: Geddes, E.R. "An Introduction to Band-Pass Loudspeaker Systems" (JAES, 1989)

use num_complex::Complex;

use crate::driver::driver_electrical_impedance;
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

    // Acoustic compliances
    let cab_rear = enc.rear_volume_m3 / (RHO_0 * C_0 * C_0);
    let cab_front = enc.front_volume_m3 / (RHO_0 * C_0 * C_0);

    // Front Port
    let port_d = (4.0 * enc.port_area_m2 / std::f64::consts::PI).sqrt();
    let port_r = port_d / 2.0;
    let end_corr = if enc.port_flanged { 0.85 * port_r } else { 0.6 * port_r };
    let lp_eff = enc.port_length_m + 2.0 * end_corr;
    let map_front = RHO_0 * lp_eff / enc.port_area_m2;
    let fb_front = C_0 / TWO_PI * (enc.port_area_m2 / (lp_eff * enc.front_volume_m3)).sqrt();

    // Optional Rear Port (for 6th-order dual-reflex bandpass)
    let is_6th = enc.order == 6 && enc.rear_port_area_m2 > 0.0 && enc.rear_port_length_m > 0.0;
    let (map_rear, fb_rear) = if is_6th {
        let r_port_d = (4.0 * enc.rear_port_area_m2 / std::f64::consts::PI).sqrt();
        let r_port_r = r_port_d / 2.0;
        let r_end_corr = if enc.rear_port_flanged { 0.85 * r_port_r } else { 0.6 * r_port_r };
        let r_lp_eff = enc.rear_port_length_m + 2.0 * r_end_corr;
        let m_rear = RHO_0 * r_lp_eff / enc.rear_port_area_m2;
        let f_rear = C_0 / TWO_PI * (enc.rear_port_area_m2 / (r_lp_eff * enc.rear_volume_m3)).sqrt();
        (m_rear, f_rear)
    } else {
        (0.0, fb_front)
    };

    // Driver acoustic elements
    let sd2 = p.sd_m2 * p.sd_m2;
    let mas = driver.mms / sd2;
    let ras = driver.rms / sd2;
    let cas = driver.cms * sd2;

    let n = frequencies_hz.len();
    let mut spl_db = Vec::with_capacity(n);
    let mut impedance_ohm = Vec::with_capacity(n);
    let mut impedance_phase_deg = Vec::with_capacity(n);
    let mut displacement_mm = Vec::with_capacity(n);
    let mut pressure_phases = Vec::with_capacity(n);
    let mut port_velocity = Vec::with_capacity(n);

    for &f in frequencies_hz {
        let omega = TWO_PI * f;
        let s = j * omega;

        // Rear chamber compliance with Ql loss
        let z_rear_c = 1.0 / (s * cab_rear);
        let z_rear_c_loss = if enc.rear_ql > 0.0 && enc.rear_ql < 1e6 {
            let r_ab = enc.rear_ql / (TWO_PI * fb_rear * cab_rear);
            let r_c = Complex::new(r_ab, 0.0);
            (z_rear_c * r_c) / (z_rear_c + r_c)
        } else {
            z_rear_c
        };

        let (z_rear, z_port_rear_opt) = if is_6th {
            let z_pr = s * map_rear;
            ((z_rear_c_loss * z_pr) / (z_rear_c_loss + z_pr), Some(z_pr))
        } else {
            (z_rear_c_loss, None)
        };

        // Front chamber: compliance ∥ front port
        let z_front_c = 1.0 / (s * cab_front);
        let z_front_c_loss = if enc.front_ql > 0.0 && enc.front_ql < 1e6 {
            let r_ab = enc.front_ql / (TWO_PI * fb_front * cab_front);
            let r_c = Complex::new(r_ab, 0.0);
            (z_front_c * r_c) / (z_front_c + r_c)
        } else {
            z_front_c
        };
        let z_port_front = s * map_front;
        let z_front = (z_front_c_loss * z_port_front) / (z_front_c_loss + z_port_front);

        // Driver sees: rear load + front load in series with its own acoustic impedance
        let z_acoustic = s * mas + ras + 1.0 / (s * cas) + z_rear + z_front;

        // Convert to electrical
        let z_mech = sd2 * z_acoustic;
        let z_mot = driver.bl * driver.bl / z_mech;
        let z_in = driver_electrical_impedance(p, s) + z_mot;

        impedance_ohm.push(z_in.norm());
        impedance_phase_deg.push(z_in.arg().to_degrees());

        let i_coil = drive_voltage_rms / z_in;
        let force = driver.bl * i_coil;
        let v_cone = force / z_mech;
        let x_cone = v_cone / (j * omega);
        displacement_mm.push(x_cone.norm() * 1000.0);

        // Volume velocity of driver cone
        let u_driver = p.sd_m2 * v_cone;

        // Front port volume velocity
        let p_front = u_driver * z_front;
        let u_port_front = p_front / z_port_front;
        let v_port_front = (u_port_front / enc.port_area_m2).norm();

        // Rear port volume velocity (for 6th-order: rear chamber is driven by -u_driver)
        let (u_total, max_v_port) = if let Some(z_port_rear) = z_port_rear_opt {
            let p_rear = -u_driver * z_rear;
            let u_port_rear = p_rear / z_port_rear;
            let v_port_rear = (u_port_rear / enc.rear_port_area_m2).norm();
            (u_port_front + u_port_rear, v_port_front.max(v_port_rear))
        } else {
            (u_port_front, v_port_front)
        };

        port_velocity.push(max_v_port);

        // SPL: combined port radiation into 2π half-space
        let p_acoustic = RHO_0 * s * u_total / (2.0 * std::f64::consts::PI);
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
        port_velocity_ms: Some(port_velocity),
    }
}
