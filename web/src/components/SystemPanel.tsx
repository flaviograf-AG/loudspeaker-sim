import { NumericInput } from './NumericInput';
import { OptimizerPanel } from './OptimizerPanel';
import { SaveLoad } from './SaveLoad';
import { ExportControls } from './ExportControls';
import { BiquadExport } from './BiquadExport';
import { ImportOverlay, type OverlayData } from './ImportOverlay';
import { extractCrossoverPoints } from '../crossover';
import { encodeDesignUrl } from '../hooks/useUrlSync';
import type { DesignState, SystemInput, SimulationResult, SystemResult } from '../types';

interface SystemPanelProps {
  design: DesignState;
  solverInput: SystemInput;
  singleResult: SimulationResult | null;
  systemResult: SystemResult | null;
  isMultiWay: boolean;
  onUpdateDesign: (updates: Partial<DesignState>) => void;
  onSetDesign: (design: DesignState) => void;
  overlay: OverlayData;
  onSetOverlay: (o: OverlayData) => void;
  snapshots: { name: string; spl: number[]; freqs: number[] }[];
  onSetSnapshots: (s: { name: string; spl: number[]; freqs: number[] }[]) => void;
  designUndo: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean };
}

export function SystemPanel({
  design, solverInput, singleResult, systemResult, isMultiWay,
  onUpdateDesign, onSetDesign, overlay, onSetOverlay,
  snapshots, onSetSnapshots, designUndo,
}: SystemPanelProps) {
  return (
    <>
      {/* Frequency range */}
      <div className="section-card">
        <div className="section-title">Simulation</div>
        <NumericInput label="Drive" value={design.drive_voltage_rms} step={0.1} min={0.1} unit="V rms"
          tooltip="Amplifier drive voltage (RMS). 2.83V = 1W into 8ohm."
          onChange={(v) => onUpdateDesign({ drive_voltage_rms: v })} />
        <NumericInput label="F start" value={design.freq_start_hz} step={1} min={1} unit="Hz"
          tooltip="Sweep start frequency."
          onChange={(v) => onUpdateDesign({ freq_start_hz: v })} />
        <NumericInput label="F end" value={design.freq_end_hz} step={1000} min={100} unit="Hz"
          tooltip="Sweep end frequency."
          onChange={(v) => onUpdateDesign({ freq_end_hz: v })} />
        <NumericInput label="Points" value={design.freq_points} step={100} min={50} max={2000}
          tooltip="Frequency points."
          onChange={(v) => onUpdateDesign({ freq_points: Math.round(v) })} />
      </div>

      {/* Optimizer */}
      {isMultiWay && (
        <OptimizerPanel
          ways={solverInput.ways}
          sysParams={{
            freq_start_hz: design.freq_start_hz,
            freq_end_hz: design.freq_end_hz,
            freq_points: design.freq_points,
            drive_voltage_rms: design.drive_voltage_rms,
          }}
          onApply={(newWays) => {
            // Optimizer returns assembled active_filters — decompose back to crossover + EQ
            const { points, perWayEq } = extractCrossoverPoints(newWays);
            onSetDesign({
              ...design,
              ways: design.ways.map((w, i) => ({
                ...w,
                gain_db: newWays[i].gain_db,
                delay_s: newWays[i].delay_s,
                passive_filters: newWays[i].passive_filters,
              })),
              crossover_points: points,
              per_way_eq: perWayEq,
            });
          }}
        />
      )}

      {/* Save/Load */}
      <SaveLoad design={design} onLoad={onSetDesign} />

      {/* Export */}
      {!isMultiWay && <ExportControls result={singleResult} />}
      {isMultiWay && (
        <div className="section-card">
          <div className="section-title">Export</div>
          <div className="btn-row">
            <BiquadExport ways={solverInput.ways} />
          </div>
        </div>
      )}

      {/* Import Overlay */}
      <ImportOverlay overlay={overlay} onChange={onSetOverlay} />

      {/* Compare: Snapshot, Undo, Redo, Share */}
      <div className="section-card">
        <div className="section-title">Compare</div>
        <div className="btn-row">
          <button className="graf-btn graf-btn-sm graf-btn-outline"
            title="Save current SPL curve as a comparison snapshot"
            onClick={() => {
              const result = isMultiWay ? systemResult : singleResult;
              if (result) {
                const freqs = 'frequencies_hz' in result ? result.frequencies_hz : [];
                const spl = 'system_spl_db' in result ? result.system_spl_db : ('spl_db' in result ? result.spl_db : []);
                const name = `Snap ${snapshots.length + 1}`;
                onSetSnapshots([...snapshots, { name, spl: [...spl], freqs: [...freqs] }]);
              }
            }}>Snapshot</button>
          {snapshots.length > 0 && (
            <button className="graf-btn graf-btn-sm" style={{ color: 'var(--graf-danger)' }}
              onClick={() => onSetSnapshots([])}>Clear</button>
          )}
          <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={designUndo.undo}
            disabled={!designUndo.canUndo} title="Undo (Ctrl+Z)">Undo</button>
          <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={designUndo.redo}
            disabled={!designUndo.canRedo} title="Redo (Ctrl+Y)">Redo</button>
          <button className="graf-btn graf-btn-sm graf-btn-outline"
            title="Copy shareable URL to clipboard"
            onClick={() => {
              try {
                navigator.clipboard.writeText(encodeDesignUrl(design));
              } catch { /* ignore */ }
            }}>Share</button>
        </div>
        {snapshots.map((s, i) => (
          <div key={`snap-${s.name}-${i}`} style={{ fontSize: 11, color: 'var(--graf-warm-500)' }}>
            {s.name}
            <button className="graf-btn graf-btn-sm" style={{ padding: '0 3px', fontSize: 9, marginLeft: 4 }}
              onClick={() => onSetSnapshots(snapshots.filter((_, j) => j !== i))}>x</button>
          </div>
        ))}
      </div>
    </>
  );
}
