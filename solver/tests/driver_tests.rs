use approx::assert_relative_eq;
use loudspeaker_solver::driver::derive_driver;
use loudspeaker_solver::types::DriverParams;

/// Reference driver: a typical 6.5" woofer.
/// Hand-calculated derived values verified against Thiele-Small theory.
fn reference_driver() -> DriverParams {
    DriverParams {
        fs_hz: 37.0,
        re_ohm: 6.5,
        le_h: 0.5e-3, // 0.5 mH
        qes: 0.42,
        qms: 3.5,
        vas_m3: 18.0e-3, // 18 L
        sd_m2: 132.0e-4, // 132 cm²
        xmax_m: 6.0e-3,  // 6 mm
    }
}

#[test]
fn qts_is_parallel_combination() {
    let d = derive_driver(&reference_driver());
    // Qts = (Qes × Qms) / (Qes + Qms)
    let expected_qts = (0.42 * 3.5) / (0.42 + 3.5);
    assert_relative_eq!(d.qts, expected_qts, epsilon = 1e-6);
}

#[test]
fn cms_from_vas_and_sd() {
    let d = derive_driver(&reference_driver());
    // Cms = Vas / (ρ₀ × c₀² × Sd²)
    let rho = 1.2041_f64;
    let c = 343.21_f64;
    let sd = 132.0e-4_f64;
    let expected_cms = 18.0e-3 / (rho * c * c * sd * sd);
    assert_relative_eq!(d.cms, expected_cms, epsilon = 1e-10);
}

#[test]
fn mms_from_fs_and_cms() {
    let d = derive_driver(&reference_driver());
    // Mms = 1 / ((2π × Fs)² × Cms)
    let omega_s = 2.0 * std::f64::consts::PI * 37.0;
    let expected_mms = 1.0 / (omega_s * omega_s * d.cms);
    assert_relative_eq!(d.mms, expected_mms, epsilon = 1e-10);
}

#[test]
fn rms_from_qms() {
    let d = derive_driver(&reference_driver());
    // Rms = Mms × ωs / Qms
    let omega_s = 2.0 * std::f64::consts::PI * 37.0;
    let expected_rms = d.mms * omega_s / 3.5;
    assert_relative_eq!(d.rms, expected_rms, epsilon = 1e-10);
}

#[test]
fn bl_from_qes() {
    let d = derive_driver(&reference_driver());
    // Bl = √(Re × Mms × ωs / Qes)
    let omega_s = 2.0 * std::f64::consts::PI * 37.0;
    let expected_bl = (6.5 * d.mms * omega_s / 0.42).sqrt();
    assert_relative_eq!(d.bl, expected_bl, epsilon = 1e-6);
}

#[test]
fn round_trip_consistency() {
    // Verify derived params reconstruct Fs, Qes, Qms
    let p = reference_driver();
    let d = derive_driver(&p);
    let omega_s = 2.0 * std::f64::consts::PI * p.fs_hz;

    // Fs = 1 / (2π × √(Mms × Cms))
    let fs_check = 1.0 / (2.0 * std::f64::consts::PI * (d.mms * d.cms).sqrt());
    assert_relative_eq!(fs_check, p.fs_hz, epsilon = 1e-6);

    // Qms = Mms × ωs / Rms
    let qms_check = d.mms * omega_s / d.rms;
    assert_relative_eq!(qms_check, p.qms, epsilon = 1e-6);

    // Qes = Re × Mms × ωs / Bl²
    let qes_check = p.re_ohm * d.mms * omega_s / (d.bl * d.bl);
    assert_relative_eq!(qes_check, p.qes, epsilon = 1e-6);
}
