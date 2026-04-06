//! Horn loudspeaker model.
//!
//! Models front-loaded, back-loaded, and tapped horns using cascaded
//! Transfer Matrix Method (TMM) segments. Each horn segment can have
//! an independent flare profile (conical, exponential, hyperbolic, tractrix).
//!
//! The horn is divided into N TMM segments per physical segment.
//! Each TMM segment has its own cross-sectional area computed from
//! the segment's flare profile.
//!
//! References:
//! - Keele, D.B. "Optimum Horn Mouth Size" (AES Preprint, 1979)
//! - Leach, W.M. "Electroacoustics and Audio Amplifier Design"
//! - Beranek, L.L. "Acoustics" (1954, revised 1986)

use num_complex::Complex;

use crate::constants::{C_0, RHO_0, TWO_PI};
use crate::sweep::{compute_group_delay_ms, pressure_to_spl_db};
use crate::transfer_matrix::{
    cascade_2x2, characteristic_impedance_stuffed, complex_wave_number,
    duct_transfer_matrix, identity_2x2,
};
use crate::types::{
    DerivedDriver, HornParams, HornProfile, HornSegment, RearChamber,
    SimulationResult,
};

/// Compute cross-sectional area at fractional position within a horn segment.
///
/// `frac` ranges from 0.0 (segment start) to 1.0 (segment end).
fn segment_area_at(seg: &HornSegment, frac: f64) -> f64 {
    let s1 = seg.area_start_m2;
    let s2 = seg.area_end_m2;

    match &seg.profile {
        HornProfile::Conical => {
            // Linear in area
            s1 + (s2 - s1) * frac
        }
        HornProfile::Exponential => {
            // S(x) = S1 × exp(m × x), where m = ln(S2/S1)/L
            if s1 <= 0.0 || s2 <= 0.0 { return s1; }
            let m = (s2 / s1).ln();
            s1 * (m * frac).exp()
        }
        HornProfile::Hyperbolic { t_param } => {
            // Generalized hyperbolic-exponential family.
            // S(x) = S1 × [cosh(x/L × acosh(√(S2/S1))) + T × sinh(x/L × acosh(√(S2/S1)))]²
            // Simplified form for the common cases:
            // T=0: catenoidal, T=1: exponential, T→∞: conical
            if s1 <= 0.0 || s2 <= 0.0 { return s1; }
            let t = *t_param;
            if t >= 99999.0 {
                // Conical fallback
                return s1 + (s2 - s1) * frac;
            }
            if (t - 1.0).abs() < 0.001 {
                // Exponential fallback
                let m = (s2 / s1).ln();
                return s1 * (m * frac).exp();
            }
            // General case: use interpolation between exponential and conical
            // via the T-parameter weighting
            let s_exp = s1 * ((s2 / s1).ln() * frac).exp();
            let s_con = s1 + (s2 - s1) * frac;
            // Blend: T=0 heavily exponential, T→∞ heavily conical
            let w = t / (1.0 + t); // 0 for T=0, 0.5 for T=1, →1 for T→∞
            s_exp * (1.0 - w) + s_con * w
        }
        HornProfile::Tractrix => {
            // Tractrix: the curve whose tangent always has constant length.
            // Area: S(x) = S1 × (R² - (R-x)²) / (R² - R²) ... simplified
            // Use the standard tractrix area expansion:
            //   r(x) = R × sin(arccos(1 - x/R))  where R = mouth radius
            // For implementation, interpolate between radii:
            let r1 = (s1 / std::f64::consts::PI).sqrt();
            let r2 = (s2 / std::f64::consts::PI).sqrt();
            // Tractrix expansion: faster near the mouth
            // Approximate via: r(x) = r1 + (r2-r1) × sin(π/2 × frac)
            let r = r1 + (r2 - r1) * (std::f64::consts::FRAC_PI_2 * frac).sin();
            std::f64::consts::PI * r * r
        }
    }
}

