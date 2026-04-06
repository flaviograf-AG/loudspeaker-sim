import { useState } from 'react';
import type { EnclosureConfig, EnclosureType, TaperProfile, StuffingZone, HornProfile, HornSegment } from '../types';
import { NumericInput } from './NumericInput';

const C0 = 343.21;


function portLengthForFb(
  fb_hz: number, volume_m3: number, port_area_m2: number,
  num_ports: number, port_flanged: boolean,
): number {
  const total_port_area = port_area_m2 * num_ports;
  const omega_b = 2 * Math.PI * fb_hz;
  const lp_eff = total_port_area / (volume_m3 * (omega_b / C0) ** 2);
  const port_diameter = Math.sqrt((4 * port_area_m2) / Math.PI);
  const radius = port_diameter / 2;
  const correction = port_flanged ? 0.85 * radius : 0.6 * radius;
  return Math.max(lp_eff - 2 * correction, 0.01);
}

function computeFb(volume_m3: number, port_area_m2: number, port_length_m: number, num_ports: number, port_flanged: boolean): number {
  const port_d = Math.sqrt((4 * port_area_m2) / Math.PI);
  const correction = port_flanged ? 0.85 * port_d / 2 : 0.6 * port_d / 2;
  const lp_eff = port_length_m + 2 * correction;
  const total_area = port_area_m2 * num_ports;
  return (C0 / (2 * Math.PI)) * Math.sqrt(total_area / (lp_eff * volume_m3));
}

interface Props {
  config: EnclosureConfig;
  driverVas?: number;
  driverFs?: number;
  driverQts?: number;
  onChange: (config: EnclosureConfig) => void;
}

const DEFAULT_CONFIGS: Record<EnclosureType, EnclosureConfig> = {
  Sealed: { type: 'Sealed', volume_m3: 18e-3, ql: 7 },
  Vented: { type: 'Vented', volume_m3: 25e-3, port_area_m2: 20e-4, port_length_m: 0.15, num_ports: 1, port_flanged: true, ql: 7, port_shape: { type: 'Circular' } },
  TransmissionLine: { type: 'TransmissionLine', length_m: 2.0, area_driver_m2: 132e-4, area_mouth_m2: 132e-4, num_segments: 20, stuffing_density_kg_m3: 5, flow_resistivity_pa_s_m2: 5000, open_end: true, driver_position: 0, taper_profile: { type: 'Straight' }, stuffing_zones: [], mouth_termination: { type: 'Flush' }, num_folds: 0 },
  Horn: { type: 'Horn', segments: [{ area_start_m2: 132e-4, area_end_m2: 2000e-4, length_m: 0.60, profile: { type: 'Exponential' }, cutoff_hz: 200 }], rear_chamber: { type: 'Sealed', volume_m3: 10e-3, depth_m: 0.15, flow_resistivity_pa_s_m2: 0, lining_thickness_m: 0, ql: 7 }, throat_chamber: null, radiation_angle_sr: 2 * Math.PI, num_tmm_segments: 30, stuffing_zones: [] },
  Bandpass: { type: 'Bandpass', rear_volume_m3: 15e-3, front_volume_m3: 20e-3, port_area_m2: 20e-4, port_length_m: 0.12, port_flanged: true, rear_ql: 7, front_ql: 7 },
  PassiveRadiator: { type: 'PassiveRadiator', volume_m3: 20e-3, pr_sd_m2: 200e-4, pr_cms: 1.0e-3, pr_mms_kg: 0.050, pr_rms: 1.0, ql: 7 },
  OpenBaffle: { type: 'OpenBaffle', width_m: 0.40, height_m: 0.60, driver_offset_m: 0.0 },
};


