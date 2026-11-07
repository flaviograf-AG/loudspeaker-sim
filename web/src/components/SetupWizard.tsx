import { useState, useEffect } from 'react';
import type { SystemTopology, EnclosureType, WayInput, WayDesign } from '../types';
import { TOPOLOGY_TEMPLATES, ENCLOSURE_TYPES_FOR_ROLE, buildWaysFromSetup, computeDefaultEnclosure } from '../systemSetup';

interface Props {
  onComplete: (topology: SystemTopology, ways: WayInput[], preserveExisting?: boolean) => void;
  onCancel?: () => void;
  initialTopology?: SystemTopology;
  currentWays?: WayDesign[];
  isReopened?: boolean;
}

const TOPOLOGY_LABELS: Record<SystemTopology, { label: string; desc: string; tip: string }> = {
  '1-way': { label: '1-Way', desc: 'Full-range single driver', tip: 'Single full-range driver covering the entire frequency range. Simplest design — great for desktop monitors and practice.' },
  '2-way': { label: '2-Way', desc: 'Woofer + tweeter', tip: 'Most common speaker design. Woofer handles bass/midrange, tweeter handles highs. One crossover point (typically 2-3 kHz).' },
  '2.5-way': { label: '2.5-Way', desc: '2 woofers (one bass-only) + tweeter', tip: 'Like a 2-way but with a second woofer that only plays bass. Adds bass output without changing the midrange character.' },
  '3-way': { label: '3-Way', desc: 'Woofer + midrange + tweeter', tip: 'Dedicated driver for each frequency band. Two crossover points. Better performance but more complex crossover design.' },
  '3.5-way': { label: '3.5-Way', desc: '2 woofers (one bass-only) + mid + tweeter', tip: 'A 3-way with an additional bass-only woofer for extended low-frequency output. Common in tower/floorstanding speakers.' },
  '4-way': { label: '4-Way', desc: 'Sub + woofer + midrange + tweeter', tip: 'Full frequency range with dedicated subwoofer. Three crossover points. Maximum control over each band at the cost of crossover complexity.' },
};

const ENCLOSURE_LABELS: Record<EnclosureType, string> = {
  Sealed: 'Sealed',
  Vented: 'Bass Reflex (Vented)',
  TransmissionLine: 'Transmission Line',
  Horn: 'Horn',
  Bandpass: 'Bandpass',
  PassiveRadiator: 'Passive Radiator',
  OpenBaffle: 'Open Baffle',
};

