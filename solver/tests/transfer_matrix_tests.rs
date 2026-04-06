use approx::assert_relative_eq;
use num_complex::Complex;
use loudspeaker_solver::transfer_matrix::*;

#[test]
fn identity_segment_passes_through() {
    // Zero-length segment should be identity matrix
    let omega = 2.0 * std::f64::consts::PI * 100.0;
    let k = Complex::new(omega / 343.21, 0.0);
    let z0 = Complex::new(1.2041 * 343.21 / 0.01, 0.0);

    let tm = duct_transfer_matrix(k, z0, 0.0);

    assert_relative_eq!(tm[0][0].re, 1.0, epsilon = 1e-10);
    assert_relative_eq!(tm[0][1].norm(), 0.0, epsilon = 1e-10);
    assert_relative_eq!(tm[1][0].norm(), 0.0, epsilon = 1e-10);
    assert_relative_eq!(tm[1][1].re, 1.0, epsilon = 1e-10);
}

#[test]
fn cascade_of_two_halves_equals_whole() {
    let omega = 2.0 * std::f64::consts::PI * 200.0;
    let k = Complex::new(omega / 343.21, -0.5);
    let z0 = Complex::new(1.2041 * 343.21 / 0.01, 0.0);
    let length = 0.5;

    let whole = duct_transfer_matrix(k, z0, length);
    let half = duct_transfer_matrix(k, z0, length / 2.0);
    let cascaded = cascade_2x2(&half, &half);

    for i in 0..2 {
        for ji in 0..2 {
            assert_relative_eq!(cascaded[i][ji].re, whole[i][ji].re, epsilon = 1e-10);
            assert_relative_eq!(cascaded[i][ji].im, whole[i][ji].im, epsilon = 1e-10);
        }
    }
}

#[test]
fn reciprocity_det_equals_one() {
    // For a passive lossless segment, det(T) = 1
    let omega = 2.0 * std::f64::consts::PI * 500.0;
    let k = Complex::new(omega / 343.21, 0.0);
    let z0 = Complex::new(1.2041 * 343.21 / 0.005, 0.0);
    let tm = duct_transfer_matrix(k, z0, 0.3);

    let det = tm[0][0] * tm[1][1] - tm[0][1] * tm[1][0];
    assert_relative_eq!(det.re, 1.0, epsilon = 1e-10);
    assert_relative_eq!(det.im, 0.0, epsilon = 1e-10);
}

#[test]
fn complex_wave_number_lossless() {
    let omega = 2.0 * std::f64::consts::PI * 1000.0;
    let k = complex_wave_number(omega, 343.21, 1.2041, 0.0);
    assert_relative_eq!(k.re, omega / 343.21, epsilon = 1e-10);
    assert_relative_eq!(k.im, 0.0, epsilon = 1e-10);
}

#[test]
fn complex_wave_number_with_stuffing() {
    // Full Bradbury model: k_c = k₀ × √(1 + Rf/(jωρ₀))
    let omega = 2.0 * std::f64::consts::PI * 1000.0;
    let rf = 5000.0;
    let rho0 = 1.2041;
    let c0 = 343.21;
    let k = complex_wave_number(omega, c0, rho0, rf);

    // Stuffing should increase real part (slow sound) and add negative imaginary (absorption)
    let k0 = omega / c0;
    assert!(k.re > k0, "Stuffing should increase effective k (slow down sound)");
    assert!(k.im < 0.0, "Imaginary part should be negative (absorption)");

    // Verify against analytical Bradbury formula
    let j = Complex::new(0.0, 1.0);
    let ratio = rf / (j * omega * rho0);
    let expected = Complex::new(k0, 0.0) * (Complex::new(1.0, 0.0) + ratio).sqrt();
    assert_relative_eq!(k.re, expected.re, epsilon = 1e-6);
    assert_relative_eq!(k.im, expected.im, epsilon = 1e-6);
}

#[test]
fn identity_cascade_is_noop() {
    let omega = 2.0 * std::f64::consts::PI * 300.0;
    let k = Complex::new(omega / 343.21, -0.2);
    let z0 = Complex::new(1.2041 * 343.21 / 0.008, 0.0);
    let tm = duct_transfer_matrix(k, z0, 0.4);
    let id = identity_2x2();
    let result = cascade_2x2(&id, &tm);

    for i in 0..2 {
        for ji in 0..2 {
            assert_relative_eq!(result[i][ji].re, tm[i][ji].re, epsilon = 1e-10);
            assert_relative_eq!(result[i][ji].im, tm[i][ji].im, epsilon = 1e-10);
        }
    }
}
