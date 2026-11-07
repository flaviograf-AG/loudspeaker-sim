import { useCallback } from 'react';
import { PresetSelector } from './PresetSelector';
import { DriverInputs } from './DriverInputs';
import { InfoTooltip } from './InfoTooltip';
import { parseFrd } from '../io/frd';
import { parseZma } from '../io/zma';
import type { CoaxialDriverPreset } from '../presets/drivers_db';
import type { WayDesign, DriverParams, OffAxisMeasurement } from '../types';

/** Infer off-axis angle in degrees from a filename (e.g., "woofer_30deg.frd" -> 30). */
function parseAngleFromFilename(filename: string, fallbackAngle: number): number {
  const base = filename.replace(/\.[^.]+$/, '');
  const match = base.match(/(?:^|[_\-\s(])(0|5|10|15|20|25|30|35|40|45|50|55|60|65|70|75|80|85|90)\s*(?:deg|°|d)?(?:$|[_\-\s.)])/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return fallbackAngle;
}

interface WayEditorProps {
  way: WayDesign;
  onUpdate: (updates: Partial<WayDesign>) => void;
  onApplyCoaxial2Way?: (coax: CoaxialDriverPreset) => void;
}

export function WayEditor({ way, onUpdate, onApplyCoaxial2Way }: WayEditorProps) {
  const handleFrd = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    Promise.all(files.map(async (f) => ({ name: f.name, frd: parseFrd(await f.text()) }))).then((parsed) => {
      if (parsed.length === 1) {
        const { frd } = parsed[0];
        onUpdate({
          measured: {
            frequencies_hz: frd.frequencies,
            spl_db: frd.spl_db,
            phase_deg: frd.phase_deg,
            impedance_ohm: way.measured?.impedance_ohm ?? [],
            impedance_phase_deg: way.measured?.impedance_phase_deg ?? [],
            simulate_enclosure: way.measured?.simulate_enclosure ?? false,
            off_axis: way.measured?.off_axis ?? [],
          },
        });
      } else {
        // Multi-file selection: sort by inferred angle, 0° (lowest) becomes on-axis, others become off_axis
        const withAngles = parsed
          .map((item, idx) => ({
            ...item,
            angle: parseAngleFromFilename(item.name, idx * 15),
          }))
          .sort((a, b) => a.angle - b.angle);

        const primary = withAngles[0];
        const existingOffAxis = way.measured?.off_axis ?? [];
        const newOffAxis: OffAxisMeasurement[] = [...existingOffAxis];

        for (let i = 1; i < withAngles.length; i++) {
          const item = withAngles[i];
          const angle = item.angle === 0 ? i * 15 : item.angle;
          const idx = newOffAxis.findIndex((o) => o.angle_deg === angle);
          const entry: OffAxisMeasurement = {
            angle_deg: angle,
            label: `${angle}° (${item.name})`,
            frequencies_hz: item.frd.frequencies,
            spl_db: item.frd.spl_db,
            phase_deg: item.frd.phase_deg,
          };
          if (idx >= 0) newOffAxis[idx] = entry;
          else newOffAxis.push(entry);
        }
        newOffAxis.sort((a, b) => a.angle_deg - b.angle_deg);

        onUpdate({
          measured: {
            frequencies_hz: primary.frd.frequencies,
            spl_db: primary.frd.spl_db,
            phase_deg: primary.frd.phase_deg,
            impedance_ohm: way.measured?.impedance_ohm ?? [],
            impedance_phase_deg: way.measured?.impedance_phase_deg ?? [],
            simulate_enclosure: way.measured?.simulate_enclosure ?? false,
            off_axis: newOffAxis,
          },
        });
      }
    });
    e.target.value = '';
  }, [way.measured, onUpdate]);

  const handleOffAxisFrd = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !way.measured) return;

    Promise.all(files.map(async (f) => ({ name: f.name, frd: parseFrd(await f.text()) }))).then((parsed) => {
      const existing = [...(way.measured?.off_axis ?? [])];
      const usedAngles = new Set(existing.map((o) => o.angle_deg));
      const standardAngles = [15, 30, 45, 60, 75, 90];

      for (const item of parsed) {
        const nextDefault = standardAngles.find((a) => !usedAngles.has(a)) ?? ((existing.length + 1) * 15);
        const angle = parseAngleFromFilename(item.name, nextDefault);
        usedAngles.add(angle);
        const entry: OffAxisMeasurement = {
          angle_deg: angle,
          label: `${angle}° (${item.name})`,
          frequencies_hz: item.frd.frequencies,
          spl_db: item.frd.spl_db,
          phase_deg: item.frd.phase_deg,
        };
        const existingIdx = existing.findIndex((o) => o.angle_deg === angle);
        if (existingIdx >= 0) existing[existingIdx] = entry;
        else existing.push(entry);
      }
      existing.sort((a, b) => a.angle_deg - b.angle_deg);

      onUpdate({
        measured: {
          ...way.measured!,
          off_axis: existing,
        },
      });
    });
    e.target.value = '';
  }, [way.measured, onUpdate]);

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
          simulate_enclosure: way.measured?.simulate_enclosure ?? false,
          off_axis: way.measured?.off_axis ?? [],
        }
      });
    });
    e.target.value = '';
  }, [way.measured, onUpdate]);

  return (
    <>
      <PresetSelector
        onSelect={(driver: DriverParams, name: string) => onUpdate({ driver, preset_name: name })}
        onApplyCoaxial2Way={onApplyCoaxial2Way}
        currentName={way.preset_name}
        currentDriver={way.driver}
      />
      <DriverInputs params={way.driver} onChange={(d) => onUpdate({ driver: d })} />

      {/* FRD/ZMA import — supports multi-angle FRD & optional hybrid enclosure simulation */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, alignItems: 'center' }}>
        <label
          className="graf-btn graf-btn-sm graf-btn-outline"
          style={{ cursor: 'pointer', fontSize: 11 }}
          title="Import 0° On-Axis FRD (or select multiple angle FRD files at once: 0°, 15°, 30°, 45°, 60°)"
        >
          Import FRD
          <input type="file" accept=".frd,.txt" multiple hidden onChange={handleFrd} />
        </label>
        {way.measured && way.measured.spl_db.length > 0 && (
          <label
            className="graf-btn graf-btn-sm graf-btn-outline"
            style={{ cursor: 'pointer', fontSize: 11 }}
            title="Add off-axis angular measurements (e.g. 15°, 30°, 45°, 60° FRD files) for this driver"
          >
            + Off-Axis FRD
            <input type="file" accept=".frd,.txt" multiple hidden onChange={handleOffAxisFrd} />
          </label>
        )}
        <label className="graf-btn graf-btn-sm graf-btn-outline" style={{ cursor: 'pointer', fontSize: 11 }}>
          Import ZMA
          <input type="file" accept=".zma,.txt" hidden onChange={handleZma} />
        </label>
        <InfoTooltip variant="section" docKey="section:frd-zma" />
        {way.measured && (
          <button className="graf-btn graf-btn-sm" style={{ fontSize: 11 }}
            onClick={() => onUpdate({ measured: undefined })}
            title="Remove measured data and revert to T/S simulation">
            Clear FRD/ZMA
          </button>
        )}
      </div>
      {way.measured && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--graf-warm-600)',
            marginTop: 4,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 4,
            padding: '5px 6px',
          }}
        >
          <div>
            FRD (0°): {way.measured.spl_db.length > 0 ? `${way.measured.spl_db.length} points` : 'none'}
            {' | '}
            ZMA: {way.measured.impedance_ohm.length > 0 ? `${way.measured.impedance_ohm.length} points` : 'none'}
            {way.measured.simulate_enclosure
              ? ' — Hybrid FRD + Enclosure Simulation active'
              : ' — Using measured data (T/S simulation bypassed)'}
          </div>

          {/* Toggle hybrid enclosure simulation with measured FRD */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 4,
              cursor: 'pointer',
              color: '#1e3a8a',
              fontWeight: 600,
            }}
            title="Apply the simulated Enclosure (Sealed/Ported/PR) low-frequency transfer function to the measured FRD response"
          >
            <input
              type="checkbox"
              checked={!!way.measured.simulate_enclosure}
              onChange={(e) =>
                onUpdate({
                  measured: {
                    ...way.measured!,
                    simulate_enclosure: e.target.checked,
                  },
                })
              }
            />
            <span>Simulate Enclosure with Measured FRD (unlock box & port tuning)</span>
          </label>

          {/* Off-axis angular FRD list */}
          {way.measured.off_axis && way.measured.off_axis.length > 0 && (
            <div style={{ marginTop: 5, borderTop: '1px solid #e2e8f0', paddingTop: 4 }}>
              <div style={{ fontWeight: 600, color: '#334155', marginBottom: 3 }}>
                Off-Axis Measurements ({way.measured.off_axis.length} angles):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {way.measured.off_axis.map((oa, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 3,
                      padding: '1px 5px',
                    }}
                  >
                    <input
                      type="number"
                      min={5}
                      max={180}
                      step={5}
                      value={oa.angle_deg}
                      title="Off-axis measurement angle in degrees"
                      style={{
                        width: 38,
                        fontSize: 10,
                        border: 'none',
                        padding: 0,
                        fontWeight: 600,
                        color: '#0f172a',
                      }}
                      onChange={(e) => {
                        const deg = Math.max(1, Math.min(180, parseInt(e.target.value, 10) || oa.angle_deg));
                        const updated = [...(way.measured?.off_axis ?? [])];
                        updated[idx] = { ...oa, angle_deg: deg };
                        onUpdate({
                          measured: {
                            ...way.measured!,
                            off_axis: updated,
                          },
                        });
                      }}
                    />
                    <span>° ({oa.spl_db.length}pt)</span>
                    <button
                      type="button"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: 10,
                        padding: 0,
                      }}
                      title={`Remove ${oa.angle_deg}° off-axis FRD`}
                      onClick={() => {
                        const updated = (way.measured?.off_axis ?? []).filter((_, j) => j !== idx);
                        onUpdate({
                          measured: {
                            ...way.measured!,
                            off_axis: updated,
                          },
                        });
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
