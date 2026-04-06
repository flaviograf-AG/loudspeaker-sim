use loudspeaker_solver::types::*;

fn sample_driver() -> DriverParams {
    // Dayton Audio DC160-8 (typical mid-woofer)
    DriverParams {
        fs_hz: 37.0,
        re_ohm: 6.2,
        le_h: 0.56e-3,       // 0.56 mH → H
        qes: 0.44,
        qms: 4.67,
        vas_m3: 19.8e-3,     // 19.8 L → m³
        sd_m2: 136.0e-4,     // 136 cm² → m²
        xmax_m: 6.6e-3,      // 6.6 mm → m
    }
}

#[test]
fn driver_params_stores_all_fields() {
    let d = sample_driver();
    assert!((d.fs_hz - 37.0).abs() < 1e-10);
    assert!((d.re_ohm - 6.2).abs() < 1e-10);
    assert!((d.le_h - 0.56e-3).abs() < 1e-10);
    assert!((d.qes - 0.44).abs() < 1e-10);
    assert!((d.qms - 4.67).abs() < 1e-10);
    assert!((d.vas_m3 - 19.8e-3).abs() < 1e-10);
    assert!((d.sd_m2 - 136.0e-4).abs() < 1e-10);
    assert!((d.xmax_m - 6.6e-3).abs() < 1e-10);
}

#[test]
fn driver_params_clone() {
    let d = sample_driver();
    let d2 = d.clone();
    assert!((d.fs_hz - d2.fs_hz).abs() < 1e-15);
}

#[test]
fn driver_params_serializes_to_json() {
    let d = sample_driver();
    let json = serde_json::to_string(&d).expect("should serialize");
    assert!(json.contains("\"fs_hz\""));
    assert!(json.contains("37.0"));
}

#[test]
fn driver_params_deserializes_from_json() {
    let json = r#"{"fs_hz":37.0,"re_ohm":6.2,"le_h":0.00056,"qes":0.44,"qms":4.67,"vas_m3":0.0198,"sd_m2":0.0136,"xmax_m":0.0066}"#;
    let d: DriverParams = serde_json::from_str(json).expect("should deserialize");
    assert!((d.fs_hz - 37.0).abs() < 1e-10);
    assert!((d.xmax_m - 0.0066).abs() < 1e-10);
}

#[test]
fn sealed_box_params_fields() {
    let b = SealedBoxParams {
        volume_m3: 15.0e-3,  // 15 L
        ql: 7.0,
    };
    assert!((b.volume_m3 - 0.015).abs() < 1e-10);
    assert!((b.ql - 7.0).abs() < 1e-10);
}

#[test]
fn vented_box_params_fields() {
    let b = VentedBoxParams {
        volume_m3: 30.0e-3,
        port_area_m2: 20.0e-4,   // 20 cm²
        port_length_m: 0.15,
        num_ports: 1,
        port_flanged: true,
        ql: 7.0, port_shape: PortShape::Circular,
    };
    assert_eq!(b.num_ports, 1);
    assert!(b.port_flanged);
}

#[test]
fn transmission_line_params_fields() {
    let t = TransmissionLineParams {
        length_m: 1.5,
        area_driver_m2: 150.0e-4,
        area_mouth_m2: 150.0e-4,
        num_segments: 20,
        stuffing_density_kg_m3: 0.5,
        flow_resistivity_pa_s_m2: 5000.0,
        open_end: true,
        ..Default::default()
    };
    assert_eq!(t.num_segments, 20);
    assert!(t.open_end);
    assert!((t.flow_resistivity_pa_s_m2 - 5000.0).abs() < 1e-10);
}
