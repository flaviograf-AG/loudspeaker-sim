import { useCallback } from 'react';
import { PresetSelector } from './PresetSelector';
import { DriverInputs } from './DriverInputs';
import { parseFrd } from '../io/frd';
import { parseZma } from '../io/zma';
import type { WayDesign, DriverParams } from '../types';

interface WayEditorProps {
  way: WayDesign;
  onUpdate: (updates: Partial<WayDesign>) => void;
}

export function WayEditor({ way, onUpdate }: WayEditorProps) {
  const handleFrd = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(text => {
      const frd = parseFrd(text);
      // Merge FRD into measured — read current way.measured at apply time via onUpdate
      onUpdate({
        measured: {
          frequencies_hz: frd.frequencies,
          spl_db: frd.spl_db,
          phase_deg: frd.phase_deg,
          // Preserve existing ZMA data if any (read from current way prop)
          impedance_ohm: way.measured?.impedance_ohm ?? [],
          impedance_phase_deg: way.measured?.impedance_phase_deg ?? [],
        }
      });
    });
    e.target.value = '';
  }, [way.measured?.impedance_ohm, way.measured?.impedance_phase_deg, onUpdate]);

  const handleZma = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(text => {
      const zma = parseZma(text);
      onUpdate({
        measured: {
          // Preserve existing FRD data if any
          frequencies_hz: way.measured?.frequencies_hz ?? zma.frequencies,
          spl_db: way.measured?.spl_db ?? [],
          phase_deg: way.measured?.phase_deg ?? [],
          impedance_ohm: zma.impedance_ohm,
          impedance_phase_deg: zma.phase_deg,
        }
      });
    });
    e.target.value = '';
  }, [way.measured?.frequencies_hz, way.measured?.spl_db, way.measured?.phase_deg, onUpdate]);

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
          <input type="file" accept=".frd,.txt" hidden onChange={handleFrd} />
        </label>
        <label className="graf-btn graf-btn-sm graf-btn-outline" style={{ cursor: 'pointer', fontSize: 11 }}>
          Import ZMA
          <input type="file" accept=".zma,.txt" hidden onChange={handleZma} />
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
    </>
  );
}
