import { CrossoverPointsEditor } from './CrossoverPointsEditor';
import { PerWayEqEditor } from './PerWayEqEditor';
import { PassiveWizard } from './PassiveWizard';
import { NumericInput } from './NumericInput';
import { InfoTooltip } from './InfoTooltip';
import {
  deriveDriverMetrics,
  populatePassiveFiltersFromPoints,
  computeBaffleStepParams,
} from '../compute';
import type {
  DesignState,
  WayDesign,
  CrossoverPoint,
  ActiveFilter,
  CrossoverMode,
} from '../types';

interface CrossoverPanelProps {
  design: DesignState;
  activeWay: number;
  onUpdatePoints: (points: CrossoverPoint[]) => void;
  onUpdateEq: (wayIndex: number, eq: ActiveFilter[]) => void;
  onUpdateWay: (wayIndex: number, updates: Partial<WayDesign>) => void;
  onUpdateDesign?: (updates: Partial<DesignState>) => void;
}

export function CrossoverPanel({
  design,
  activeWay,
  onUpdatePoints,
  onUpdateEq,
  onUpdateWay,
  onUpdateDesign,
}: CrossoverPanelProps) {
  const way = design.ways[activeWay];
  const isMultiWay = design.ways.length > 1;
  const mode: CrossoverMode = design.crossover_mode ?? 'active';

  // Find crossover freq for this way (for passive wizard default)
  const crossoverFreq =
    design.crossover_points.find(
      (pt) => pt.low_way_index === activeWay || pt.high_way_index === activeWay
    )?.freq_hz ?? 2500;

  const refSens = design.ways[0]
    ? deriveDriverMetrics(design.ways[0].driver).sensitivity_2v83_db
    : 87;
  const wayMetrics = deriveDriverMetrics(way.driver);
  const baffleWidthCm = design.cabinet?.width_cm ?? 22;
  const bsc = computeBaffleStepParams(baffleWidthCm, way.driver.re_ohm, 4.5);

  const handleModeChange = (nextMode: CrossoverMode) => {
    if (!onUpdateDesign) return;
    if (nextMode === 'passive') {
      // If switching to Passive RLC and ways have no passive filters yet, synthesize them from shared crossover_points + driver Re/Le/Sensitivity
      const hasAnyPassive = design.ways.some((w) => w.passive_filters.length > 0);
      if (!hasAnyPassive && design.crossover_points.length > 0) {
        const synthesizedWays = populatePassiveFiltersFromPoints(
          design.ways,
          design.crossover_points,
          { includeZobel: true, includeLPad: true }
        );
        onUpdateDesign({ crossover_mode: nextMode, ways: synthesizedWays });
        return;
      }
    }
    onUpdateDesign({ crossover_mode: nextMode });
  };

  const handleSynthesizePassive = () => {
    if (!onUpdateDesign) return;
    const synthesizedWays = populatePassiveFiltersFromPoints(
      design.ways,
      design.crossover_points,
      { includeZobel: true, includeLPad: true }
    );
    onUpdateDesign({
      crossover_mode: 'passive',
      ways: synthesizedWays,
    });
  };

  return (
    <>
      {/* Explicit Crossover Mode Selector */}
      <div className="section-card" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div className="section-title" style={{ margin: 0 }}>
            Crossover Architecture
            <InfoTooltip variant="section" docKey="section:crossover-mode" />
          </div>
        </div>
        <div className="btn-row" style={{ marginBottom: 6 }}>
          {(
            [
              { id: 'active', label: 'Active DSP', tip: 'Ideal DSP / biquad crossover filters before each amplifier channel (passive RLC ladder bypassed)' },
              { id: 'passive', label: 'Passive RLC', tip: 'Physical inductor/capacitor/resistor ladder between amplifier and driver (uses real complex driver Z(f))' },
              { id: 'hybrid', label: 'Hybrid', tip: 'Combines active DSP crossover/EQ with passive RLC components' },
            ] as { id: CrossoverMode; label: string; tip: string }[]
          ).map((m) => (
            <button
              key={m.id}
              className={`graf-btn graf-btn-sm ${mode === m.id ? 'graf-btn-primary' : 'graf-btn-outline'}`}
              title={m.tip}
              onClick={() => handleModeChange(m.id)}
              data-testid={`crossover-mode-${m.id}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Shared Driver & Baffle Summary Banner */}
        <div
          style={{
            fontSize: 10,
            color: '#475569',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 4,
            padding: '4px 6px',
            lineHeight: 1.4,
          }}
        >
          <strong>Shared from {way.name} & Cabinet:</strong> Re={way.driver.re_ohm}Ω · Le=
          {(way.driver.le_h * 1000).toFixed(2)}mH · Fs={way.driver.fs_hz}Hz · Sens=
          {wayMetrics.sensitivity_2v83_db.toFixed(1)}dB · Min safe HP ≥{' '}
          <strong>{wayMetrics.min_safe_xo_hz}Hz</strong> · Baffle W={baffleWidthCm}cm (f_bsc=
          {bsc.f_bsc_hz}Hz)
        </div>

        {isMultiWay && onUpdateDesign && (
          <button
            className="graf-btn graf-btn-sm graf-btn-outline"
            style={{ width: '100%', marginTop: 6, fontSize: 11 }}
            title="Synthesize passive L/C/R ladder + Zobel + L-Pad on all ways from the Crossover Points and shared driver parameters"
            onClick={handleSynthesizePassive}
          >
            ⚡ Auto-Build Passive RLC from Crossover Points
          </button>
        )}
      </div>

      {/* System-level crossover points */}
      <CrossoverPointsEditor
        points={design.crossover_points}
        ways={design.ways}
        onChange={onUpdatePoints}
        onToggleWayInvert={(wayIdx) => {
          const targetWay = design.ways[wayIdx];
          if (targetWay) {
            onUpdateWay(wayIdx, { inverted: !targetWay.inverted });
          }
        }}
      />

      {/* Per-way controls */}
      {isMultiWay && (
        <>
          <div className="section-subtitle" style={{ marginTop: 8, marginBottom: 4 }}>
            {way.name} Alignment & Level
            <InfoTooltip variant="section" docKey="section:driver-alignment" />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
            <label title="Enable/disable this way" style={{ fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={way.enabled}
                onChange={(e) => onUpdateWay(activeWay, { enabled: e.target.checked })}
              />{' '}
              On
            </label>
            <label title="Invert polarity (180deg phase flip)" style={{ fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={way.inverted}
                onChange={(e) => onUpdateWay(activeWay, { inverted: e.target.checked })}
              />{' '}
              Inv
            </label>
            {activeWay > 0 && mode !== 'passive' && (
              <button
                type="button"
                className="graf-btn graf-btn-sm graf-btn-outline"
                style={{ fontSize: 10, padding: '1px 5px' }}
                title={`Match ${way.name} active gain to primary Woofer sensitivity (${refSens.toFixed(1)} dB vs ${wayMetrics.sensitivity_2v83_db.toFixed(1)} dB)`}
                onClick={() =>
                  onUpdateWay(activeWay, {
                    gain_db: Number((refSens - wayMetrics.sensitivity_2v83_db).toFixed(1)),
                  })
                }
              >
                Match Level ({Number((refSens - wayMetrics.sensitivity_2v83_db).toFixed(1))} dB)
              </button>
            )}
            <button
              type="button"
              className="graf-btn graf-btn-sm graf-btn-outline"
              style={{ fontSize: 10, padding: '1px 5px' }}
              title={`Convert physical acoustic center depth difference into DSP time alignment delay (c = 343.2 m/s → 29.1 µs/cm)`}
              onClick={() => {
                const maxZ = Math.max(...design.ways.map((w) => w.z_offset_m));
                const relativeDepthM = Math.max(0, maxZ - way.z_offset_m);
                const delayS =
                  relativeDepthM > 0
                    ? Number((relativeDepthM / 343.21).toPrecision(4))
                    : Number((Math.abs(way.z_offset_m) / 343.21).toPrecision(4));
                onUpdateWay(activeWay, { delay_s: delayS });
              }}
            >
              Sync Delay from Z
            </button>
          </div>
          <NumericInput
            label="Gain"
            value={way.gain_db}
            step={0.5}
            min={-20}
            max={20}
            unit="dB"
            tooltip="Per-way active level adjustment."
            onChange={(v) => onUpdateWay(activeWay, { gain_db: v })}
          />
          <NumericInput
            label="Delay"
            value={Number((way.delay_s * 1e6).toFixed(1))}
            step={10}
            min={0}
            unit="us"
            tooltip="Per-way time delay. 29 us = 1 cm."
            onChange={(v) => onUpdateWay(activeWay, { delay_s: v / 1e6 })}
          />
          <NumericInput
            label="Z offset"
            value={Number((way.z_offset_m * 100).toFixed(2))}
            step={0.5}
            min={-20}
            max={20}
            unit="cm"
            tooltip="Physical depth offset of acoustic center relative to baffle reference plane. Positive = recessed."
            onChange={(v) => onUpdateWay(activeWay, { z_offset_m: v / 100 })}
          />
        </>
      )}

      {/* Per-way Active EQ (shown in Active and Hybrid modes, or when EQ filters exist) */}
      {(mode !== 'passive' || (design.per_way_eq[activeWay]?.length ?? 0) > 0) && (
        <PerWayEqEditor
          filters={design.per_way_eq[activeWay] ?? []}
          onChange={(eq) => onUpdateEq(activeWay, eq)}
          driver={way.driver}
          enclosure={way.enclosure}
        />
      )}

      {/* Passive crossover wizard & RLC ladder editor */}
      <PassiveWizard
        crossoverFreq={crossoverFreq}
        driverRe={way.driver.re_ohm}
        driverLe={way.driver.le_h}
        driver={way.driver}
        baffleWidthCm={baffleWidthCm}
        referenceSensitivityDb={refSens}
        passiveFilters={way.passive_filters}
        onApply={(filters) => {
          onUpdateWay(activeWay, { passive_filters: filters });
        }}
      />
    </>
  );
}
