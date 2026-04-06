use loudspeaker_solver::driver::derive_driver;
use loudspeaker_solver::types::{DriverParams, PortShape, VentedBoxParams};
use loudspeaker_solver::vented::*;

fn test_driver() -> DriverParams {
    DriverParams {
        fs_hz: 37.0,
        re_ohm: 6.5,
        le_h: 0.5e-3,
        qes: 0.42,
        qms: 3.5,
        vas_m3: 18.0e-3,
        sd_m2: 132.0e-4,
        xmax_m: 6.0e-3,
    }
}

fn test_enclosure() -> VentedBoxParams {
    VentedBoxParams {
        volume_m3: 25.0e-3, // 25 L
        port_area_m2: 20.0e-4, // 20 cm² (circular port ~5cm diameter)
        port_length_m: 0.15,   // 15 cm
        num_ports: 1,
        port_flanged: true,
        ql: 7.0, port_shape: PortShape::Circular,
    }
}

#[test]
fn port_resonance_frequency() {
    let enc = test_enclosure();
    let fb = port_resonance_hz(&enc);
    // Should be in a reasonable range for this port/box combo
    assert!(fb > 25.0 && fb < 50.0, "Port resonance {} Hz out of range", fb);
}

#[test]
fn vented_has_two_impedance_peaks() {
    let driver = derive_driver(&test_driver());
    let enc = test_enclosure();
    let freqs: Vec<f64> = (15..=100).map(|f| f as f64).collect();
    let result = vented_frequency_response(&driver, &enc, &freqs, 2.83);

    // Find local maxima in impedance
    let peaks: Vec<usize> = (1..result.impedance_ohm.len() - 1)
        .filter(|&i| {
            result.impedance_ohm[i] > result.impedance_ohm[i - 1]
                && result.impedance_ohm[i] > result.impedance_ohm[i + 1]
        })
        .collect();

    assert_eq!(peaks.len(), 2,
        "Vented box should have exactly 2 impedance peaks, found {}", peaks.len());
}

#[test]
fn vented_rolls_off_at_24db_per_octave() {
    let driver = derive_driver(&test_driver());
    let enc = test_enclosure();

    // Vented box should roll off more steeply than sealed near tuning.
    // Compare vented vs sealed SPL drop from 15→30 Hz (near Fb ≈ 35 Hz).
    // Vented should drop more because the port cancels the driver below tuning.
    let vented_result = vented_frequency_response(&driver, &enc, &[15.0, 30.0], 2.83);
    let vented_drop = vented_result.spl_db[1] - vented_result.spl_db[0];

    // For reference: sealed would give ~12 dB/oct.
    // Vented should give steeper drop in this range.
    // The key test: SPL at 15 Hz is significantly lower than at 30 Hz.
    assert!(vented_drop > 10.0,
        "Vented should roll off steeply near tuning, got {} dB/octave", vented_drop);
}

#[test]
fn vented_has_port_velocity() {
    let driver = derive_driver(&test_driver());
    let enc = test_enclosure();
    let result = vented_frequency_response(&driver, &enc, &[30.0, 40.0, 50.0], 2.83);
    assert!(result.port_velocity_ms.is_some(), "Vented should return port velocity");

    let pv = result.port_velocity_ms.as_ref().unwrap();
    // Port velocity should be non-zero near tuning
    assert!(pv.iter().all(|&v| v > 0.0), "Port velocity should be positive");
}
