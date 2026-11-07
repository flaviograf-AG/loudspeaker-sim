import { useState } from 'react';
import { NumericInput } from './NumericInput';
import { InfoTooltip } from './InfoTooltip';
import { computeBaffleStepParams, computeGoldenCabinetDimensions } from '../compute';
import type { CabinetDimensions, CrossoverPoint, DriverParams, EnclosureConfig, WayDesign } from '../types';

interface CabinetCalculatorProps {
  enclosure: EnclosureConfig;
  driver: DriverParams;
  cabinet: CabinetDimensions;
  onUpdateCabinet: (cab: CabinetDimensions) => void;
  onUpdateEnclosureVolume?: (volume_m3: number) => void;
  ways?: WayDesign[];
  crossoverPoints?: CrossoverPoint[];
}

/** Extract primary internal volume in liters from any EnclosureConfig */
export function getEnclosureVolumeLiters(enc: EnclosureConfig): number {
  switch (enc.type) {
    case 'Sealed':
    case 'Vented':
    case 'PassiveRadiator':
      return enc.volume_m3 * 1000;
    case 'Bandpass':
      return (enc.rear_volume_m3 + enc.front_volume_m3) * 1000;
    case 'TransmissionLine':
      return ((enc.area_driver_m2 + enc.area_mouth_m2) / 2) * enc.length_m * 1000;
    case 'Horn': {
      const segVol = enc.segments.reduce(
        (acc, s) => acc + ((s.area_start_m2 + s.area_end_m2) / 2) * s.length_m,
        0
      );
      return (segVol + enc.rear_chamber.volume_m3) * 1000;
    }
    case 'OpenBaffle':
      return 0;
  }
}