export function EnclosureInputs({ config, driverVas, driverFs, driverQts, onChange }: Props) {
  const encType = config.type;
  const [targetFb, setTargetFb] = useState<number | null>(null);

  const switchType = (t: EnclosureType) => {
    if (t !== encType) onChange(DEFAULT_CONFIGS[t]);
  };

  // Computed readouts
  let readouts: { label: string; value: string; tip: string }[] = [];
  if (config.type === 'Sealed' && driverVas && driverFs && driverQts) {
    const alpha = driverVas / config.volume_m3;
    const fc = driverFs * Math.sqrt(1 + alpha);
    const qtc_lossless = driverQts * Math.sqrt(1 + alpha);
    const qtc = 1 / (1 / qtc_lossless + 1 / config.ql);
    readouts = [
      { label: 'Fc', value: `${fc.toFixed(1)} Hz`, tip: 'System resonance frequency — Fs × √(1 + Vas/Vb)' },
      { label: 'Qtc', value: qtc.toFixed(3), tip: 'System total Q including box losses — determines transient response (0.577=Bessel, 0.707=Butterworth)' },
      { label: 'α', value: alpha.toFixed(2), tip: 'Compliance ratio Vas/Vb — higher α = smaller box relative to driver, higher Fc' },
    ];
  }
  if (config.type === 'Vented') {
    const fb = computeFb(config.volume_m3, config.port_area_m2, config.port_length_m, config.num_ports, config.port_flanged);
    readouts = [
      { label: 'Fb', value: `${fb.toFixed(1)} Hz`, tip: 'Port tuning frequency (Helmholtz resonance) — where the port takes over bass output from the cone' },
    ];
  }
  if (config.type === 'TransmissionLine') {
    const qw = C0 / (4 * config.length_m);
    readouts = [
      { label: 'λ/4', value: `${qw.toFixed(1)} Hz`, tip: 'Quarter-wave frequency — the fundamental resonance of the line. Bass output peaks near this frequency.' },
    ];
  }

  return (
    <div className="section-card">
      <div className="section-title">Enclosure</div>
      <div className="btn-row" style={{ marginBottom: 8 }}>
        {(['Sealed', 'Vented', 'TransmissionLine', 'Horn', 'Bandpass', 'PassiveRadiator', 'OpenBaffle'] as EnclosureType[]).map((t) => {
          const labels: Record<string, string> = {
            Sealed: 'Sealed', Vented: 'Vented', TransmissionLine: 'T-Line',
            Horn: 'Horn', Bandpass: 'BP', PassiveRadiator: 'PR', OpenBaffle: 'OB',
          };
          const tips: Record<string, string> = {
            Sealed: 'Sealed (closed) box — simplest enclosure, 2nd-order HP rolloff',
            Vented: 'Vented (bass reflex) box — port extends bass, 4th-order rolloff',
            TransmissionLine: 'Transmission Line — acoustic waveguide behind driver, quarter-wave tuning',
            Horn: 'Horn-loaded — flared waveguide increases sensitivity and controls directivity',
            Bandpass: 'Bandpass — driver enclosed between two chambers, only port radiates',
            PassiveRadiator: 'Passive Radiator — sealed box with a mass-loaded passive cone instead of a port',
            OpenBaffle: 'Open Baffle — no box, driver on a flat panel, dipole radiation',
          };
          return (
            <button key={t}
              className={`graf-btn graf-btn-sm ${encType === t ? 'graf-btn-primary' : 'graf-btn-outline'}`}
              onClick={() => switchType(t)}
              title={tips[t]}
            >{labels[t]}</button>
          );
        })}
      </div>

      {config.type === 'Sealed' && (
        <>
          {driverQts && driverFs && driverVas && (
            <div className="param-row" title="Auto-calculate box volume for a standard alignment target">
              <span className="param-label">Alignment</span>
              <select className="graf-form-control" style={{ width: 140 }} value=""
                onChange={(e) => {
                  const qtcTarget = parseFloat(e.target.value);
                  if (isNaN(qtcTarget) || !driverQts || !driverVas) return;
                  const alpha = (qtcTarget / driverQts) ** 2 - 1;
                  if (alpha > 0) {
                    onChange({ ...config, volume_m3: driverVas / alpha });
                  }
                  e.target.value = '';
                }}>
                <option value="" disabled>Set Qtc target...</option>
                <option value="0.577">Bessel (Qtc=0.577)</option>
                <option value="0.707">Butterworth (Qtc=0.707)</option>
                <option value="0.957">Cheby 1dB (Qtc=0.957)</option>
              </select>
            </div>
          )}
          <NumericInput label="Volume" value={config.volume_m3 * 1000} step={0.5} min={0.1} unit="L"
            tooltip="Internal box volume — determines system resonance and Q. Smaller box = higher Fc, higher Qtc."
            onChange={(v) => onChange({ ...config, volume_m3: v / 1000 })} />
          <NumericInput label="Ql" value={config.ql} step={0.5} min={1} max={50}
            tooltip="Box loss Q factor — models absorption from lining material. 5-7 = typical lined box, 15+ = near-lossless, 3 = heavily damped."
            onChange={(v) => onChange({ ...config, ql: v })} />
        </>
      )}

      {config.type === 'Vented' && (
        <>
          {driverQts && driverFs && driverVas && (
            <div className="param-row" title="Auto-calculate box volume and port tuning for a standard vented alignment">
              <span className="param-label">Alignment</span>
              <select className="graf-form-control" style={{ width: 140 }} value=""
                onChange={(e) => {
                  const preset = e.target.value;
                  if (!driverFs || !driverVas || !driverQts) return;
                  let vb = 0, fb = 0;
                  if (preset === 'B4') { vb = driverVas; fb = driverFs; }
                  else if (preset === 'QB3') { vb = 15 * driverVas * driverQts ** 2.87; fb = 0.26 * driverFs * driverQts ** -1.4; }
                  else if (preset === 'SC4') { vb = 2.0 * driverVas; fb = 0.9 * driverFs; }
                  else if (preset === 'EBS') { vb = 3.0 * driverVas; fb = 0.42 * driverFs; }
                  if (vb > 0 && fb > 0) {
                    const newLength = portLengthForFb(fb, vb, config.port_area_m2, config.num_ports, config.port_flanged);
                    onChange({ ...config, volume_m3: vb, port_length_m: newLength });
                    setTargetFb(Math.round(fb));
                  }
                  e.target.value = '';
                }}>
                <option value="" disabled>Set alignment...</option>
                <option value="B4">B4 Butterworth (Vb≈Vas, Fb≈Fs)</option>
                <option value="QB3">QB3 Quasi-Butterworth</option>
                <option value="SC4">SC4 Sub-Chebyshev</option>
                <option value="EBS">EBS Extended Bass</option>
              </select>
            </div>
          )}
          <NumericInput label="Volume" value={config.volume_m3 * 1000} step={0.5} min={0.1} unit="L"
            tooltip="Internal box volume — affects port tuning and system alignment."
            onChange={(v) => onChange({ ...config, volume_m3: v / 1000 })} />
          <NumericInput label="Port area" value={config.port_area_m2 * 1e4} step={1} min={1} unit="cm²"
            tooltip="Port cross-sectional area — larger port = lower air velocity, less turbulence noise, but longer port needed for same tuning."
            onChange={(v) => onChange({ ...config, port_area_m2: v / 1e4 })} />
          <NumericInput label="Port length" value={config.port_length_m * 100} step={1} min={1} unit="cm"
            tooltip="Physical port length (before end corrections) — longer port = lower tuning frequency Fb."
            onChange={(v) => { setTargetFb(null); onChange({ ...config, port_length_m: v / 100 }); }} />
          <div className="param-row" title="Enter desired tuning frequency — port length auto-calculates. Based on Helmholtz resonance formula.">
            <span className="param-label">Target Fb</span>
            <input type="number" className="graf-form-control"
              value={targetFb ?? ''} placeholder="Hz" step={1} min={10} max={200} style={{ width: 90 }}
              onChange={(e) => {
                const fb = parseFloat(e.target.value);
                if (!isNaN(fb) && fb > 0) {
                  setTargetFb(fb);
                  onChange({ ...config, port_length_m: portLengthForFb(fb, config.volume_m3, config.port_area_m2, config.num_ports, config.port_flanged) });
                } else { setTargetFb(null); }
              }}
            />
            <span className="param-unit">Hz</span>
          </div>
          <NumericInput label="Ports" value={config.num_ports} step={1} min={1} max={4}
            tooltip="Number of identical ports — multiple ports reduce per-port air velocity and turbulence noise."
            onChange={(v) => onChange({ ...config, num_ports: Math.round(v) })} />
          <div className="param-row" title="Port shape: Circular (round tube) or Slot (rectangular opening). Slot ports fit flush against a wall and allow shorter port lengths.">
            <span className="param-label">Port shape</span>
            <select className="graf-form-control" style={{ width: 100 }}
              value={config.port_shape.type}
              onChange={(e) => {
                if (e.target.value === 'Circular') {
                  onChange({ ...config, port_shape: { type: 'Circular' } });
                } else {
                  // Slot: derive width/height from area (default 10:1 aspect ratio)
                  const h = Math.sqrt(config.port_area_m2 / 10);
                  onChange({ ...config, port_shape: { type: 'Slot', width_m: 10 * h, height_m: h } });
                }
              }}>
              <option value="Circular">Circular</option>
              <option value="Slot">Slot</option>
            </select>
          </div>
          {config.port_shape.type === 'Slot' && (
            <>
              <NumericInput label="Slot W" value={config.port_shape.width_m * 100} step={1} min={1} unit="cm"
                tooltip="Slot port width — typically spans most of the baffle width."
                onChange={(v) => {
                  const w = v / 100;
                  const h = config.port_shape.type === 'Slot' ? config.port_shape.height_m : 0.02;
                  onChange({ ...config, port_area_m2: w * h, port_shape: { type: 'Slot', width_m: w, height_m: h } });
                }} />
              <NumericInput label="Slot H" value={config.port_shape.type === 'Slot' ? config.port_shape.height_m * 100 : 2} step={0.5} min={0.5} unit="cm"
                tooltip="Slot port height (gap) — typically 1-5 cm. Smaller gap = more port velocity."
                onChange={(v) => {
                  const h = v / 100;
                  const w = config.port_shape.type === 'Slot' ? config.port_shape.width_m : 0.2;
                  onChange({ ...config, port_area_m2: w * h, port_shape: { type: 'Slot', width_m: w, height_m: h } });
                }} />
            </>
          )}
          <div className="param-row" title="Flanged port has both ends terminated by a surface. Affects end correction calculation.">
            <span className="param-label">Flanged</span>
            <input type="checkbox" checked={config.port_flanged}
              onChange={(e) => onChange({ ...config, port_flanged: e.target.checked })} />
          </div>
          <NumericInput label="Ql" value={config.ql} step={0.5} min={1}
            tooltip="Box loss Q factor — models absorption from lining material. 5-7 = typical, 15+ = near-lossless."
            onChange={(v) => onChange({ ...config, ql: v })} />
        </>
      )}

      {config.type === 'TransmissionLine' && (
        <>
          <NumericInput label="Length" value={config.length_m * 100} step={5} min={10} unit="cm"
            tooltip="Total acoustic path length — quarter-wave frequency ≈ 343/(4×L). Typical: 100-300 cm for bass TL."
            onChange={(v) => onChange({ ...config, length_m: v / 100 })} />
          <NumericInput label="Driver area" value={config.area_driver_m2 * 1e4} step={1} min={1} unit="cm²"
            tooltip="Cross-sectional area at the driver end of the line. Often ≈ Sd or slightly larger."
            onChange={(v) => onChange({ ...config, area_driver_m2: v / 1e4 })} />
          <NumericInput label="Mouth area" value={config.area_mouth_m2 * 1e4} step={1} min={1} unit="cm²"
            tooltip="Cross-sectional area at the open end (mouth). Same as driver area for straight TL; smaller for tapered."
            onChange={(v) => onChange({ ...config, area_mouth_m2: v / 1e4 })} />

          <NumericInput label="Driver pos." value={config.driver_position * 100} step={1} min={0} max={49} unit="%"
            tooltip="Driver offset from closed end as % of line length. 0% = at wall (classic). 33% suppresses 3rd harmonic. Creates dead-end section behind driver."
            onChange={(v) => onChange({ ...config, driver_position: v / 100 })} />

          <div className="param-row" title="Line cross-section profile. Straight = linear in radius (quadratic area). Exponential = S(x)=S₀×e^(mx). Conical = linear in area.">
            <span className="param-label">Taper</span>
            <select className="graf-form-control" style={{ width: 120 }}
              value={config.taper_profile.type}
              onChange={(e) => onChange({ ...config, taper_profile: { type: e.target.value as TaperProfile['type'] } })}
            >
              <option value="Straight">Straight</option>
              <option value="Exponential">Exponential</option>
              <option value="Conical">Conical</option>
            </select>
          </div>

          <div className="param-row" title="Open end = quarter-wave TL (mouth radiates). Closed end = half-wave resonator (no mouth output).">
            <span className="param-label">Open end</span>
            <input type="checkbox" checked={config.open_end}
              onChange={(e) => onChange({ ...config, open_end: e.target.checked })} />
          </div>

          <NumericInput label="Folds" value={config.num_folds} step={1} min={0} max={8}
            tooltip="Number of 180° folds in the line. Each fold adds acoustic mass (impedance discontinuity) that damps standing wave peaks."
            onChange={(v) => onChange({ ...config, num_folds: Math.round(v) })} />

          <NumericInput label="Segments" value={config.num_segments} step={1} min={5} max={80}
            tooltip="TMM discretization segments — more segments = more accurate but slower. 20-40 is typical."
            onChange={(v) => onChange({ ...config, num_segments: Math.round(v) })} />

          {/* Per-zone stuffing editor */}
          <div className="section-subtitle" style={{ marginTop: 8 }}>Stuffing</div>
          {config.stuffing_zones.length === 0 ? (
            <>
              <NumericInput label="Density" value={config.stuffing_density_kg_m3} step={1} min={0} unit="kg/m³"
                tooltip="Global stuffing density — converted to flow resistivity via Rf≈1000×density when flow res. is 0. Typical polyester: 5-15 kg/m³."
                onChange={(v) => onChange({ ...config, stuffing_density_kg_m3: v })} />
              <NumericInput label="Flow res." value={config.flow_resistivity_pa_s_m2} step={500} min={0} unit="Pa·s/m²"
                tooltip="Specific airflow resistivity of stuffing material. Polyester fill: 3500-8000. Fiberglass: 10000-40000. 0 = derive from density."
                onChange={(v) => onChange({ ...config, flow_resistivity_pa_s_m2: v })} />
              <button className="graf-btn graf-btn-sm graf-btn-outline" style={{ marginTop: 4 }}
                title="Switch to per-zone stuffing — define different stuffing densities along the line length"
                onClick={() => onChange({ ...config, stuffing_zones: [
                  { start_pct: 0, end_pct: 0.5, density_kg_m3: 12, flow_resistivity_pa_s_m2: 8000 },
                  { start_pct: 0.5, end_pct: 1.0, density_kg_m3: 4, flow_resistivity_pa_s_m2: 3000 },
                ] })}
              >
                Use stuffing zones
              </button>
            </>
          ) : (
            <>
              {config.stuffing_zones.map((zone, i) => (
                <div key={i} className="zone-editor" style={{ border: '1px solid var(--graf-warm-200)', borderRadius: 4, padding: '4px 6px', marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: 'var(--graf-warm-400)', marginBottom: 2 }}>
                    Zone {i + 1}: {(zone.start_pct * 100).toFixed(0)}%–{(zone.end_pct * 100).toFixed(0)}%
                    <button className="graf-btn graf-btn-sm" style={{ float: 'right', padding: '0 4px', fontSize: 10 }}
                      onClick={() => {
                        const zones = config.stuffing_zones.filter((_, j) => j !== i);
                        onChange({ ...config, stuffing_zones: zones });
                      }}>✕</button>
                  </div>
                  <NumericInput label="Start" value={zone.start_pct * 100} step={5} min={0} max={100} unit="%"
                    tooltip="Zone start position as % of line length. 0% = driver end."
                    onChange={(v) => {
                      const zones = [...config.stuffing_zones];
                      zones[i] = { ...zone, start_pct: v / 100 };
                      onChange({ ...config, stuffing_zones: zones });
                    }} />
                  <NumericInput label="End" value={zone.end_pct * 100} step={5} min={0} max={100} unit="%"
                    tooltip="Zone end position as % of line length. 100% = mouth end."
                    onChange={(v) => {
                      const zones = [...config.stuffing_zones];
                      zones[i] = { ...zone, end_pct: v / 100 };
                      onChange({ ...config, stuffing_zones: zones });
                    }} />
                  <NumericInput label="Density" value={zone.density_kg_m3} step={1} min={0} unit="kg/m³"
                    tooltip="Stuffing density for this zone. Heavy near driver (10-20) damps pipe resonances; light near mouth (2-5) preserves bass output."
                    onChange={(v) => {
                      const zones = [...config.stuffing_zones];
                      zones[i] = { ...zone, density_kg_m3: v };
                      onChange({ ...config, stuffing_zones: zones });
                    }} />
                  <NumericInput label="Flow res." value={zone.flow_resistivity_pa_s_m2} step={500} min={0} unit="Pa·s/m²"
                    tooltip="Flow resistivity for this zone. 0 = derive from density."
                    onChange={(v) => {
                      const zones = [...config.stuffing_zones];
                      zones[i] = { ...zone, flow_resistivity_pa_s_m2: v };
                      onChange({ ...config, stuffing_zones: zones });
                    }} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="graf-btn graf-btn-sm graf-btn-outline"
                  title="Add another stuffing zone"
                  onClick={() => {
                    const last = config.stuffing_zones[config.stuffing_zones.length - 1];
                    const newZone: StuffingZone = { start_pct: last.end_pct, end_pct: 1.0, density_kg_m3: 4, flow_resistivity_pa_s_m2: 3000 };
                    onChange({ ...config, stuffing_zones: [...config.stuffing_zones, newZone] });
                  }}>+ Zone</button>
                <button className="graf-btn graf-btn-sm graf-btn-outline"
                  title="Switch back to uniform global stuffing"
                  onClick={() => onChange({ ...config, stuffing_zones: [] })}
                >Global</button>
              </div>
            </>
          )}
        </>
      )}

      {config.type === 'Bandpass' && (
        <>
          <NumericInput label="Rear vol." value={config.rear_volume_m3 * 1000} step={0.5} min={0.1} unit="L"
            tooltip="Sealed rear chamber volume — determines high-pass rolloff of the bandpass."
            onChange={(v) => onChange({ ...config, rear_volume_m3: v / 1000 })} />
          <NumericInput label="Front vol." value={config.front_volume_m3 * 1000} step={0.5} min={0.1} unit="L"
            tooltip="Vented front chamber volume — the port radiates from this chamber."
            onChange={(v) => onChange({ ...config, front_volume_m3: v / 1000 })} />
          <NumericInput label="Port area" value={config.port_area_m2 * 1e4} step={1} min={1} unit="cm²"
            tooltip="Front port cross-sectional area."
            onChange={(v) => onChange({ ...config, port_area_m2: v / 1e4 })} />
          <NumericInput label="Port len." value={config.port_length_m * 100} step={1} min={1} unit="cm"
            tooltip="Front port physical length."
            onChange={(v) => onChange({ ...config, port_length_m: v / 100 })} />
          <NumericInput label="Rear Ql" value={config.rear_ql} step={0.5} min={1}
            tooltip="Rear chamber loss Q."
            onChange={(v) => onChange({ ...config, rear_ql: v })} />
          <NumericInput label="Front Ql" value={config.front_ql} step={0.5} min={1}
            tooltip="Front chamber loss Q."
            onChange={(v) => onChange({ ...config, front_ql: v })} />
        </>
      )}

      {config.type === 'PassiveRadiator' && (
        <>
          <NumericInput label="Volume" value={config.volume_m3 * 1000} step={0.5} min={0.1} unit="L"
            tooltip="Box volume — sealed enclosure containing both the driver and the passive radiator."
            onChange={(v) => onChange({ ...config, volume_m3: v / 1000 })} />
          <NumericInput label="PR Sd" value={config.pr_sd_m2 * 1e4} step={1} min={1} unit="cm²"
            tooltip="Passive radiator effective cone area. Often larger than the driver Sd."
            onChange={(v) => onChange({ ...config, pr_sd_m2: v / 1e4 })} />
          <NumericInput label="PR Cms" value={config.pr_cms * 1e3} step={0.1} min={0.01} unit="mm/N"
            tooltip="Passive radiator compliance — determines tuning. Lower = higher tuning frequency."
            onChange={(v) => onChange({ ...config, pr_cms: v / 1e3 })} />
          <NumericInput label="PR Mms" value={config.pr_mms_kg * 1000} step={1} min={1} unit="g"
            tooltip="Passive radiator total moving mass (diaphragm + added mass). Increase to lower tuning."
            onChange={(v) => onChange({ ...config, pr_mms_kg: v / 1000 })} />
          <NumericInput label="PR Rms" value={config.pr_rms} step={0.1} min={0} unit="N·s/m"
            tooltip="Passive radiator mechanical damping."
            onChange={(v) => onChange({ ...config, pr_rms: v })} />
          <NumericInput label="Ql" value={config.ql} step={0.5} min={1}
            tooltip="Box loss Q."
            onChange={(v) => onChange({ ...config, ql: v })} />
        </>
      )}

      {config.type === 'OpenBaffle' && (
        <>
          <NumericInput label="Width" value={config.width_m * 100} step={5} min={10} unit="cm"
            tooltip="Baffle width — determines baffle step frequency: f_step ≈ 343/(π×w). Wider baffle = lower step."
            onChange={(v) => onChange({ ...config, width_m: v / 100 })} />
          <NumericInput label="Height" value={config.height_m * 100} step={5} min={10} unit="cm"
            tooltip="Baffle height — affects diffraction path length."
            onChange={(v) => onChange({ ...config, height_m: v / 100 })} />
          <NumericInput label="Offset" value={config.driver_offset_m * 100} step={1} min={0} unit="cm"
            tooltip="Driver horizontal offset from baffle center — asymmetry smooths diffraction ripple."
            onChange={(v) => onChange({ ...config, driver_offset_m: v / 100 })} />
        </>
      )}

      {config.type === 'Horn' && (
        <>
          <div className="section-subtitle">Horn Segments ({config.segments.length})</div>
          {config.segments.map((seg, i) => (
            <div key={i} style={{ border: '1px solid var(--graf-warm-200)', borderRadius: 4, padding: '4px 6px', marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: 'var(--graf-warm-400)', marginBottom: 2 }}>
                Segment {i + 1}
                {config.segments.length > 1 && (
                  <button className="graf-btn graf-btn-sm" style={{ float: 'right', padding: '0 4px', fontSize: 10 }}
                    onClick={() => {
                      const segs = config.segments.filter((_, j) => j !== i);
                      onChange({ ...config, segments: segs });
                    }}>✕</button>
                )}
              </div>
              <NumericInput label="S start" value={seg.area_start_m2 * 1e4} step={10} min={1} unit="cm²"
                tooltip="Cross-sectional area at the start of this segment. Segment 1 start = horn throat."
                onChange={(v) => {
                  const segs = [...config.segments];
                  segs[i] = { ...seg, area_start_m2: v / 1e4 };
                  onChange({ ...config, segments: segs });
                }} />
              <NumericInput label="S end" value={seg.area_end_m2 * 1e4} step={10} min={1} unit="cm²"
                tooltip="Cross-sectional area at the end of this segment. Last segment end = horn mouth."
                onChange={(v) => {
                  const segs = [...config.segments];
                  segs[i] = { ...seg, area_end_m2: v / 1e4 };
                  onChange({ ...config, segments: segs });
                }} />
              <NumericInput label="Length" value={seg.length_m * 100} step={5} min={1} unit="cm"
                tooltip="Axial length of this horn segment."
                onChange={(v) => {
                  const segs = [...config.segments];
                  segs[i] = { ...seg, length_m: v / 100 };
                  onChange({ ...config, segments: segs });
                }} />
              <div className="param-row" title="Flare profile: Conical (linear area), Exponential (e^mx), Hyperbolic (T-parameter family), Tractrix (tangential curve).">
                <span className="param-label">Profile</span>
                <select className="graf-form-control" style={{ width: 120 }}
                  value={seg.profile.type}
                  onChange={(e) => {
                    const segs = [...config.segments];
                    const ptype = e.target.value as HornProfile['type'];
                    const profile: HornProfile = ptype === 'Hyperbolic' ? { type: 'Hyperbolic', t_param: 0.5 } : { type: ptype } as HornProfile;
                    segs[i] = { ...seg, profile };
                    onChange({ ...config, segments: segs });
                  }}
                >
                  <option value="Conical">Conical</option>
                  <option value="Exponential">Exponential</option>
                  <option value="Hyperbolic">Hyperbolic</option>
                  <option value="Tractrix">Tractrix</option>
                </select>
              </div>
              {seg.profile.type === 'Hyperbolic' && (
                <NumericInput label="T param" value={seg.profile.t_param} step={0.1} min={0} max={99999}
                  tooltip="Hyperbolic flare parameter. T=0: catenoidal, T=1: exponential, T>1: sinh family, T=99999: conical."
                  onChange={(v) => {
                    const segs = [...config.segments];
                    segs[i] = { ...seg, profile: { type: 'Hyperbolic', t_param: v } };
                    onChange({ ...config, segments: segs });
                  }} />
              )}
              {(seg.profile.type === 'Exponential' || seg.profile.type === 'Hyperbolic') && (
                <NumericInput label="Cutoff" value={seg.cutoff_hz} step={10} min={0} unit="Hz"
                  tooltip="Flare cutoff frequency — below this, the horn ceases to load the driver effectively."
                  onChange={(v) => {
                    const segs = [...config.segments];
                    segs[i] = { ...seg, cutoff_hz: v };
                    onChange({ ...config, segments: segs });
                  }} />
              )}
            </div>
          ))}
          {config.segments.length < 4 && (
            <button className="graf-btn graf-btn-sm graf-btn-outline" style={{ marginBottom: 8 }}
              title="Add another horn segment (up to 4)"
              onClick={() => {
                const last = config.segments[config.segments.length - 1];
                const newSeg: HornSegment = {
                  area_start_m2: last.area_end_m2,
                  area_end_m2: last.area_end_m2 * 2,
                  length_m: last.length_m,
                  profile: { type: 'Conical' },
                  cutoff_hz: 0,
                };
                onChange({ ...config, segments: [...config.segments, newSeg] });
              }}>+ Segment</button>
          )}

          <div className="section-subtitle">Rear Chamber</div>
          <div className="param-row" title="Rear chamber type: Sealed (closed with optional lining) or Vented (bass reflex with port).">
            <span className="param-label">Type</span>
            <select className="graf-form-control" style={{ width: 120 }}
              value={config.rear_chamber.type}
              onChange={(e) => {
                if (e.target.value === 'Sealed') {
                  onChange({ ...config, rear_chamber: { type: 'Sealed', volume_m3: 10e-3, depth_m: 0.15, flow_resistivity_pa_s_m2: 0, lining_thickness_m: 0, ql: 7 } });
                } else {
                  onChange({ ...config, rear_chamber: { type: 'Vented', volume_m3: 10e-3, port_area_m2: 20e-4, port_length_m: 0.1, ql: 7 } });
                }
              }}
            >
              <option value="Sealed">Sealed</option>
              <option value="Vented">Vented</option>
            </select>
          </div>
          {config.rear_chamber.type === 'Sealed' && (() => {
            const rc = config.rear_chamber;
            return <>
              <NumericInput label="Volume" value={rc.volume_m3 * 1000} step={0.5} min={0.1} unit="L"
                tooltip="Rear chamber volume behind the driver."
                onChange={(v) => onChange({ ...config, rear_chamber: { ...rc, volume_m3: v / 1000 } })} />
              <NumericInput label="Ql" value={rc.ql} step={0.5} min={1}
                tooltip="Rear chamber loss Q."
                onChange={(v) => onChange({ ...config, rear_chamber: { ...rc, ql: v } })} />
            </>;
          })()}
          {config.rear_chamber.type === 'Vented' && (() => {
            const rc = config.rear_chamber;
            return <>
              <NumericInput label="Volume" value={rc.volume_m3 * 1000} step={0.5} min={0.1} unit="L"
                tooltip="Rear chamber volume."
                onChange={(v) => onChange({ ...config, rear_chamber: { ...rc, volume_m3: v / 1000 } })} />
              <NumericInput label="Port area" value={rc.port_area_m2 * 1e4} step={1} min={1} unit="cm²"
                tooltip="Rear port cross-sectional area."
                onChange={(v) => onChange({ ...config, rear_chamber: { ...rc, port_area_m2: v / 1e4 } })} />
              <NumericInput label="Port len." value={rc.port_length_m * 100} step={1} min={1} unit="cm"
                tooltip="Rear port physical length."
                onChange={(v) => onChange({ ...config, rear_chamber: { ...rc, port_length_m: v / 100 } })} />
              <NumericInput label="Ql" value={rc.ql} step={0.5} min={1}
                tooltip="Rear chamber loss Q."
                onChange={(v) => onChange({ ...config, rear_chamber: { ...rc, ql: v } })} />
            </>;
          })()}

          <NumericInput label="TMM segs" value={config.num_tmm_segments} step={5} min={10} max={100}
            tooltip="Number of TMM discretization segments across all horn segments. More = more accurate, slower. 30 typical."
            onChange={(v) => onChange({ ...config, num_tmm_segments: Math.round(v) })} />
        </>
      )}

      {/* Computed readouts */}
      {readouts.length > 0 && (
        <div className="derived-params" style={{ marginTop: 6 }}>
          {readouts.map((r) => (
            <span key={r.label} title={r.tip}>{r.label}={r.value}</span>
          ))}
        </div>
      )}
    </div>
  );
}
