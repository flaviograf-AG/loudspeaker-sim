import { useState } from 'react';
import type { EnclosureConfig, EnclosureType } from '../types';
import { NumericInput } from './NumericInput';

const C0 = 343.21; // speed of sound (m/s)

/**
 * Calculate port length from target tuning frequency.
 * Inverse of: Fb = c₀/(2π) × √(Sp / (Lp_eff × Vb))
 * Solving for physical length: Lp = Sp / (Vb × (2πFb/c₀)²) - end_corrections
 * Reference: Small (1973), Eq. 5
 */
function portLengthForFb(
  fb_hz: number,
  volume_m3: number,
  port_area_m2: number,
  num_ports: number,
  port_flanged: boolean,
): number {
  const total_port_area = port_area_m2 * num_ports;
  const omega_b = 2 * Math.PI * fb_hz;
  const lp_eff = total_port_area / (volume_m3 * (omega_b / C0) ** 2);
  // Subtract end corrections to get physical length
  const port_diameter = Math.sqrt((4 * port_area_m2) / Math.PI);
  const radius = port_diameter / 2;
  const correction = port_flanged ? 0.85 * radius : 0.6 * radius;
  const physical = lp_eff - 2 * correction;
  return Math.max(physical, 0.01); // minimum 1 cm
}

interface Props {
  config: EnclosureConfig;
  onChange: (config: EnclosureConfig) => void;
}

const DEFAULT_CONFIGS: Record<EnclosureType, EnclosureConfig> = {
  Sealed: { type: 'Sealed', volume_m3: 18e-3, ql: 7 },
  Vented: { type: 'Vented', volume_m3: 25e-3, port_area_m2: 20e-4, port_length_m: 0.15, num_ports: 1, port_flanged: true, ql: 7 },
  TransmissionLine: { type: 'TransmissionLine', length_m: 2.0, area_driver_m2: 132e-4, area_mouth_m2: 132e-4, num_segments: 20, stuffing_density_kg_m3: 5, flow_resistivity_pa_s_m2: 5000, open_end: true },
};

export function EnclosureInputs({ config, onChange }: Props) {
  const encType = config.type;
  const [targetFb, setTargetFb] = useState<number | null>(null);

  const switchType = (t: EnclosureType) => {
    if (t !== encType) onChange(DEFAULT_CONFIGS[t]);
  };

  return (
    <div className="section-card">
      <div className="section-title">Enclosure</div>
      <div className="btn-row" style={{ marginBottom: 8 }}>
        {(['Sealed', 'Vented', 'TransmissionLine'] as EnclosureType[]).map((t) => (
          <button
            key={t}
            className={`graf-btn graf-btn-sm ${encType === t ? 'graf-btn-primary' : 'graf-btn-outline'}`}
            onClick={() => switchType(t)}
          >
            {t === 'TransmissionLine' ? 'T-Line' : t}
          </button>
        ))}
      </div>

      {config.type === 'Sealed' && (
        <>
          <NumericInput label="Volume" value={config.volume_m3 * 1000} step={0.5} min={0.1} unit="L"
            onChange={(v) => onChange({ ...config, volume_m3: v / 1000 })} />
          <NumericInput label="Ql" value={config.ql} step={0.5} min={1} max={50}
            onChange={(v) => onChange({ ...config, ql: v })} />
        </>
      )}

      {config.type === 'Vented' && (
        <>
          <NumericInput label="Volume" value={config.volume_m3 * 1000} step={0.5} min={0.1} unit="L"
            onChange={(v) => onChange({ ...config, volume_m3: v / 1000 })} />
          <NumericInput label="Port area" value={config.port_area_m2 * 1e4} step={1} min={1} unit="cm²"
            onChange={(v) => onChange({ ...config, port_area_m2: v / 1e4 })} />
          <NumericInput label="Port length" value={config.port_length_m * 100} step={1} min={1} unit="cm"
            onChange={(v) => { setTargetFb(null); onChange({ ...config, port_length_m: v / 100 }); }} />
          <div className="param-row">
            <span className="param-label">Target Fb</span>
            <input
              type="number"
              className="graf-form-control"
              value={targetFb ?? ''}
              placeholder="Hz"
              step={1}
              min={10}
              max={200}
              style={{ width: 90 }}
              onChange={(e) => {
                const fb = parseFloat(e.target.value);
                if (!isNaN(fb) && fb > 0) {
                  setTargetFb(fb);
                  const newLength = portLengthForFb(
                    fb, config.volume_m3, config.port_area_m2, config.num_ports, config.port_flanged,
                  );
                  onChange({ ...config, port_length_m: newLength });
                } else {
                  setTargetFb(null);
                }
              }}
            />
            <span className="param-unit">Hz</span>
          </div>
          <NumericInput label="Ports" value={config.num_ports} step={1} min={1} max={4}
            onChange={(v) => onChange({ ...config, num_ports: Math.round(v) })} />
          <NumericInput label="Ql" value={config.ql} step={0.5} min={1}
            onChange={(v) => onChange({ ...config, ql: v })} />
        </>
      )}

      {config.type === 'TransmissionLine' && (
        <>
          <NumericInput label="Length" value={config.length_m * 100} step={5} min={10} unit="cm"
            onChange={(v) => onChange({ ...config, length_m: v / 100 })} />
          <NumericInput label="Driver area" value={config.area_driver_m2 * 1e4} step={1} min={1} unit="cm²"
            onChange={(v) => onChange({ ...config, area_driver_m2: v / 1e4 })} />
          <NumericInput label="Mouth area" value={config.area_mouth_m2 * 1e4} step={1} min={1} unit="cm²"
            onChange={(v) => onChange({ ...config, area_mouth_m2: v / 1e4 })} />
          <NumericInput label="Segments" value={config.num_segments} step={1} min={5} max={50}
            onChange={(v) => onChange({ ...config, num_segments: Math.round(v) })} />
          <NumericInput label="Stuffing" value={config.stuffing_density_kg_m3} step={1} min={0} unit="kg/m³"
            onChange={(v) => onChange({ ...config, stuffing_density_kg_m3: v })} />
          <NumericInput label="Flow res." value={config.flow_resistivity_pa_s_m2} step={500} min={0} unit="Pa·s/m²"
            onChange={(v) => onChange({ ...config, flow_resistivity_pa_s_m2: v })} />
        </>
      )}
    </div>
  );
}
