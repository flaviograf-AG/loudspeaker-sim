import { deriveDriverMetrics, computeBaffleStepParams, computeGoldenCabinetDimensions, populatePassiveFiltersFromPoints } from '../compute';
import type { DesignState, CrossoverMode } from '../types';

export type WorkspaceTab = 'workbench' | 'enclosure' | 'crossover';

interface SharedSystemBarProps {
  design: DesignState;
  activeWay: number;
  workspaceTab: WorkspaceTab;
  onSelectWay: (idx: number) => void;
  onSelectWorkspaceTab: (tab: WorkspaceTab) => void;
  onUpdateDesign: (updates: Partial<DesignState>) => void;
  onSetDesign: (design: DesignState) => void;
  onOpenSetupWizard: () => void;
}

/** Curated reference speaker system designs sourcing real-world drivers */
export const REFERENCE_SYSTEM_TEMPLATES: { id: string; label: string; build: () => DesignState }[] = [
  {
    id: '2way-passive-bookshelf',
    label: '2-Way Passive Bookshelf (SB17 + SEAS 27TDFC)',
    build: () => {
      const ways = [
        {
          name: 'Woofer',
          preset_name: 'SB Acoustics SB17NRX2C35-8 (6.5")',
          driver: { fs_hz: 37, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5, vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3 },
          enclosure: {
            type: 'Vented' as const,
            volume_m3: 18e-3,
            port_area_m2: 19.6e-4,
            port_length_m: 0.16,
            num_ports: 1,
            port_flanged: true,
            ql: 7,
            port_shape: { type: 'Circular' as const },
          },
          passive_filters: [],
          gain_db: 0,
          delay_s: 0,
          inverted: false,
          z_offset_m: 0.015,
          enabled: true,
        },
        {
          name: 'Tweeter',
          preset_name: 'SEAS 27TDFC (1" Dome)',
          driver: { fs_hz: 800, re_ohm: 5.5, le_h: 0.05e-3, qes: 0.5, qms: 2.0, vas_m3: 0.5e-3, sd_m2: 8e-4, xmax_m: 1e-3 },
          enclosure: { type: 'Sealed' as const, volume_m3: 0.5e-3, ql: 7 },
          passive_filters: [],
          gain_db: 0,
          delay_s: 0,
          inverted: false,
          z_offset_m: 0,
          enabled: true,
        },
      ];
      const points = [{ freq_hz: 2200, slope: 'BW2' as const, low_way_index: 0, high_way_index: 1 }];
      const passiveWays = populatePassiveFiltersFromPoints(ways, points, { includeZobel: true, includeLPad: true });
      return {
        version: 2,
        topology: '2-way',
        crossover_mode: 'passive',
        cabinet: computeGoldenCabinetDimensions(18, 18, 0.8, 0.6),
        ways: passiveWays,
        crossover_points: points,
        per_way_eq: [[], []],
        freq_start_hz: 20,
        freq_end_hz: 20000,
        freq_points: 300,
        drive_voltage_rms: 2.83,
        source_impedance_ohm: 0.2,
      };
    },
  },
  {
    id: '2way-active-monitor',
    label: '2-Way Active DSP Studio Monitor (LR4 @ 2.5 kHz)',
    build: () => ({
      version: 2,
      topology: '2-way',
      crossover_mode: 'active',
      cabinet: computeGoldenCabinetDimensions(18, 18, 0.8, 0.5),
      ways: [
        {
          name: 'Woofer',
          preset_name: 'SB Acoustics SB17NRX2C35-8 (6.5")',
          driver: { fs_hz: 37, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5, vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3 },
          enclosure: { type: 'Sealed', volume_m3: 18e-3, ql: 7 },
          passive_filters: [],
          gain_db: 0,
          delay_s: 0,
          inverted: false,
          z_offset_m: 0,
          enabled: true,
        },
        {
          name: 'Tweeter',
          preset_name: 'SEAS 27TDFC (1" Dome)',
          driver: { fs_hz: 800, re_ohm: 5.5, le_h: 0.05e-3, qes: 0.5, qms: 2.0, vas_m3: 0.5e-3, sd_m2: 8e-4, xmax_m: 1e-3 },
          enclosure: { type: 'Sealed', volume_m3: 0.5e-3, ql: 7 },
          passive_filters: [],
          gain_db: -3.5,
          delay_s: 0,
          inverted: false,
          z_offset_m: 0,
          enabled: true,
        },
      ],
      crossover_points: [{ freq_hz: 2500, slope: 'LR4', low_way_index: 0, high_way_index: 1 }],
      per_way_eq: [[], []],
      freq_start_hz: 20,
      freq_end_hz: 20000,
      freq_points: 300,
      drive_voltage_rms: 2.83,
      source_impedance_ohm: 0.1,
    }),
  },
  {
    id: '3way-tower',
    label: '3-Way Floorstander (10" Vented + 5" Mid + 1" Tweeter)',
    build: () => ({
      version: 2,
      topology: '3-way',
      crossover_mode: 'active',
      cabinet: computeGoldenCabinetDimensions(48, 22, 2.0, 1.2),
      ways: [
        {
          name: 'Woofer',
          preset_name: 'Scan-Speak 26W/8534G00 (10" Woofer)',
          driver: { fs_hz: 23, re_ohm: 5.8, le_h: 0.6e-3, qes: 0.34, qms: 4.8, vas_m3: 135e-3, sd_m2: 350e-4, xmax_m: 9e-3 },
          enclosure: {
            type: 'Vented',
            volume_m3: 48e-3,
            port_area_m2: 45e-4,
            port_length_m: 0.24,
            num_ports: 1,
            port_flanged: true,
            ql: 7,
            port_shape: { type: 'Circular' },
          },
          passive_filters: [],
          gain_db: 0,
          delay_s: 0,
          inverted: false,
          z_offset_m: 0,
          enabled: true,
        },
        {
          name: 'Midrange',
          preset_name: 'Dayton RS125-8 (5" Midrange)',
          driver: { fs_hz: 70, re_ohm: 6.2, le_h: 0.35e-3, qes: 0.52, qms: 3.2, vas_m3: 5.5e-3, sd_m2: 78e-4, xmax_m: 4e-3 },
          enclosure: { type: 'Sealed', volume_m3: 4.5e-3, ql: 7 },
          passive_filters: [],
          gain_db: 0,
          delay_s: 0,
          inverted: false,
          z_offset_m: 0,
          enabled: true,
        },
        {
          name: 'Tweeter',
          preset_name: 'SEAS 27TDFC (1" Dome)',
          driver: { fs_hz: 800, re_ohm: 5.5, le_h: 0.05e-3, qes: 0.5, qms: 2.0, vas_m3: 0.5e-3, sd_m2: 8e-4, xmax_m: 1e-3 },
          enclosure: { type: 'Sealed', volume_m3: 0.5e-3, ql: 7 },
          passive_filters: [],
          gain_db: -3.0,
          delay_s: 0,
          inverted: false,
          z_offset_m: 0,
          enabled: true,
        },
      ],
      crossover_points: [
        { freq_hz: 380, slope: 'LR4', low_way_index: 0, high_way_index: 1 },
        { freq_hz: 2800, slope: 'LR4', low_way_index: 1, high_way_index: 2 },
      ],
      per_way_eq: [[], [], []],
      freq_start_hz: 20,
      freq_end_hz: 20000,
      freq_points: 300,
      drive_voltage_rms: 2.83,
      source_impedance_ohm: 0.2,
    }),
  },
  {
    id: '1way-tl',
    label: '1-Way Quarter-Wave Transmission Line (6.5" Full-Range)',
    build: () => ({
      version: 2,
      topology: '1-way',
      crossover_mode: 'active',
      cabinet: computeGoldenCabinetDimensions(34, 18, 1.2, 0.5),
      ways: [
        {
          name: 'Full-Range',
          preset_name: 'SB Acoustics SB17NRX2C35-8 (6.5")',
          driver: { fs_hz: 37, re_ohm: 6.5, le_h: 0.2e-3, qes: 0.42, qms: 3.5, vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3 },
          enclosure: {
            type: 'TransmissionLine',
            length_m: 2.1,
            area_driver_m2: 180e-4,
            area_mouth_m2: 140e-4,
            num_segments: 24,
            stuffing_density_kg_m3: 8,
            flow_resistivity_pa_s_m2: 6000,
            open_end: true,
            driver_position: 0.25,
            taper_profile: { type: 'Straight' },
            stuffing_zones: [],
            mouth_termination: { type: 'Flush' },
            num_folds: 2,
          },
          passive_filters: [],
          gain_db: 0,
          delay_s: 0,
          inverted: false,
          z_offset_m: 0,
          enabled: true,
        },
      ],
      crossover_points: [],
      per_way_eq: [[]],
      freq_start_hz: 20,
      freq_end_hz: 20000,
      freq_points: 300,
      drive_voltage_rms: 2.83,
      source_impedance_ohm: 0.2,
    }),
  },
];