/// Get flow resistivity at a fractional position along the total horn path.
fn horn_flow_resistivity_at(horn: &HornParams, total_frac: f64) -> f64 {
    for zone in &horn.stuffing_zones {
        if total_frac >= zone.start_pct && total_frac < zone.end_pct {
            let fr = zone.flow_resistivity_pa_s_m2;
            if fr > 0.0 { return fr; }
            return 1000.0 * zone.density_kg_m3; // density → flow resistivity
        }
    }
    0.0
}

/// Compute horn frequency response using cascaded transfer matrices.
pub fn horn_frequency_response(
    driver: &DerivedDriver,
    horn: &HornParams,
    frequencies_hz: &[f64],
    drive_voltage_rms: f64,
) -> SimulationResult {
    let p = &driver.params;
    let j = Complex::new(0.0, 1.0);

    // Total horn path length for fractional position calculations
    let total_length: f64 = horn.segments.iter().map(|s| s.length_m).sum();
    let n_tmm = horn.num_tmm_segments.max(1) as usize;

    // Mouth area = last segment's end area
    let mouth_area = horn.segments.last()
        .map(|s| s.area_end_m2)
        .unwrap_or(p.sd_m2);

    let n = frequencies_hz.len();
    let mut spl_db = Vec::with_capacity(n);
    let mut impedance_ohm = Vec::with_capacity(n);
    let mut impedance_phase_deg = Vec::with_capacity(n);
    let mut displacement_mm = Vec::with_capacity(n);
    let mut pressure_phases = Vec::with_capacity(n);

    for &f in frequencies_hz {
        let omega = TWO_PI * f;
        let s_var = j * omega;

        // === Build cascaded TMM for all horn segments ===
        let mut t_horn = identity_2x2();
        let mut cumulative_length = 0.0;

        for seg in &horn.segments {
            let seg_tmm_count = ((seg.length_m / total_length) * n_tmm as f64).max(1.0) as usize;
            let tmm_length = seg.length_m / seg_tmm_count as f64;

            for i in 0..seg_tmm_count {
                let frac = (i as f64 + 0.5) / seg_tmm_count as f64;
                let area = segment_area_at(seg, frac);

                // Stuffing lookup based on total path position
                let total_frac = (cumulative_length + seg.length_m * frac) / total_length;
                let fr = horn_flow_resistivity_at(horn, total_frac);

                let k = complex_wave_number(omega, C_0, RHO_0, fr);
                let z0 = characteristic_impedance_stuffed(omega, RHO_0, C_0, area, fr);
                let t_seg = duct_transfer_matrix(k, z0, tmm_length);
                t_horn = cascade_2x2(&t_horn, &t_seg);
            }
            cumulative_length += seg.length_m;
        }

        // === Mouth radiation impedance ===
        // Adjusted by radiation angle: Z_rad_eff = Z_rad × (4π / Ang)
        let a_mouth = (mouth_area / std::f64::consts::PI).sqrt();
        let ka = (omega / C_0) * a_mouth;
        let z0_mouth = RHO_0 * C_0 / mouth_area;
        let ang_factor = if horn.radiation_angle_sr > 0.0 {
            4.0 * std::f64::consts::PI / horn.radiation_angle_sr
        } else {
            1.0 // Infinite horn (no mouth radiation)
        };
        let z_rad = Complex::new(
            z0_mouth * 0.5 * ka * ka * ang_factor,
            z0_mouth * 0.6133 * ka * ang_factor,
        );

        // === Horn input impedance from transfer matrix ===
        let z_horn_acoustic = (t_horn[0][0] * z_rad + t_horn[0][1])
            / (t_horn[1][0] * z_rad + t_horn[1][1]);

        // === Throat chamber (if present) ===
        let z_load_acoustic = if let Some(tc) = &horn.throat_chamber {
            if tc.volume_m3 > 0.0 {
                // Throat chamber acts as lumped compliance in parallel with horn input
                let c_tc = tc.volume_m3 / (RHO_0 * C_0 * C_0);
                let z_tc = Complex::new(1.0, 0.0) / (s_var * c_tc);
                // Series: throat chamber compliance, then horn
                z_tc + z_horn_acoustic
            } else {
                z_horn_acoustic
            }
        } else {
            z_horn_acoustic
        };

        // === Rear chamber impedance ===
        let z_rear_acoustic = match &horn.rear_chamber {
            RearChamber::Sealed { volume_m3, ql, .. } => {
                let c_rear = volume_m3 / (RHO_0 * C_0 * C_0);
                let z_c = Complex::new(1.0, 0.0) / (s_var * c_rear);
                if *ql > 0.0 && *ql < 1e6 {
                    let fb_rear = 1.0 / (TWO_PI * (driver.mms / (p.sd_m2 * p.sd_m2) * c_rear).sqrt());
                    let r_ab = *ql / (TWO_PI * fb_rear * c_rear);
                    let r_ab_c = Complex::new(r_ab, 0.0);
                    (z_c * r_ab_c) / (z_c + r_ab_c)
                } else {
                    z_c
                }
            }
            RearChamber::Vented { volume_m3, port_area_m2, port_length_m, ql } => {
                let c_rear = volume_m3 / (RHO_0 * C_0 * C_0);
                let z_c = Complex::new(1.0, 0.0) / (s_var * c_rear);
                let port_d = (4.0 * port_area_m2 / std::f64::consts::PI).sqrt();
                let lp_eff = port_length_m + 2.0 * 0.85 * port_d / 2.0;
                let m_port = RHO_0 * lp_eff / port_area_m2;
                let z_port = s_var * m_port;
                let z_cab_loss = if *ql > 0.0 && *ql < 1e6 {
                    let fb = C_0 / (TWO_PI) * (port_area_m2 / (lp_eff * volume_m3)).sqrt();
                    let r_ab = *ql / (TWO_PI * fb * c_rear);
                    let r_c = Complex::new(r_ab, 0.0);
                    (z_c * r_c) / (z_c + r_c)
                } else {
                    z_c
                };
                (z_cab_loss * z_port) / (z_cab_loss + z_port)
            }
        };

        // === Convert to mechanical domain and solve ===
        let sd2 = p.sd_m2 * p.sd_m2;

        // Driver sees: front load (horn) + rear load (chamber) — both in acoustic domain
        // Convert to mechanical: Z_mech = Sd² × Z_acoustic
        let z_front_mech = sd2 * z_load_acoustic;
        let z_rear_mech = sd2 * z_rear_acoustic;

        // Total mechanical impedance on driver
        let z_mech_total = s_var * driver.mms + driver.rms + 1.0 / (s_var * driver.cms)
            + z_front_mech + z_rear_mech;

        let z_mot = driver.bl * driver.bl / z_mech_total;
        let z_in = p.re_ohm + s_var * p.le_h + z_mot;

        impedance_ohm.push(z_in.norm());
        impedance_phase_deg.push(z_in.arg().to_degrees());

        let i_coil = drive_voltage_rms / z_in;
        let force = driver.bl * i_coil;
        let v_cone = force / z_mech_total;
        let x_cone = v_cone / (j * omega);
        displacement_mm.push(x_cone.norm() * 1000.0);

        // === Sound pressure at mouth ===
        let u_driver = p.sd_m2 * v_cone;
        let u_mouth = u_driver / (t_horn[1][0] * z_rad + t_horn[1][1]);

        // Radiated SPL: mouth output dominates for a horn
        // In the horn's passband, mouth output >> direct driver radiation
        let p_mouth = RHO_0 * omega * u_mouth / (2.0 * std::f64::consts::PI);
        let p_driver_direct = RHO_0 * omega * u_driver / (2.0 * std::f64::consts::PI);
        // Sum coherently (phase-correct)
        let p_total = p_driver_direct + p_mouth;
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
