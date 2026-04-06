use loudspeaker_solver::types::*;
use loudspeaker_solver::solve_simulation;

#[test]
fn sealed_simulation_end_to_end() {
    let input = SimulationInput {
        driver: DriverParams {
            fs_hz: 37.0,
            re_ohm: 6.5,
            le_h: 0.5e-3,
            qes: 0.42,
            qms: 3.5,
            vas_m3: 18.0e-3,
            sd_m2: 132.0e-4,
            xmax_m: 6.0e-3, ke: 0.0,
        },
        enclosure: EnclosureConfig::Sealed(SealedBoxParams {
            volume_m3: 18.0e-3,
            ql: 7.0,
        }),
        freq_start_hz: 20.0,
        freq_end_hz: 20000.0,
        freq_points: 500,
        drive_voltage_rms: 2.83,
    };

    let result = solve_simulation(&input).unwrap();

    assert_eq!(result.frequencies_hz.len(), 500);
    assert_eq!(result.spl_db.len(), 500);
    assert_eq!(result.impedance_ohm.len(), 500);
    assert_eq!(result.cone_displacement_mm.len(), 500);
    assert!(result.port_velocity_ms.is_none());

    // All values should be finite
    assert!(result.spl_db.iter().all(|v| v.is_finite()));
    assert!(result.impedance_ohm.iter().all(|v| v.is_finite() && *v > 0.0));
}

#[test]
fn vented_simulation_end_to_end() {
    let input = SimulationInput {
        driver: DriverParams {
            fs_hz: 37.0,
            re_ohm: 6.5,
            le_h: 0.5e-3,
            qes: 0.42,
            qms: 3.5,
            vas_m3: 18.0e-3,
            sd_m2: 132.0e-4,
            xmax_m: 6.0e-3, ke: 0.0,
        },
        enclosure: EnclosureConfig::Vented(VentedBoxParams {
            volume_m3: 25.0e-3,
            port_area_m2: 20.0e-4,
            port_length_m: 0.15,
            num_ports: 1,
            port_flanged: true,
            ql: 7.0, port_shape: PortShape::Circular,
        }),
        freq_start_hz: 20.0,
        freq_end_hz: 20000.0,
        freq_points: 500,
        drive_voltage_rms: 2.83,
    };

    let result = solve_simulation(&input).unwrap();
    assert!(result.port_velocity_ms.is_some());
    assert_eq!(result.port_velocity_ms.as_ref().unwrap().len(), 500);
}

#[test]
fn tl_simulation_end_to_end() {
    let input = SimulationInput {
        driver: DriverParams {
            fs_hz: 37.0,
            re_ohm: 6.5,
            le_h: 0.5e-3,
            qes: 0.42,
            qms: 3.5,
            vas_m3: 18.0e-3,
            sd_m2: 132.0e-4,
            xmax_m: 6.0e-3, ke: 0.0,
        },
        enclosure: EnclosureConfig::TransmissionLine(TransmissionLineParams {
            length_m: 2.32,
            area_driver_m2: 132.0e-4,
            area_mouth_m2: 132.0e-4,
            num_segments: 20,
            stuffing_density_kg_m3: 10.0,
            flow_resistivity_pa_s_m2: 5000.0,
            open_end: true,
            ..Default::default()
        }),
        freq_start_hz: 20.0,
        freq_end_hz: 20000.0,
        freq_points: 500,
        drive_voltage_rms: 2.83,
    };

    let result = solve_simulation(&input).unwrap();
    assert!(result.spl_db.iter().all(|v| v.is_finite()));
}

#[test]
fn json_round_trip() {
    let input = SimulationInput {
        driver: DriverParams {
            fs_hz: 37.0,
            re_ohm: 6.5,
            le_h: 0.5e-3,
            qes: 0.42,
            qms: 3.5,
            vas_m3: 18.0e-3,
            sd_m2: 132.0e-4,
            xmax_m: 6.0e-3, ke: 0.0,
        },
        enclosure: EnclosureConfig::Sealed(SealedBoxParams {
            volume_m3: 18.0e-3,
            ql: 7.0,
        }),
        freq_start_hz: 20.0,
        freq_end_hz: 20000.0,
        freq_points: 100,
        drive_voltage_rms: 2.83,
    };

    // Serialize input to JSON
    let json = serde_json::to_string(&input).expect("serialize input");
    // Deserialize back
    let parsed: SimulationInput = serde_json::from_str(&json).expect("deserialize input");
    assert_eq!(parsed.freq_points, 100);

    // Run simulation and serialize result
    let result = solve_simulation(&parsed).unwrap();
    let result_json = serde_json::to_string(&result).expect("serialize result");
    assert!(result_json.contains("spl_db"));
}
