import { CrossoverPointsEditor } from './CrossoverPointsEditor';
import { PerWayEqEditor } from './PerWayEqEditor';
import { PassiveWizard } from './PassiveWizard';
import { NumericInput } from './NumericInput';
import type { DesignStateV2, WayDesign, CrossoverPoint, ActiveFilter } from '../types';

interface CrossoverPanelProps {
  design: DesignStateV2;
  activeWay: number;
  onUpdatePoints: (points: CrossoverPoint[]) => void;
  onUpdateEq: (wayIndex: number, eq: ActiveFilter[]) => void;
  onUpdateWay: (wayIndex: number, updates: Partial<WayDesign>) => void;
}

export function CrossoverPanel({ design, activeWay, onUpdatePoints, onUpdateEq, onUpdateWay }: CrossoverPanelProps) {
  const way = design.ways[activeWay];
  const isMultiWay = design.ways.length > 1;

  // Find crossover freq for this way (for passive wizard default)
  const crossoverFreq = design.crossover_points.find(
    pt => pt.low_way_index === activeWay || pt.high_way_index === activeWay
  )?.freq_hz ?? 3000;

  return (
    <>
      {/* System-level crossover points */}
      <CrossoverPointsEditor
        points={design.crossover_points}
        ways={design.ways}
        onChange={onUpdatePoints}
      />

      {/* Per-way controls */}
      {isMultiWay && (
        <>
          <div className="section-subtitle" style={{ marginTop: 8, marginBottom: 4 }}>
            {way.name} Controls
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
            <label title="Enable/disable this way" style={{ fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={way.enabled}
                onChange={(e) => onUpdateWay(activeWay, { enabled: e.target.checked })} /> On
            </label>
            <label title="Invert polarity (180deg phase flip)" style={{ fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={way.inverted}
                onChange={(e) => onUpdateWay(activeWay, { inverted: e.target.checked })} /> Inv
            </label>
          </div>
          <NumericInput label="Gain" value={way.gain_db} step={0.5} min={-20} max={20} unit="dB"
            tooltip="Per-way level adjustment."
            onChange={(v) => onUpdateWay(activeWay, { gain_db: v })} />
          <NumericInput label="Delay" value={way.delay_s * 1e6} step={10} min={0} unit="us"
            tooltip="Per-way time delay. 29 us = 1 cm."
            onChange={(v) => onUpdateWay(activeWay, { delay_s: v / 1e6 })} />
          <NumericInput label="Z offset" value={way.z_offset_m * 100} step={0.5} min={-20} max={20} unit="cm"
            tooltip="Physical depth offset. Positive = recessed."
            onChange={(v) => onUpdateWay(activeWay, { z_offset_m: v / 100 })} />
        </>
      )}

      {/* Per-way EQ */}
      <PerWayEqEditor
        filters={design.per_way_eq[activeWay] ?? []}
        onChange={(eq) => onUpdateEq(activeWay, eq)}
      />

      {/* Passive crossover wizard */}
      <PassiveWizard
        crossoverFreq={crossoverFreq}
        driverRe={way.driver.re_ohm}
        driverLe={way.driver.le_h}
        passiveFilters={way.passive_filters}
        onApply={(filters) => onUpdateWay(activeWay, { passive_filters: filters })}
      />
    </>
  );
}