export function SetupWizard({ onComplete, onCancel, initialTopology, currentWays, isReopened = false }: Props) {
  const [topology, setTopology] = useState<SystemTopology>(initialTopology ?? '2-way');
  const templates = TOPOLOGY_TEMPLATES[topology];
  const [enclosures, setEnclosures] = useState<EnclosureType[]>(() =>
    templates.map((t, i) => currentWays?.[i]?.enclosure.type ?? t.defaultEnclosureType)
  );
  const [preserveExisting, setPreserveExisting] = useState<boolean>(isReopened);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCancel) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const handleTopologyChange = (t: SystemTopology) => {
    setTopology(t);
    setEnclosures(TOPOLOGY_TEMPLATES[t].map(tpl => tpl.defaultEnclosureType));
  };

  const handleEnclosureChange = (wayIdx: number, enc: EnclosureType) => {
    setEnclosures(prev => {
      const next = [...prev];
      next[wayIdx] = enc;
      return next;
    });
  };

  const handleStart = () => {
    const ways = buildWaysFromSetup(topology, enclosures);
    if (preserveExisting && currentWays && currentWays.length > 0) {
      const mergedWays = ways.map((w, idx) => {
        // Match by name first (e.g. Woofer, Tweeter), then by index
        const existing =
          currentWays.find((cw) => cw.name.toLowerCase() === w.name.toLowerCase()) ??
          currentWays[idx];
        if (!existing) return w;
        const desiredEncType = enclosures[idx] ?? w.enclosure.type;
        const nextEnclosure =
          existing.enclosure.type === desiredEncType
            ? existing.enclosure
            : computeDefaultEnclosure(existing.driver, desiredEncType);
        return {
          ...w,
          driver: existing.driver,
          enclosure: nextEnclosure,
          passive_filters: existing.passive_filters,
          gain_db: existing.gain_db,
          delay_s: existing.delay_s,
          inverted: existing.inverted,
          z_offset_m: existing.z_offset_m,
          enabled: existing.enabled,
          preset_name: existing.preset_name,
          measured: existing.measured,
        };
      });
      onComplete(topology, mergedWays, true);
      return;
    }
    onComplete(topology, ways, false);
  };

  return (
    <div
      className="setup-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && onCancel) {
          onCancel();
        }
      }}
    >
      <div className="setup-wizard" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="setup-wizard-title" style={{ marginBottom: 0 }}>
            {isReopened ? 'Change Speaker System' : 'New Speaker Design'}
          </h2>
          {onCancel && (
            <button
              type="button"
              className="graf-btn graf-btn-sm graf-btn-outline"
              onClick={onCancel}
              title="Close wizard and keep current design (Esc)"
              data-testid="setup-cancel-close"
              style={{ fontSize: 13, padding: '2px 8px' }}
            >
              ✕ Close
            </button>
          )}
        </div>

        {/* Step 1: Topology */}
        <div className="setup-section">
          <div className="setup-section-label">System Type</div>
          <div className="setup-topology-grid">
            {(Object.keys(TOPOLOGY_LABELS) as SystemTopology[]).map(t => (
              <button
                key={t}
                className={`setup-topology-btn ${topology === t ? 'active' : ''}`}
                onClick={() => handleTopologyChange(t)}
                title={TOPOLOGY_LABELS[t].tip}
              >
                <span className="setup-topology-label">{TOPOLOGY_LABELS[t].label}</span>
                <span className="setup-topology-desc">{TOPOLOGY_LABELS[t].desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Enclosure per way */}
        <div className="setup-section">
          <div className="setup-section-label">Enclosure per Way</div>
          <div className="setup-ways-list">
            {templates.map((tpl, i) => {
              const available = ENCLOSURE_TYPES_FOR_ROLE[tpl.role] ?? [];
              return (
                <div key={i} className="setup-way-row">
                  <span className="setup-way-name">{tpl.name}</span>
                  <select
                    className="graf-form-control setup-way-select"
                    value={enclosures[i] ?? tpl.defaultEnclosureType}
                    onChange={e => handleEnclosureChange(i, e.target.value as EnclosureType)}
                  >
                    {available.map(enc => (
                      <option key={enc} value={enc}>{ENCLOSURE_LABELS[enc]}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        {currentWays && currentWays.length > 0 && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: '#334155',
              marginBottom: 12,
              cursor: 'pointer',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: '6px 10px',
            }}
          >
            <input
              type="checkbox"
              checked={preserveExisting}
              onChange={(e) => setPreserveExisting(e.target.checked)}
              data-testid="setup-preserve-checkbox"
            />
            <span>
              Keep existing drivers, measurements (FRD/ZMA) &amp; crossover components where ways match
            </span>
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {onCancel && (
            <button
              type="button"
              className="graf-btn graf-btn-outline"
              style={{ flex: '0 0 auto', padding: '10px 16px', fontSize: 14, fontWeight: 600 }}
              onClick={onCancel}
              data-testid="setup-cancel-btn"
            >
              Cancel
            </button>
          )}
          <button
            className="graf-btn graf-btn-primary setup-start-btn"
            style={{ marginTop: 0, flex: 1 }}
            onClick={handleStart}
          >
            Start Designing
          </button>
        </div>
      </div>
    </div>
  );
}
