import type { DriverParams } from '../types';
import { NumericInput } from './NumericInput';

interface Props {
  params: DriverParams;
  onChange: (params: DriverParams) => void;
}

// Derive canonical parameters (mirrors solver/src/driver.rs)
function deriveParams(p: DriverParams) {
  const RHO = 1.2041, C = 343.21, TWO_PI = 2 * Math.PI;
  const omega_s = TWO_PI * p.fs_hz;
  const qts = (p.qes * p.qms) / (p.qes + p.qms);
  const cms = p.vas_m3 / (RHO * C * C * p.sd_m2 * p.sd_m2);
  const mms = 1.0 / (omega_s * omega_s * cms);
  const bl = Math.sqrt(p.re_ohm * mms * omega_s / p.qes);
  // Reference efficiency: η₀ = (4π²/c³) × (fs³×Vas/Qes) — Small (1972)
  const eta0 = (4 * Math.PI * Math.PI * p.fs_hz ** 3 * p.vas_m3) / (C ** 3 * p.qes);
  const sensitivity = 112.1 + 10 * Math.log10(eta0); // dB SPL/W/m (half-space)
  return { qts, bl, mms: mms * 1000, sensitivity, eta0: eta0 * 100 };
}

export function DriverInputs({ params, onChange }: Props) {
  const update = (field: keyof DriverParams, value: number) =>
    onChange({ ...params, [field]: value });

  const derived = deriveParams(params);

  return (
    <div className="section-card">
      <div className="section-title">Driver (Thiele-Small)</div>
      <NumericInput label="Fs" value={params.fs_hz} step={1} min={10} unit="Hz"
        tooltip="Resonant frequency — the natural resonance of the driver in free air. Typical: 20-80 Hz for woofers, 500-3000 Hz for tweeters."
        onChange={(v) => update('fs_hz', v)} />
      <NumericInput label="Re" value={params.re_ohm} step={0.1} min={0.1} unit="Ω"
        tooltip="DC voice coil resistance — measured with a multimeter. Typically 3-7Ω for 4/8Ω nominal drivers."
        onChange={(v) => update('re_ohm', v)} />
      <NumericInput label="Le" value={params.le_h * 1000} step={0.1} min={0} unit="mH"
        tooltip="Voice coil inductance — causes impedance rise at high frequencies. Typical: 0.1-2.0 mH."
        onChange={(v) => update('le_h', v / 1000)} />
      <NumericInput label="Qes" value={params.qes} step={0.01} min={0.01}
        tooltip="Electrical Q factor — ratio of electrical energy stored to dissipated at resonance. Low Qes = strong motor. Typical: 0.2-0.8."
        onChange={(v) => update('qes', v)} />
      <NumericInput label="Qms" value={params.qms} step={0.1} min={0.1}
        tooltip="Mechanical Q factor — ratio of mechanical energy stored to dissipated at resonance. High Qms = low suspension loss. Typical: 1-10."
        onChange={(v) => update('qms', v)} />
      <NumericInput label="Vas" value={params.vas_m3 * 1000} step={0.5} min={0.1} unit="L"
        tooltip="Equivalent compliance volume — the volume of air with the same compliance as the driver suspension. Determines how the driver interacts with box volume."
        onChange={(v) => update('vas_m3', v / 1000)} />
      <NumericInput label="Sd" value={params.sd_m2 * 1e4} step={1} min={1} unit="cm²"
        tooltip="Effective cone area — the radiating area of the diaphragm. Measured to the midpoint of the surround."
        onChange={(v) => update('sd_m2', v / 1e4)} />
      <NumericInput label="Xmax" value={params.xmax_m * 1000} step={0.5} min={0.1} unit="mm"
        tooltip="Maximum linear excursion — peak one-way displacement before significant distortion. Shown as limit line on displacement plot."
        onChange={(v) => update('xmax_m', v / 1000)} />

      <div className="derived-params">
        <span title="Total Q factor — parallel combination of Qes and Qms. Controls transient response shape.">
          Qts={derived.qts.toFixed(3)}
        </span>
        <span title="Force factor (Bl product) — magnetic flux × voice coil length. Higher = stronger motor.">
          Bl={derived.bl.toFixed(2)}
        </span>
        <span title="Reference sensitivity at 1W/1m in half-space. Higher = louder per watt.">
          {derived.sensitivity.toFixed(1)} dB/W/m
        </span>
        <span title="Reference efficiency — fraction of electrical power converted to acoustic power.">
          η={derived.eta0.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
