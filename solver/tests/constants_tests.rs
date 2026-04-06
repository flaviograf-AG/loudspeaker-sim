use loudspeaker_solver::constants::*;

#[test]
fn air_density_at_20c() {
    // Beranek, "Acoustics" (1954, rev. 1986), Table 1.1
    assert!((RHO_0 - 1.2041).abs() < 1e-4);
}

#[test]
fn speed_of_sound_at_20c() {
    // Beranek, Table 1.1
    assert!((C_0 - 343.21).abs() < 0.1);
}

#[test]
fn characteristic_impedance_is_rho_times_c() {
    assert!((Z_0 - RHO_0 * C_0).abs() < 0.01);
}

#[test]
fn reference_pressure_is_20_micropascals() {
    assert!((P_REF - 20e-6).abs() < 1e-10);
}

#[test]
fn default_drive_voltage_is_2_83v() {
    // 2.83V RMS = 1W into 8Ω
    assert!((DEFAULT_DRIVE_V_RMS - 2.83).abs() < 0.01);
}

#[test]
fn two_pi_is_correct() {
    assert!((TWO_PI - 2.0 * std::f64::consts::PI).abs() < 1e-15);
}