export function SharedSystemBar({
  design,
  activeWay,
  workspaceTab,
  onSelectWay,
  onSelectWorkspaceTab,
  onUpdateDesign,
  onSetDesign,
  onOpenSetupWizard,
}: SharedSystemBarProps) {
  const mode: CrossoverMode = design.crossover_mode ?? 'active';
  const baffleW = design.cabinet?.width_cm ?? 22;
  const primaryRe = design.ways[0]?.driver.re_ohm ?? 8;
  const bsc = computeBaffleStepParams(baffleW, primaryRe, 4.5);

  // Build actionable Design Advisor suggestions
  const advisorItems: { id: string; severity: 'warn' | 'tip'; message: string; actionLabel: string; onFix: () => void }[] = [];
  const wooferMetrics = design.ways[0] ? deriveDriverMetrics(design.ways[0].driver) : null;

  design.crossover_points.forEach((pt, ptIdx) => {
    if (pt.high_way_index !== null) {
      const highWay = design.ways[pt.high_way_index];
      if (highWay) {
        const highMetrics = deriveDriverMetrics(highWay.driver);
        if (pt.freq_hz < highMetrics.min_safe_xo_hz) {
          advisorItems.push({
            id: `safe-xo-${ptIdx}`,
            severity: 'warn',
            message: `${highWay.name} crossover (${pt.freq_hz} Hz) is below 2×Fs (${highMetrics.min_safe_xo_hz} Hz) — risk of thermal/excursion distortion`,
            actionLabel: `Set XO to ${highMetrics.min_safe_xo_hz} Hz`,
            onFix: () => {
              const nextPts = [...design.crossover_points];
              nextPts[ptIdx] = { ...pt, freq_hz: highMetrics.min_safe_xo_hz };
              onUpdateDesign({ crossover_points: nextPts });
            },
          });
        }
      }
    }
  });

  if (design.ways.length > 1 && wooferMetrics) {
    design.ways.forEach((w, wIdx) => {
      const wm = deriveDriverMetrics(w.driver);
      if (wIdx === 0 && mode === 'passive' && w.driver.le_h >= 0.25e-3) {
        const hasZobel = w.passive_filters.some((pf) => pf.type === 'ZobelShunt');
        if (!hasZobel && w.passive_filters.length > 0) {
          advisorItems.push({
            id: `zobel-${wIdx}`,
            severity: 'tip',
            message: `${w.name} has Le=${(w.driver.le_h * 1000).toFixed(2)} mH without a Zobel network — rising impedance may skew passive LP rolloff`,
            actionLabel: `+ Add Zobel (${wm.zobel.r_ohm}Ω / ${wm.zobel.c_uf}µF)`,
            onFix: () => {
              const nextWays = design.ways.map((wayItem, idx) =>
                idx === wIdx
                  ? {
                      ...wayItem,
                      passive_filters: [
                        ...wayItem.passive_filters,
                        { type: 'ZobelShunt' as const, ohms: wm.zobel.r_ohm, farads: wm.zobel.c_farads },
                      ],
                    }
                  : wayItem
              );
              onUpdateDesign({ ways: nextWays });
            },
          });
        }
      }
      if (wIdx > 0) {
        const sensDelta = Number((wm.sensitivity_2v83_db - wooferMetrics.sensitivity_2v83_db).toFixed(1));
        if (mode === 'passive' && sensDelta > 1.5 && w.passive_filters.length > 0) {
          const hasLPad = w.passive_filters.some((pf) => pf.type === 'LPad');
          if (!hasLPad) {
            const ratio = Math.pow(10, sensDelta / 20);
            const rSer = Number(((w.driver.re_ohm * (ratio - 1)) / ratio).toFixed(2));
            const rShnt = Number(((w.driver.re_ohm * ratio) / (ratio - 1)).toFixed(2));
            advisorItems.push({
              id: `lpad-${wIdx}`,
              severity: 'warn',
              message: `${w.name} is +${sensDelta} dB louder than ${design.ways[0].name} without a passive L-Pad`,
              actionLabel: `+ Add -${sensDelta} dB L-Pad`,
              onFix: () => {
                const nextWays = design.ways.map((wayItem, idx) =>
                  idx === wIdx
                    ? {
                        ...wayItem,
                        passive_filters: [
                          ...wayItem.passive_filters,
                          { type: 'LPad' as const, series_ohms: rSer, shunt_ohms: rShnt },
                        ],
                      }
                    : wayItem
                );
                onUpdateDesign({ ways: nextWays });
              },
            });
          }
        } else if (mode === 'active' && sensDelta > 1.5 && Math.abs(w.gain_db) < 0.2) {
          advisorItems.push({
            id: `active-level-${wIdx}`,
            severity: 'tip',
            message: `${w.name} sensitivity is +${sensDelta} dB higher than ${design.ways[0].name}`,
            actionLabel: `Match Gain (-${sensDelta} dB)`,
            onFix: () => {
              const nextWays = design.ways.map((wayItem, idx) =>
                idx === wIdx ? { ...wayItem, gain_db: -sensDelta } : wayItem
              );
              onUpdateDesign({ ways: nextWays });
            },
          });
        }
      }
    });
  }

  return (
    <div
      data-testid="shared-system-bar"
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #cbd5e1',
        padding: '6px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Top Row: Workspace Mode Tabs + Reference Templates + Crossover Mode + Shared Baffle Info */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {(
            [
              { id: 'workbench', label: 'Unified Workbench' },
              { id: 'enclosure', label: 'Enclosure & Cabinet Studio' },
              { id: 'crossover', label: 'Crossover & Filter Lab' },
            ] as { id: WorkspaceTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              className={`graf-btn graf-btn-sm ${workspaceTab === t.id ? 'graf-btn-primary' : 'graf-btn-outline'}`}
              onClick={() => onSelectWorkspaceTab(t.id)}
              data-testid={`tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>XO Mode:</span>
          {(['active', 'passive', 'hybrid'] as CrossoverMode[]).map((m) => (
            <button
              key={m}
              className={`graf-btn graf-btn-sm ${mode === m ? 'graf-btn-primary' : 'graf-btn-outline'}`}
              style={{ fontSize: 10, padding: '2px 6px', textTransform: 'capitalize' }}
              onClick={() => {
                if (m === 'passive' && !design.ways.some(w => w.passive_filters.length > 0)) {
                  const passiveWays = populatePassiveFiltersFromPoints(design.ways, design.crossover_points, {
                    includeZobel: true,
                    includeLPad: true,
                  });
                  onUpdateDesign({ crossover_mode: m, ways: passiveWays });
                } else {
                  onUpdateDesign({ crossover_mode: m });
                }
              }}
            >
              {m === 'active' ? 'Active DSP' : m === 'passive' ? 'Passive RLC' : 'Hybrid'}
            </button>
          ))}

          <select
            className="graf-input"
            style={{ width: 210, fontSize: 11, padding: '2px 6px' }}
            value=""
            onChange={(e) => {
              const tpl = REFERENCE_SYSTEM_TEMPLATES.find((t) => t.id === e.target.value);
              if (tpl) onSetDesign(tpl.build());
              e.target.value = '';
            }}
            title="Load a curated reference speaker design (populates shared drivers, enclosures, cabinet dimensions, and crossovers)"
          >
            <option value="" disabled>
              Load Reference System...
            </option>
            {REFERENCE_SYSTEM_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <button
            className="graf-btn graf-btn-sm graf-btn-outline"
            style={{ fontSize: 10 }}
            onClick={onOpenSetupWizard}
            title="Change speaker topology (1-way to 4-way)"
          >
            {design.topology} Wizard
          </button>
        </div>
      </div>

      {/* Bottom Row: Shared Driver & Enclosure Pool Cards (single source of truth across Enclosure & Crossover tools) */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {design.ways.map((w, idx) => {
          const m = deriveDriverMetrics(w.driver);
          const isSelected = idx === activeWay;
          const xoPts = design.crossover_points.filter(
            (pt) => pt.low_way_index === idx || pt.high_way_index === idx
          );
          const xoText =
            xoPts.length > 0
              ? xoPts
                  .map((pt) =>
                    pt.low_way_index === idx
                      ? `LP ${pt.freq_hz}Hz (${pt.slope})`
                      : `HP ${pt.freq_hz}Hz (${pt.slope})`
                  )
                  .join(' · ')
              : 'Full-range';

          return (
            <div
              key={`${w.name}-${idx}`}
              onClick={() => onSelectWay(idx)}
              style={{
                flex: '1 1 220px',
                minWidth: 210,
                cursor: 'pointer',
                padding: '5px 8px',
                borderRadius: 6,
                border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                background: isSelected ? '#eff6ff' : '#f8fafc',
                fontSize: 11,
                transition: 'all 0.12s ease',
              }}
              title="Click to select this way in both the Enclosure Designer and Crossover Designer"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <strong style={{ color: isSelected ? '#1d4ed8' : '#0f172a' }}>
                  {w.name} {!w.enabled && '(Muted)'}
                </strong>
                <span style={{ fontSize: 10, color: '#475569', fontWeight: 500 }}>
                  {m.sensitivity_2v83_db.toFixed(1)} dB · {w.driver.re_ohm}Ω
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {w.preset_name || 'Custom Driver'} · Fs={w.driver.fs_hz}Hz · Qts={m.qts.toFixed(2)} · EBP={m.ebp.toFixed(0)}
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                <span>Box: {w.enclosure.type}</span>
                <span>{xoText}</span>
              </div>
            </div>
          );
        })}

        {/* Shared Cabinet & Baffle Step Pill */}
        <div
          style={{
            minWidth: 165,
            padding: '5px 8px',
            borderRadius: 6,
            border: '1px dashed #94a3b8',
            background: '#f8fafc',
            fontSize: 10,
            color: '#334155',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
          title="Shared Cabinet Baffle Width couples 3D Cabinet Cut-List and Crossover Baffle-Step Compensation"
        >
          <strong style={{ color: '#0f172a' }}>Shared Cabinet & Baffle</strong>
          <span>
            {design.cabinet
              ? `${design.cabinet.height_cm}×${design.cabinet.width_cm}×${design.cabinet.depth_cm} cm`
              : 'Auto Golden Ratio'}
          </span>
          <span style={{ color: '#2563eb', fontWeight: 600 }}>
            Baffle Step f_bsc = {bsc.f_bsc_hz} Hz
          </span>
        </div>
      </div>

      {/* Actionable Design Health Advisor Strip */}
      {advisorItems.length > 0 && (
        <div
          data-testid="design-advisor-strip"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            paddingTop: 2,
          }}
        >
          {advisorItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px',
                borderRadius: 5,
                fontSize: 10.5,
                background: item.severity === 'warn' ? '#fffbeb' : '#f0fdf4',
                border: `1px solid ${item.severity === 'warn' ? '#fcd34d' : '#bbf7d0'}`,
                color: item.severity === 'warn' ? '#92400e' : '#166534',
              }}
            >
              <span>
                <strong>{item.severity === 'warn' ? '⚠ Advisor:' : '💡 Tip:'}</strong> {item.message}
              </span>
              <button
                type="button"
                className="graf-btn graf-btn-sm graf-btn-outline"
                style={{
                  fontSize: 9.5,
                  padding: '1px 6px',
                  background: '#ffffff',
                  fontWeight: 600,
                }}
                onClick={item.onFix}
              >
                {item.actionLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

