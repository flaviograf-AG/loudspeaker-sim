import { useState } from 'react';
import type { SystemTopology, EnclosureType, WayInput } from '../types';
import { TOPOLOGY_TEMPLATES, ENCLOSURE_TYPES_FOR_ROLE, buildWaysFromSetup } from '../systemSetup';

interface Props {
  onComplete: (topology: SystemTopology, ways: WayInput[]) => void;
  initialTopology?: SystemTopology;
}

const TOPOLOGY_LABELS: Record<SystemTopology, { label: string; desc: string }> = {
  '1-way': { label: '1-Way', desc: 'Full-range single driver' },
  '2-way': { label: '2-Way', desc: 'Woofer + tweeter' },
  '2.5-way': { label: '2.5-Way', desc: '2 woofers (one bass-only) + tweeter' },
  '3-way': { label: '3-Way', desc: 'Woofer + midrange + tweeter' },
  '3.5-way': { label: '3.5-Way', desc: '2 woofers (one bass-only) + mid + tweeter' },
  '4-way': { label: '4-Way', desc: 'Sub + woofer + midrange + tweeter' },
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

export function SetupWizard({ onComplete, initialTopology }: Props) {
  const [topology, setTopology] = useState<SystemTopology>(initialTopology ?? '2-way');
  const templates = TOPOLOGY_TEMPLATES[topology];
  const [enclosures, setEnclosures] = useState<EnclosureType[]>(
    templates.map(t => t.defaultEnclosureType)
  );

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
    onComplete(topology, ways);
  };

  return (
    <div className="setup-overlay">
      <div className="setup-wizard">
        <h2 className="setup-wizard-title">New Speaker Design</h2>

        {/* Step 1: Topology */}
        <div className="setup-section">
          <div className="setup-section-label">System Type</div>
          <div className="setup-topology-grid">
            {(Object.keys(TOPOLOGY_LABELS) as SystemTopology[]).map(t => (
              <button
                key={t}
                className={`setup-topology-btn ${topology === t ? 'active' : ''}`}
                onClick={() => handleTopologyChange(t)}
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

        <button className="graf-btn graf-btn-primary setup-start-btn" onClick={handleStart}>
          Start Designing
        </button>
      </div>
    </div>
  );
}
