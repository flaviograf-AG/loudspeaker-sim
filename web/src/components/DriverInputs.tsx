import type { DriverParams } from '../types';
import { NumericInput } from './NumericInput';

interface Props {
  params: DriverParams;
  onChange: (params: DriverParams) => void;
}

export function DriverInputs({ params, onChange }: Props) {
  const update = (field: keyof DriverParams, value: number) =>
    onChange({ ...params, [field]: value });

  return (
    <div className="section-card">
      <div className="section-title">Driver (Thiele-Small)</div>
      <NumericInput label="Fs" value={params.fs_hz} step={1} min={10} unit="Hz" onChange={(v) => update('fs_hz', v)} />
      <NumericInput label="Re" value={params.re_ohm} step={0.1} min={0.1} unit="Ω" onChange={(v) => update('re_ohm', v)} />
      <NumericInput label="Le" value={params.le_h * 1000} step={0.1} min={0} unit="mH" onChange={(v) => update('le_h', v / 1000)} />
      <NumericInput label="Qes" value={params.qes} step={0.01} min={0.01} onChange={(v) => update('qes', v)} />
      <NumericInput label="Qms" value={params.qms} step={0.1} min={0.1} onChange={(v) => update('qms', v)} />
      <NumericInput label="Vas" value={params.vas_m3 * 1000} step={0.5} min={0.1} unit="L" onChange={(v) => update('vas_m3', v / 1000)} />
      <NumericInput label="Sd" value={params.sd_m2 * 1e4} step={1} min={1} unit="cm²" onChange={(v) => update('sd_m2', v / 1e4)} />
      <NumericInput label="Xmax" value={params.xmax_m * 1000} step={0.5} min={0.1} unit="mm" onChange={(v) => update('xmax_m', v / 1000)} />
    </div>
  );
}
