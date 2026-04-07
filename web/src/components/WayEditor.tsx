import { PresetSelector } from './PresetSelector';
import { DriverInputs } from './DriverInputs';
import { NumericInput } from './NumericInput';
import { parseFrd } from '../io/frd';
import { parseZma } from '../io/zma';
import type { WayDesign, DriverParams } from '../types';

interface WayEditorProps {
  way: WayDesign;
  wayIndex: number;
  onUpdate: (updates: Partial<WayDesign>) => void;
}

export function WayEditor({ way, wayIndex, onUpdate }: WayEditorProps) {
  return (
    <>
      <PresetSelector
        onSelect={(driver: DriverParams, name: string) => onUpdate({ driver, preset_name: name })}
        currentName={way.preset_name}
      />
      <DriverInputs params={way.driver} onChange={(d) => onUpdate({ driver: d })} />

      {/* FRD/ZMA import — replaces T/S simulation with measured data */}
      <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
        <label className="graf-btn graf-btn-sm graf-btn-outline" style={{ cursor: 'pointer', fontSize: 11 }}>
          Import FRD
          <input type="file" accept=".frd,.txt" hidden onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const idx = wayIndex; // capture at click time
            const existingMeasured = way.measured;
            file.text().then(text => {
              const frd = parseFrd(text);
              onUpdate({
                measured: {
                  frequencies_hz: frd.frequencies,
                  spl_db: frd.spl_db,
                  phase_deg: frd.phase_deg,
                  impedance_ohm: existingMeasured?.impedance_ohm ?? [],
                  impedance_phase_deg: existingMeasured?.impedance_phase_deg ?? [],
                }
              });
            });
            e.target.value = '';
          }} />
        </label>
        <label className="graf-btn graf-btn-sm graf-btn-outline" style={{ cursor: 'pointer', fontSize: 11 }}>
          Import ZMA
          <input type="file" accept=".zma,.txt" hidden onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const existingMeasured = way.measured;
            file.text().then(text => {
              const zma = parseZma(text);
              onUpdate({
                measured: {
                  frequencies_hz: existingMeasured?.frequencies_hz ?? zma.frequencies,
                  spl_db: existingMeasured?.spl_db ?? [],
                  phase_deg: existingMeasured?.phase_deg ?? [],
                  impedance_ohm: zma.impedance_ohm,
                  impedance_phase_deg: zma.phase_deg,
                }
              });
            });
            e.target.value = '';
          }} />
        </label>
        {way.measured && (
          <button className="graf-btn graf-btn-sm" style={{ fontSize: 11 }}
            onClick={() => onUpdate({ measured: undefined })}
            title="Remove measured data and revert to T/S simulation">
            Clear FRD/ZMA
          </button>
        )}
      </div>
      {way.measured && (
        <div style={{ fontSize: 10, color: 'var(--graf-warm-500)', marginTop: 2 }}>
          FRD: {way.measured.spl_db.length > 0 ? `${way.measured.spl_db.length} points` : 'none'}
          {' | '}
          ZMA: {way.measured.impedance_ohm.length > 0 ? `${way.measured.impedance_ohm.length} points` : 'none'}
          {' \u2014 Using measured data (T/S simulation bypassed)'}
        </div>
      )}

      {/* Per-way controls: gain, delay, z-offset, enable, invert */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
          <label title="Enable/disable this way" style={{ fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={way.enabled}
              onChange={(e) => onUpdate({ enabled: e.target.checked })} /> On
          </label>
          <label title="Invert polarity (180deg phase flip)" style={{ fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={way.inverted}
              onChange={(e) => onUpdate({ inverted: e.target.checked })} /> Inv
          </label>
        </div>
        <NumericInput label="Gain" value={way.gain_db} step={0.5} min={-20} max={20} unit="dB"
          tooltip="Per-way level adjustment."
          onChange={(v) => onUpdate({ gain_db: v })} />
        <NumericInput label="Delay" value={way.delay_s * 1e6} step={10} min={0} unit="us"
          tooltip="Per-way time delay. 29 us = 1 cm."
          onChange={(v) => onUpdate({ delay_s: v / 1e6 })} />
        <NumericInput label="Z offset" value={way.z_offset_m * 100} step={0.5} min={-20} max={20} unit="cm"
          tooltip="Physical depth offset. Positive = recessed."
          onChange={(v) => onUpdate({ z_offset_m: v / 100 })} />
      </div>
    </>
  );
}