export function CabinetCalculator({
  enclosure,
  driver,
  cabinet,
  onUpdateCabinet,
  onUpdateEnclosureVolume,
  ways,
  crossoverPoints,
}: CabinetCalculatorProps) {
  const [jointType, setJointType] = useState<'butt' | 'miter'>('butt');
  const [woodMaterial, setWoodMaterial] = useState<'mdf18' | 'birch18' | 'mdf25'>('mdf18');

  const wallCm = cabinet.wall_thickness_mm / 10;
  const intW = Math.max(2, cabinet.width_cm - 2 * wallCm);
  const intH = Math.max(2, cabinet.height_cm - 2 * wallCm);
  const intD = Math.max(2, cabinet.depth_cm - 2 * wallCm);

  // Port volume deduction if Vented or Bandpass
  let portVolumeL = 0;
  if (enclosure.type === 'Vented') {
    portVolumeL = enclosure.port_area_m2 * enclosure.port_length_m * enclosure.num_ports * 1000;
  } else if (enclosure.type === 'Bandpass') {
    portVolumeL = enclosure.port_area_m2 * enclosure.port_length_m * 1000;
  }

  const grossInternalL = (intW * intH * intD) / 1000;
  const netInternalL = Math.max(
    0.1,
    grossInternalL - cabinet.bracing_volume_l - cabinet.driver_displacement_l - portVolumeL
  );
  const targetEncL = getEnclosureVolumeLiters(enclosure);

  // Shared Baffle Step parameters (automatically coupled with Crossover Designer)
  const bsc = computeBaffleStepParams(cabinet.width_cm, driver.re_ohm, 4.5);

  // Apply a proportion preset to match the current enclosure net volume
  const applyProportionPreset = (ratioH: number, ratioW: number, ratioD: number) => {
    const targetGrossCm3 =
      Math.max(0.5, targetEncL + cabinet.bracing_volume_l + cabinet.driver_displacement_l + portVolumeL) * 1000;
    const scale = Math.cbrt(targetGrossCm3 / (ratioH * ratioW * ratioD));
    const newW = Number((scale * ratioW + 2 * wallCm).toFixed(1));
    const newH = Number((scale * ratioH + 2 * wallCm).toFixed(1));
    const newD = Number((scale * ratioD + 2 * wallCm).toFixed(1));
    onUpdateCabinet({
      ...cabinet,
      width_cm: newW,
      height_cm: newH,
      depth_cm: newD,
    });
  };

  const handleDimensionChange = (patch: Partial<CabinetDimensions>) => {
    const next = { ...cabinet, ...patch };
    onUpdateCabinet(next);
    if (next.sync_with_enclosure && onUpdateEnclosureVolume) {
      const wCm = next.wall_thickness_mm / 10;
      const iW = Math.max(2, next.width_cm - 2 * wCm);
      const iH = Math.max(2, next.height_cm - 2 * wCm);
      const iD = Math.max(2, next.depth_cm - 2 * wCm);
      const grossL = (iW * iH * iD) / 1000;
      const netL = Math.max(0.2, grossL - next.bracing_volume_l - next.driver_displacement_l - portVolumeL);
      onUpdateEnclosureVolume(netL / 1000);
    }
  };

  // Panel cut-list calculation (in mm)
  const extW_mm = Math.round(cabinet.width_cm * 10);
  const extH_mm = Math.round(cabinet.height_cm * 10);
  const extD_mm = Math.round(cabinet.depth_cm * 10);
  const t_mm = Math.round(cabinet.wall_thickness_mm);

  const panels =
    jointType === 'butt'
      ? [
          { name: 'Front & Back (×2)', w: extW_mm, h: extH_mm, note: 'Overlay front/back' },
          { name: 'Top & Bottom (×2)', w: extW_mm - 2 * t_mm, h: extD_mm - 2 * t_mm, note: 'Inset between sides & front/back' },
          { name: 'Left & Right Sides (×2)', w: extD_mm - 2 * t_mm, h: extH_mm, note: 'Full height between front & back' },
        ]
      : [
          { name: 'Front & Back (×2)', w: extW_mm, h: extH_mm, note: '45° miter all 4 edges' },
          { name: 'Top & Bottom (×2)', w: extW_mm, h: extD_mm, note: '45° miter all 4 edges' },
          { name: 'Left & Right Sides (×2)', w: extD_mm, h: extH_mm, note: '45° miter all 4 edges' },
        ];

  const totalAreaM2 = panels.reduce((sum, p) => sum + 2 * (p.w / 1000) * (p.h / 1000), 0);
  const densityKgM3 = woodMaterial === 'birch18' ? 680 : 750;
  const estWeightKg = totalAreaM2 * (t_mm / 1000) * densityKgM3;

  // Driver cutout diameter (cm) from shared Sd
  const driverDiaCm = 2 * Math.sqrt((driver.sd_m2 * 1e4) / Math.PI);

  // Multi-way vertical center-to-center spacing vs. crossover wavelength check
  const upperWay = ways && ways.length > 1 ? ways[ways.length - 1] : null;
  const upperDiaCm = upperWay ? Math.max(2.8, 2 * Math.sqrt((upperWay.driver.sd_m2 * 1e4) / Math.PI)) : 0;
  // Minimum physical flange-to-flange center spacing (approx 1.25 * r_woofer + 1.4 * r_tweeter + 1.5 cm margin)
  const dCtcCm = upperWay ? Number((driverDiaCm * 0.62 + upperDiaCm * 0.7 + 2.2).toFixed(1)) : 0;
  const highestXoHz =
    crossoverPoints && crossoverPoints.length > 0
      ? crossoverPoints[crossoverPoints.length - 1].freq_hz
      : 2500;
  const lambdaXoCm = Number((34321 / Math.max(100, highestXoHz)).toFixed(1));
  const lobingRatio = lambdaXoCm > 0 ? dCtcCm / lambdaXoCm : 0;

  return (
    <div className="section-card" data-testid="cabinet-calculator">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>
          3D Cabinet & Cut-List
          <InfoTooltip variant="section" docKey="section:cabinet-3d" />
        </div>
        <button
          className="graf-btn graf-btn-sm graf-btn-outline"
          title="Fit cabinet external dimensions to current enclosure volume using Golden Ratio"
          onClick={() =>
            onUpdateCabinet(
              computeGoldenCabinetDimensions(
                Math.max(1, targetEncL),
                cabinet.wall_thickness_mm,
                cabinet.bracing_volume_l,
                cabinet.driver_displacement_l
              )
            )
          }
        >
          Fit to {targetEncL.toFixed(1)} L
        </button>
      </div>

      {/* Proportion presets */}
      <div className="btn-row" style={{ marginBottom: 6 }}>
        <button
          className="graf-btn graf-btn-sm graf-btn-outline"
          title="Golden Ratio (1.618 : 1 : 0.618) — minimizes internal standing-wave modes"
          onClick={() => applyProportionPreset(1.618, 1.0, 0.618)}
        >
          Golden
        </button>
        <button
          className="graf-btn graf-btn-sm graf-btn-outline"
          title="Compact Bookshelf proportion (1.5 : 1.0 : 1.15)"
          onClick={() => applyProportionPreset(1.5, 1.0, 1.15)}
        >
          Bookshelf
        </button>
        <button
          className="graf-btn graf-btn-sm graf-btn-outline"
          title="Slim Tower / Floorstander proportion (3.6 : 1.0 : 1.3)"
          onClick={() => applyProportionPreset(3.6, 1.0, 1.3)}
        >
          Tower
        </button>
        <button
          className="graf-btn graf-btn-sm graf-btn-outline"
          title="Subwoofer Cube proportion (1.0 : 1.0 : 1.0)"
          onClick={() => applyProportionPreset(1.0, 1.0, 1.0)}
        >
          Cube
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11 }}>
        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={cabinet.sync_with_enclosure}
            onChange={(e) => handleDimensionChange({ sync_with_enclosure: e.target.checked })}
          />
          Two-way sync with Enclosure Volume ({netInternalL.toFixed(1)} L net)
        </label>
      </div>

      <NumericInput
        label="Height (H)"
        value={cabinet.height_cm}
        step={0.5}
        min={8}
        max={250}
        unit="cm"
        tooltip="External cabinet height (cm)."
        onChange={(v) => handleDimensionChange({ height_cm: v })}
      />
      <NumericInput
        label="Width (W)"
        value={cabinet.width_cm}
        step={0.5}
        min={8}
        max={150}
        unit="cm"
        tooltip="External front baffle width (cm). Directly sets the shared Baffle Step frequency f_bsc = 115 / W_m in the Crossover Designer."
        onChange={(v) => handleDimensionChange({ width_cm: v })}
      />
      <NumericInput
        label="Depth (D)"
        value={cabinet.depth_cm}
        step={0.5}
        min={8}
        max={150}
        unit="cm"
        tooltip="External cabinet depth (cm)."
        onChange={(v) => handleDimensionChange({ depth_cm: v })}
      />
      <NumericInput
        label="Wood thick."
        value={cabinet.wall_thickness_mm}
        step={1}
        min={6}
        max={50}
        unit="mm"
        tooltip="MDF / Plywood wall thickness (mm). Standard: 12mm, 15mm, 18mm, 22mm, 25mm."
        onChange={(v) => handleDimensionChange({ wall_thickness_mm: v })}
      />
      <NumericInput
        label="Bracing + Drv"
        value={Number((cabinet.bracing_volume_l + cabinet.driver_displacement_l).toFixed(2))}
        step={0.2}
        min={0}
        max={30}
        unit="L"
        tooltip="Internal volume displaced by wood bracing and driver magnet/basket."
        onChange={(v) =>
          handleDimensionChange({
            bracing_volume_l: Math.max(0, v - cabinet.driver_displacement_l),
          })
        }
      />

      {/* Shared Acoustic Readouts */}
      <div className="derived-params" style={{ marginTop: 6, marginBottom: 8 }}>
        <span title="Gross internal volume before bracing/driver/port displacement">
          Gross={grossInternalL.toFixed(1)}L
        </span>
        <span title="Net acoustic volume available to the driver">
          Net={netInternalL.toFixed(1)}L
        </span>
        <span title="Shared Baffle Step Frequency (f_3 = 115 / W_m) automatically shared with Crossover Designer">
          f_bsc={bsc.f_bsc_hz}Hz
          <InfoTooltip variant="item" docKey="param:baffle-step" />
        </span>
        <span title="Effective cone diameter from shared driver Sd">
          Ø_cone={driverDiaCm.toFixed(1)}cm
        </span>
        {upperWay && (
          <span
            style={{
              color: lobingRatio <= 1.0 ? '#166534' : '#b45309',
              fontWeight: 600,
            }}
            title={`Vertical driver center-to-center spacing (${dCtcCm} cm) vs. crossover wavelength λ = ${lambdaXoCm} cm at ${highestXoHz} Hz. Keeping d_ctc ≤ 1.0×λ prevents severe vertical off-axis lobing nulls.`}
          >
            d_ctc={dCtcCm}cm ({lobingRatio.toFixed(2)}×λ{lobingRatio <= 1.0 ? ' ✓' : ' ⚠'})
          </span>
        )}
      </div>

      {/* Isometric 3D SVG Cabinet Preview */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          padding: 6,
          marginBottom: 8,
          textAlign: 'center',
        }}
      >
        <CabinetIsometricSvg
          widthCm={cabinet.width_cm}
          heightCm={cabinet.height_cm}
          depthCm={cabinet.depth_cm}
          driverDiaCm={driverDiaCm}
          upperDiaCm={upperDiaCm}
          hasPort={enclosure.type === 'Vented' || enclosure.type === 'Bandpass'}
          fBscHz={bsc.f_bsc_hz}
        />
      </div>

      {/* Wood Cut-List Table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span className="section-subtitle" style={{ margin: 0 }}>Panel Cut-List (mm)</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            className="graf-input"
            style={{ width: 78, fontSize: 10, padding: '1px 4px' }}
            value={jointType}
            onChange={(e) => setJointType(e.target.value as 'butt' | 'miter')}
          >
            <option value="butt">Butt Joint</option>
            <option value="miter">45° Miter</option>
          </select>
          <select
            className="graf-input"
            style={{ width: 78, fontSize: 10, padding: '1px 4px' }}
            value={woodMaterial}
            onChange={(e) => setWoodMaterial(e.target.value as 'mdf18' | 'birch18' | 'mdf25')}
          >
            <option value="mdf18">MDF</option>
            <option value="birch18">Birch Ply</option>
          </select>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
            <th style={{ padding: '2px 4px' }}>Panel</th>
            <th style={{ padding: '2px 4px', textAlign: 'right' }}>Size (mm)</th>
          </tr>
        </thead>
        <tbody>
          {panels.map((p) => (
            <tr key={p.name} style={{ borderBottom: '1px solid #f1f5f9' }} title={p.note}>
              <td style={{ padding: '3px 4px' }}>{p.name}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right', fontFamily: 'var(--graf-font-mono)' }}>
                {Math.max(10, p.w)} × {Math.max(10, p.h)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span>Sheet area: {totalAreaM2.toFixed(2)} m²</span>
        <span>Est. weight: {estWeightKg.toFixed(1)} kg</span>
      </div>
    </div>
  );
}

function CabinetIsometricSvg({
  widthCm,
  heightCm,
  depthCm,
  driverDiaCm,
  upperDiaCm = 0,
  hasPort,
  fBscHz,
}: {
  widthCm: number;
  heightCm: number;
  depthCm: number;
  driverDiaCm: number;
  upperDiaCm?: number;
  hasPort: boolean;
  fBscHz: number;
}) {
  const maxDim = Math.max(widthCm, heightCm, depthCm, 10);
  const scale = 78 / maxDim;
  const w = Math.max(24, widthCm * scale);
  const h = Math.max(28, heightCm * scale);
  const d = Math.max(16, depthCm * scale * 0.55);

  const ox = 45;
  const oy = 25 + d * 0.5;

  // Front face rectangle: (ox, oy) to (ox + w, oy + h)
  // Isometric depth vector: (+d * 0.8, -d * 0.5)
  const dx = d * 0.8;
  const dy = -d * 0.5;

  const frontPath = `M ${ox} ${oy} L ${ox + w} ${oy} L ${ox + w} ${oy + h} L ${ox} ${oy + h} Z`;
  const topPath = `M ${ox} ${oy} L ${ox + dx} ${oy + dy} L ${ox + w + dx} ${oy + dy} L ${ox + w} ${oy} Z`;
  const sidePath = `M ${ox + w} ${oy} L ${ox + w + dx} ${oy + dy} L ${ox + w + dx} ${oy + h + dy} L ${ox + w} ${oy + h} Z`;

  const hasTweeter = upperDiaCm > 0;
  const rDriver = Math.min(w * 0.36, h * (hasTweeter ? 0.22 : 0.28), Math.max(6, (driverDiaCm * scale) / 2));
  const rTweeter = hasTweeter ? Math.min(w * 0.2, h * 0.12, Math.max(4, (upperDiaCm * scale) / 2)) : 0;
  const cx = ox + w / 2;
  const cyTweeter = oy + h * 0.22;
  const cy = oy + (hasTweeter ? (hasPort ? h * 0.52 : h * 0.58) : hasPort ? h * 0.38 : h * 0.5);

  return (
    <svg width="210" height="135" viewBox="0 0 210 135" style={{ display: 'inline-block' }}>
      {/* Top face */}
      <path d={topPath} fill="#e2e8f0" stroke="#475569" strokeWidth="1.2" />
      {/* Right side face */}
      <path d={sidePath} fill="#cbd5e1" stroke="#475569" strokeWidth="1.2" />
      {/* Front baffle face */}
      <path d={frontPath} fill="#f1f5f9" stroke="#1e293b" strokeWidth="1.5" />

      {/* Tweeter cutout (multi-way) */}
      {hasTweeter && (
        <>
          <circle cx={cx} cy={cyTweeter} r={rTweeter * 1.35} fill="#475569" stroke="#0f172a" strokeWidth="0.9" />
          <circle cx={cx} cy={cyTweeter} r={rTweeter * 0.65} fill="#0f172a" />
        </>
      )}

      {/* Woofer cutout & surround */}
      <circle cx={cx} cy={cy} r={rDriver} fill="#334155" stroke="#0f172a" strokeWidth="1.2" />
      <circle cx={cx} cy={cy} r={rDriver * 0.32} fill="#0f172a" />

      {/* Port cutout if Vented/Bandpass */}
      {hasPort && (
        <circle
          cx={cx}
          cy={oy + (hasTweeter ? h * 0.83 : h * 0.76)}
          r={Math.min(w * 0.15, h * 0.08, 7)}
          fill="#0f172a"
          stroke="#475569"
          strokeWidth="1"
        />
      )}

      {/* Dimension callouts */}
      <text x={ox + w / 2} y={oy + h + 12} fontSize="9" textAnchor="middle" fill="#334155">
        W: {widthCm.toFixed(1)} cm (f_bsc {fBscHz} Hz)
      </text>
      <text x={ox - 6} y={oy + h / 2} fontSize="9" textAnchor="end" fill="#334155">
        {heightCm.toFixed(1)}cm
      </text>
      <text x={ox + w + dx + 4} y={oy + dy + h / 2} fontSize="9" textAnchor="start" fill="#475569">
        D:{depthCm.toFixed(1)}
      </text>
    </svg>
  );
}

