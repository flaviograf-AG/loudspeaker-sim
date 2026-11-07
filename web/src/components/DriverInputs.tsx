import { useState } from 'react';
import type { DriverParams } from '../types';
import {
  deriveDriverMetrics,
  driverFromPhysicalParams,
  computeTruncatedConeSdCm2,
  parseAnalyzerOrDatasheetText,
} from '../compute';
import { NumericInput } from './NumericInput';
import { InfoTooltip } from './InfoTooltip';

interface Props {
  params: DriverParams;
  onChange: (params: DriverParams) => void;
}

export function DriverInputs({ params, onChange }: Props) {
  const [showPhysical, setShowPhysical] = useState(true);
  const [showConeCalc, setShowConeCalc] = useState(false);
  const [showDatsImport, setShowDatsImport] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const metrics = deriveDriverMetrics(params);
  const [rOutMm, setROutMm] = useState(() => Number(metrics.r_out_mm.toFixed(1)));
  const [rInMm, setRInMm] = useState(0);

  const update = (field: keyof DriverParams, value: number) =>
    onChange({ ...params, [field]: value });

  const handlePhysicalUpdate = (updates: {
    bl_tm?: number;
    mms_g?: number;
    cms_mm_n?: number;
    rms_ns_m?: number;
    sd_cm2?: number;
  }) => {
    onChange(driverFromPhysicalParams(params, updates));
  };

  const applyConeGeometry = (ro: number, ri: number) => {
    setROutMm(ro);
    setRInMm(ri);
    const sdCm2 = computeTruncatedConeSdCm2(ro, ri);
    onChange(driverFromPhysicalParams(params, { sd_cm2: sdCm2 }));
  };

  const handleDatsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((txt) => {
      onChange(parseAnalyzerOrDatasheetText(txt, params));
    });
    e.target.value = '';
  };

  return (
    <div className="section-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Driver (Thiele-Small)
          <InfoTooltip variant="section" docKey="section:driver-ts" />
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          <button
            className={`graf-btn graf-btn-sm ${showPhysical ? 'graf-btn-primary' : 'graf-btn-outline'}`}
            style={{ fontSize: 10, padding: '1px 5px' }}
            title="Toggle bidirectional Lumped Physical Electromechanical Parameters (Bl, Mms, Cms, Rms) per Beranek & Mellow / MathWorks T-S Calculator"
            onClick={() => setShowPhysical((s) => !s)}
            data-testid="toggle-physical-ts"
          >
            Physical ⇄ T/S
          </button>
          <button
            className={`graf-btn graf-btn-sm ${showDatsImport ? 'graf-btn-primary' : 'graf-btn-outline'}`}
            style={{ fontSize: 10, padding: '1px 5px' }}
            title="Import Dayton Audio DATS / LA Loudspeaker Analyzer export or paste driver datasheet specs"
            onClick={() => setShowDatsImport((s) => !s)}
          >
            DATS / Paste
          </button>
        </div>
      </div>

      {/* Optional DATS / Datasheet text importer */}
      {showDatsImport && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 4,
            padding: 6,
            marginBottom: 8,
            fontSize: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <strong>Import Dayton DATS / Analyzer or Paste Specs</strong>
            <label className="graf-btn graf-btn-sm graf-btn-outline" style={{ fontSize: 10, cursor: 'pointer', padding: '1px 5px' }}>
              Load .txt/.prs
              <input type="file" accept=".txt,.prs,.dat" hidden onChange={handleDatsFile} />
            </label>
          </div>
          <textarea
            className="graf-input"
            rows={3}
            placeholder="Paste datasheet or analyzer text (e.g. Fs = 38 Hz, Re = 6.2 ohm, Qms = 4.1, Qes = 0.39, Vas = 22 L, Sd = 135 cm2, Bl = 6.8, Mms = 14.5 g)..."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            style={{ width: '100%', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}
          />
          <button
            className="graf-btn graf-btn-sm graf-btn-primary"
            style={{ width: '100%', fontSize: 10 }}
            onClick={() => {
              if (pasteText.trim()) {
                onChange(parseAnalyzerOrDatasheetText(pasteText, params));
                setShowDatsImport(false);
              }
            }}
          >
            Parse & Apply to Shared Driver
          </button>
        </div>
      )}

      {/* Primary Thiele-Small Parameters */}
      <NumericInput
        label="Fs"
        value={params.fs_hz}
        step={1}
        min={10}
        unit="Hz"
        tooltip="Resonant frequency — natural resonance of the driver in free air: fs = 1 / (2π√(Mms·Cms))."
        onChange={(v) => update('fs_hz', v)}
      />
      <NumericInput
        label="Re"
        value={params.re_ohm}
        step={0.1}
        min={0.1}
        unit="Ω"
        tooltip="DC voice coil resistance — measured with a multimeter. Typically 3-7Ω for 4/8Ω nominal drivers."
        onChange={(v) => update('re_ohm', v)}
      />
      <NumericInput
        label="Le"
        value={Number((params.le_h * 1000).toFixed(3))}
        step={0.05}
        min={0}
        unit="mH"
        tooltip="Voice coil inductance — causes impedance rise at high frequencies and sizes the shared Zobel C = Le / Re²."
        onChange={(v) => update('le_h', v / 1000)}
      />
      <NumericInput
        label="Qes"
        value={params.qes}
        step={0.01}
        min={0.01}
        tooltip="Electrical Q factor — Qes = (Re / Bl²)·√(Mms / Cms). Low Qes = strong motor."
        onChange={(v) => update('qes', v)}
      />
      <NumericInput
        label="Qms"
        value={params.qms}
        step={0.1}
        min={0.1}
        tooltip="Mechanical Q factor — Qms = √(Mms / Cms) / Rms. High Qms = low suspension loss."
        onChange={(v) => update('qms', v)}
      />
      <NumericInput
        label="Vas"
        value={Number((params.vas_m3 * 1000).toFixed(2))}
        step={0.5}
        min={0.01}
        unit="L"
        tooltip="Equivalent compliance volume — Vas = Cms · Sd² · ρ₀ · c²."
        onChange={(v) => update('vas_m3', v / 1000)}
      />
      <NumericInput
        label="Sd"
        value={Number((params.sd_m2 * 1e4).toFixed(1))}
        step={1}
        min={0.5}
        unit="cm²"
        tooltip="Effective radiating diaphragm area — measured to the midpoint of the surround."
        onChange={(v) => update('sd_m2', v / 1e4)}
      />
      <NumericInput
        label="Xmax"
        value={Number((params.xmax_m * 1000).toFixed(2))}
        step={0.5}
        min={0.1}
        unit="mm"
        tooltip="Maximum linear one-way excursion — sets Xmax limit line and safe min high-pass crossover frequency."
        onChange={(v) => update('xmax_m', v / 1000)}
      />

      {/* Bidirectional Lumped Physical Component Parameters (MathWorks thieleSmallCalc / Beranek & Mellow) */}
      {showPhysical && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 6,
            borderTop: '1px dashed #cbd5e1',
          }}
          data-testid="physical-params-section"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>
              Lumped Physical Components (⇄ Syncs T/S)
              <InfoTooltip variant="section" docKey="section:physical-params" />
            </span>
            <button
              className="graf-btn graf-btn-sm graf-btn-outline"
              style={{ fontSize: 9, padding: '1px 5px' }}
              title="Calculate effective Sd from outer surround radius (r_out) and inner voice-coil/neck radius (r_in) per MathWorks updateTSparam.m"
              onClick={() => {
                setROutMm(Number(metrics.r_out_mm.toFixed(1)));
                setShowConeCalc((s) => !s);
              }}
            >
              {showConeCalc ? 'Hide Cone Calc' : 'Cone r_out/r_in'}
            </button>
          </div>

          {showConeCalc && (
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 4,
                padding: '4px 6px',
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 10, color: '#475569', marginBottom: 3 }}>
                Truncated Cone Area: Sd = (π/3)·(r_out² + r_out·r_in + r_in²)
              </div>
              <NumericInput
                label="r_out"
                value={rOutMm}
                step={1}
                min={2}
                max={300}
                unit="mm"
                tooltip="Outer diaphragm radius to midpoint of surround (mm)."
                onChange={(v) => applyConeGeometry(v, rInMm)}
              />
              <NumericInput
                label="r_in"
                value={rInMm}
                step={1}
                min={0}
                max={150}
                unit="mm"
                tooltip="Inner cone/dustcap radius (mm). Set 0 for flat circular piston."
                onChange={(v) => applyConeGeometry(rOutMm, v)}
              />
            </div>
          )}

          <NumericInput
            label="Bl (Motor)"
            value={Number(metrics.bl_tm.toFixed(2))}
            step={0.1}
            min={0.2}
            unit="T·m"
            tooltip="Force factor (B·l product). Editing Bl dynamically updates Qes = (Re / Bl²)·√(Mms / Cms)."
            onChange={(v) => handlePhysicalUpdate({ bl_tm: v })}
          />
          <NumericInput
            label="Mms (Mass)"
            value={Number(metrics.mms_g.toFixed(2))}
            step={0.5}
            min={0.05}
            unit="g"
            tooltip="Total moving mass including air radiation load (Mmd + Mmr). Editing Mms dynamically updates Fs, Qms, and Qes."
            onChange={(v) => handlePhysicalUpdate({ mms_g: v })}
          />
          <NumericInput
            label="Cms (Compl)"
            value={Number(metrics.cms_mm_n.toFixed(3))}
            step={0.05}
            min={0.005}
            unit="mm/N"
            tooltip="Mechanical suspension compliance (1 / Kms). Editing Cms dynamically updates Fs, Vas, Qms, and Qes."
            onChange={(v) => handlePhysicalUpdate({ cms_mm_n: v })}
          />
          <NumericInput
            label="Rms (Loss)"
            value={Number(metrics.rms_ns_m.toFixed(2))}
            step={0.05}
            min={0.02}
            unit="kg/s"
            tooltip="Mechanical suspension resistance (N·s/m). Editing Rms dynamically updates Qms = √(Mms / Cms) / Rms."
            onChange={(v) => handlePhysicalUpdate({ rms_ns_m: v })}
          />
          <NumericInput
            label="Ke (Lossy L)"
            value={Number((params.ke ?? 0).toFixed(4))}
            step={0.005}
            min={0}
            unit="s·H"
            tooltip="Voice coil eddy-current semi-inductance loss factor (Knudsen model)."
            onChange={(v) => update('ke', v)}
          />
        </div>
      )}

      {/* Derived Acoustic, Physical & Transient Metrics */}
      <div className="derived-params" style={{ marginTop: 6 }}>
        <span title="Total Q factor — parallel combination of Qes and Qms. Controls transient damping.">
          Qts={metrics.qts.toFixed(3)}
          <InfoTooltip variant="item" docKey="param:qts" />
        </span>
        <span title="Force factor (Bl product) — magnetic flux × voice coil length.">
          Bl={metrics.bl_tm.toFixed(2)} T·m
        </span>
        <span title="Reference sensitivity at 1W/1m and 2.83V/1m in half-space.">
          {metrics.sensitivity_1w_db.toFixed(1)} dB/W ({metrics.sensitivity_2v83_db.toFixed(1)} dB@2.83V)
        </span>
        <span title="Reference efficiency — fraction of electrical power converted to acoustic power.">
          η={metrics.eta0_pct.toFixed(2)}%
        </span>
        <span title="Dry diaphragm mass Mmd vs air radiation mass load Mmr (Beranek & Mellow).">
          Mmd={metrics.mmd_g.toFixed(1)}g + Mmr={metrics.mmr_g.toFixed(2)}g
        </span>
        <span title="Suspension stiffness Kms = 1 / Cms and peak linear volume displacement Vd = Sd × Xmax.">
          Kms={metrics.kms_n_mm.toFixed(2)} N/mm · Vd={metrics.vd_cm3.toFixed(0)} cm³
        </span>
        <span title="Transient decay rate σ = π·fs / Qts and 60 dB impulse ring decay time T60 (MathWorks thieleSmallCalc).">
          Decay σ={metrics.decay_rate_s_inv.toFixed(0)} s⁻¹ (T60={metrics.decay_time_60db_ms.toFixed(1)} ms)
        </span>
        <span title="Efficiency Bandwidth Product (Fs / Qes) and recommended enclosure alignment.">
          EBP={metrics.ebp.toFixed(0)} → {metrics.recommended_enclosure}
          <InfoTooltip variant="item" docKey="param:ebp" />
        </span>
      </div>
    </div>
  );
}
