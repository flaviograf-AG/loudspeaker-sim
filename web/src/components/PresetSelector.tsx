import { useState, useEffect, useMemo } from 'react';
import type {
  DriverDbEntry,
  PassiveRadiatorPreset,
  CoaxialDriverPreset,
} from '../presets/drivers_db';
import { DRIVER_PRESETS } from '../presets/drivers';
import type { DriverParams } from '../types';
import { InfoTooltip } from './InfoTooltip';

interface LoadedCatalogue {
  driverDb: DriverDbEntry[];
  coaxialPresets: CoaxialDriverPreset[];
  passiveRadiatorPresets: PassiveRadiatorPreset[];
  totalFirstParty: number;
  totalDriverBase: number;
}

let cachedCataloguePromise: Promise<LoadedCatalogue> | null = null;

export function loadDriverCatalogue(): Promise<LoadedCatalogue> {
  if (!cachedCataloguePromise) {
    cachedCataloguePromise = import('../presets/drivers_db').then((mod) => ({
      driverDb: mod.DRIVER_DB,
      coaxialPresets: mod.COAXIAL_DRIVER_PRESETS,
      passiveRadiatorPresets: mod.PASSIVE_RADIATOR_PRESETS,
      totalFirstParty: mod.FIRST_PARTY_SIMULATION_READY.length,
      totalDriverBase: mod.DRIVER_BASE_METADATA.counts.simulation_ready,
    }));
  }
  return cachedCataloguePromise;
}

interface CustomSavedDriver {
  name: string;
  params: DriverParams;
  createdAt: number;
}

const CUSTOM_DRIVERS_STORAGE_KEY = 'loudspeaker_sim_custom_drivers_v1';

function loadCustomDrivers(): CustomSavedDriver[] {
  try {
    const raw = localStorage.getItem(CUSTOM_DRIVERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomDrivers(list: CustomSavedDriver[]) {
  try {
    localStorage.setItem(CUSTOM_DRIVERS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors
  }
}

interface Props {
  onSelect: (params: DriverParams, name: string, entry?: DriverDbEntry) => void;
  onApplyCoaxial2Way?: (coax: CoaxialDriverPreset) => void;
  currentName?: string;
  currentDriver?: DriverParams;
}

export function PresetSelector({ onSelect, onApplyCoaxial2Way, currentName, currentDriver }: Props) {
  const [search, setSearch] = useState(currentName ?? '');
  const [showList, setShowList] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState(currentName ?? 'Custom Driver');
  const [customDrivers, setCustomDrivers] = useState<CustomSavedDriver[]>(() => loadCustomDrivers());
  const [savedNotice, setSavedNotice] = useState(false);
  const [catalogue, setCatalogue] = useState<LoadedCatalogue | null>(null);

  // Faceted filters
  const [sourceFilter, setSourceFilter] = useState<'all' | 'first_party' | 'driver_base' | 'custom'>('all');
  const [impedanceFilter, setImpedanceFilter] = useState<number | 'all'>('all');
  const [sizeFilter, setSizeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [ebpFilter, setEbpFilter] = useState<'all' | 'sealed' | 'dual' | 'vented'>('all');

  // Selected driver entry for rich provenance card & burn-in switcher
  const [selectedEntry, setSelectedEntry] = useState<DriverDbEntry | null>(null);
  const [burnInState, setBurnInState] = useState<'after_burn_in' | 'before_burn_in'>('after_burn_in');

  useEffect(() => {
    setSearch(currentName ?? '');
    if (currentName) setCustomName(currentName);
  }, [currentName]);

  useEffect(() => {
    let mounted = true;
    loadDriverCatalogue().then((cat) => {
      if (mounted) {
        setCatalogue(cat);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Keep selectedEntry synced if currentName matches a catalogue item
  useEffect(() => {
    if (!catalogue || !currentName) return;
    const match = catalogue.driverDb.find(
      (d) => `${d.vendor} ${d.model}`.toLowerCase() === currentName.toLowerCase()
    );
    if (match) {
      setSelectedEntry(match);
    }
  }, [catalogue, currentName]);

  const matchingCoaxial = useMemo(() => {
    if (!catalogue || !selectedEntry) return null;
    return (
      catalogue.coaxialPresets.find(
        (c) =>
          c.lf_entry.canonical_id === selectedEntry.canonical_id ||
          (c.vendor === selectedEntry.vendor &&
            selectedEntry.model.replace(/\s*\[(?:LF|HF|Woofer|Tweeter)\]/gi, '').trim() === c.model)
      ) ?? null
    );
  }, [catalogue, selectedEntry]);

  const filteredCustom = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (sourceFilter !== 'all' && sourceFilter !== 'custom') return [];
    if (q.length === 0 && sourceFilter !== 'custom') return [];
    return customDrivers.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [customDrivers, search, sourceFilter]);

  const filtered = useMemo(() => {
    if (!catalogue || sourceFilter === 'custom') return [];
    const q = search.trim().toLowerCase();
    const hasActiveFacet =
      sourceFilter !== 'all' ||
      impedanceFilter !== 'all' ||
      sizeFilter !== 'all' ||
      categoryFilter !== 'all' ||
      ebpFilter !== 'all';

    if (q.length < 2 && !hasActiveFacet) return [];

    return catalogue.driverDb
      .filter((d) => {
        if (q.length >= 2) {
          const textMatch =
            d.vendor.toLowerCase().includes(q) ||
            d.model.toLowerCase().includes(q) ||
            (d.canonical_id && d.canonical_id.toLowerCase().includes(q)) ||
            (d.part_number && d.part_number.toLowerCase().includes(q));
          if (!textMatch) return false;
        }
        if (sourceFilter === 'first_party' && d.source_tier !== 'first_party') return false;
        if (sourceFilter === 'driver_base' && d.source_tier === 'first_party') return false;
        if (impedanceFilter !== 'all' && Math.round(d.z_nom) !== impedanceFilter) return false;
        if (categoryFilter !== 'all' && d.driver_kind !== categoryFilter) return false;

        if (sizeFilter !== 'all') {
          const diaIn = (d.dia_m || 0) * 39.3701;
          if (sizeFilter === 'le5' && diaIn > 5.6) return false;
          if (sizeFilter === '6_7' && (diaIn < 5.6 || diaIn > 7.5)) return false;
          if (sizeFilter === '8_10' && (diaIn < 7.5 || diaIn > 11.0)) return false;
          if (sizeFilter === '12_15' && (diaIn < 11.0 || diaIn > 16.5)) return false;
          if (sizeFilter === 'ge18' && diaIn < 16.5) return false;
        }

        if (ebpFilter !== 'all') {
          const ebp = d.params.fs_hz / Math.max(0.01, d.params.qes);
          if (ebpFilter === 'sealed' && ebp > 55) return false;
          if (ebpFilter === 'dual' && (ebp < 50 || ebp > 95)) return false;
          if (ebpFilter === 'vented' && ebp < 90) return false;
        }
        return true;
      })
      .slice(0, 45);
  }, [catalogue, search, sourceFilter, impedanceFilter, sizeFilter, categoryFilter, ebpFilter]);

  const handleSaveCustomDriver = (nameToSave: string, paramsToSave?: DriverParams) => {
    const trimmed = nameToSave.trim() || 'Custom Driver';
    const params = paramsToSave ?? currentDriver ?? DRIVER_PRESETS[2].params;
    const next: CustomSavedDriver[] = [
      { name: trimmed, params: { ...params }, createdAt: Date.now() },
      ...customDrivers.filter((c) => c.name.toLowerCase() !== trimmed.toLowerCase()),
    ];
    setCustomDrivers(next);
    saveCustomDrivers(next);
    setSelectedEntry(null);
    onSelect({ ...params }, trimmed);
    setSearch(trimmed);
    setCustomName(trimmed);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleDeleteCustomDriver = (nameToDelete: string) => {
    const next = customDrivers.filter((c) => c.name !== nameToDelete);
    setCustomDrivers(next);
    saveCustomDrivers(next);
  };

  return (
    <div className="section-card" style={{ position: 'relative', overflow: 'visible' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 4 }}>
        <div
          className="section-title"
          style={{ margin: 0 }}
          title="Deduplicated First-Party Manufacturer Specifications + CC BY 4.0 driver-base Catalogue"
        >
          Driver Database {catalogue ? `(${catalogue.driverDb.length})` : ''}
          <InfoTooltip variant="section" docKey="section:driver-db" />
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          <button
            className={`graf-btn graf-btn-sm ${showCustomForm ? 'graf-btn-primary' : 'graf-btn-outline'}`}
            style={{ fontSize: 10, padding: '1px 6px' }}
            onClick={() => setShowCustomForm((s) => !s)}
            title="Create, name, or save your own custom driver (Eigene Chassis anlegen)"
            data-testid="toggle-custom-driver"
          >
            + Custom Driver
          </button>
          <button
            className={`graf-btn graf-btn-sm ${showFilters ? 'graf-btn-primary' : 'graf-btn-outline'}`}
            style={{ fontSize: 10, padding: '1px 6px' }}
            onClick={() => {
              setShowFilters((s) => !s);
              if (!showFilters) setShowList(true);
            }}
            title="Filter drivers by 1st-Party / driver-base source, impedance, cone diameter, driver category, or EBP alignment"
            data-testid="toggle-driver-filters"
          >
            {showFilters ? 'Hide Filters' : 'Explorer / Filter'}
          </button>
        </div>
      </div>

      {/* Custom Driver Creation & Library Manager */}
      {showCustomForm && (
        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 4,
            padding: 7,
            marginBottom: 6,
            fontSize: 11,
          }}
          data-testid="custom-driver-panel"
        >
          <div style={{ fontWeight: 600, color: '#1e3a8a', marginBottom: 4 }}>
            Create / Save Custom Driver (Eigene Chassis anlegen)
          </div>
          <div style={{ fontSize: 10, color: '#475569', marginBottom: 5, lineHeight: 1.35 }}>
            Enter your driver name below, edit its Thiele/Small parameters in the <strong>Driver T/S</strong> fields directly below this card, and click <strong>Save to My Drivers</strong> to keep it in your browser library.
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
            <input
              type="text"
              className="graf-form-control"
              style={{ flex: 1, fontSize: 11 }}
              placeholder="Manufacturer & Model (e.g. Scan-Speak 18W/8545)..."
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
            <button
              className="graf-btn graf-btn-sm graf-btn-primary"
              style={{ fontSize: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}
              onClick={() => handleSaveCustomDriver(customName)}
              title="Apply name and save current Thiele/Small parameters to your custom driver library"
            >
              {savedNotice ? '✓ Saved!' : 'Save to My Drivers'}
            </button>
          </div>
          {customDrivers.length > 0 && (
            <div style={{ fontSize: 10, color: '#334155', marginTop: 4 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>My Saved Custom Drivers ({customDrivers.length}):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {customDrivers.map((cd) => (
                  <span
                    key={cd.name}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      background: '#ffffff',
                      border: '1px solid #93c5fd',
                      borderRadius: 3,
                      padding: '1px 5px',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setSelectedEntry(null);
                      onSelect(cd.params, cd.name);
                      setSearch(cd.name);
                      setCustomName(cd.name);
                    }}
                    title={`Load ${cd.name} (Fs ${cd.params.fs_hz}Hz, Re ${cd.params.re_ohm}Ω)`}
                  >
                    <span>{cd.name}</span>
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
                      title={`Delete ${cd.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCustomDriver(cd.name);
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Faceted Filter Panel */}
      {showFilters && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 4,
            padding: 6,
            marginBottom: 6,
            fontSize: 10,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
          }}
          data-testid="driver-filter-panel"
        >
          <div>
            <label style={{ display: 'block', color: '#475569', fontWeight: 600 }}>Source Tier</label>
            <select
              className="graf-form-control"
              style={{ width: '100%', fontSize: 10, padding: '2px 4px' }}
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value as 'all' | 'first_party' | 'driver_base' | 'custom');
                setShowList(true);
              }}
            >
              <option value="all">All Verified ({catalogue?.driverDb.length ?? '...'})</option>
              <option value="first_party">1st-Party Official ({catalogue?.totalFirstParty ?? 303})</option>
              <option value="driver_base">driver-base CC BY 4.0</option>
              <option value="custom">My Custom Drivers ({customDrivers.length})</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: '#475569', fontWeight: 600 }}>Impedance</label>
            <select
              className="graf-form-control"
              style={{ width: '100%', fontSize: 10, padding: '2px 4px' }}
              value={String(impedanceFilter)}
              onChange={(e) => {
                const v = e.target.value;
                setImpedanceFilter(v === 'all' ? 'all' : Number(v));
                setShowList(true);
              }}
            >
              <option value="all">Any Z_nom</option>
              <option value="4">4 Ω</option>
              <option value="8">8 Ω</option>
              <option value="16">16 Ω</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: '#475569', fontWeight: 600 }}>Diameter</label>
            <select
              className="graf-form-control"
              style={{ width: '100%', fontSize: 10, padding: '2px 4px' }}
              value={sizeFilter}
              onChange={(e) => {
                setSizeFilter(e.target.value);
                setShowList(true);
              }}
            >
              <option value="all">Any Size</option>
              <option value="le5">≤ 5.5" (14 cm)</option>
              <option value="6_7">6" – 7" (16–18 cm)</option>
              <option value="8_10">8" – 10" (20–26 cm)</option>
              <option value="12_15">12" – 15" (30–38 cm)</option>
              <option value="ge18">≥ 18" (46+ cm)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: '#475569', fontWeight: 600 }}>Category</label>
            <select
              className="graf-form-control"
              style={{ width: '100%', fontSize: 10, padding: '2px 4px' }}
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setShowList(true);
              }}
            >
              <option value="all">All Types</option>
              <option value="subwoofer">Subwoofer</option>
              <option value="lf_woofer">LF Woofer</option>
              <option value="midwoofer">Midwoofer</option>
              <option value="coax_lf">Coaxial (LF Unit)</option>
              <option value="fullrange">Fullrange</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / span 2' }}>
            <label style={{ display: 'block', color: '#475569', fontWeight: 600 }}>
              EBP Alignment Suitability (Fs / Qes)
            </label>
            <select
              className="graf-form-control"
              style={{ width: '100%', fontSize: 10, padding: '2px 4px' }}
              value={ebpFilter}
              onChange={(e) => {
                setEbpFilter(e.target.value as 'all' | 'sealed' | 'dual' | 'vented');
                setShowList(true);
              }}
            >
              <option value="all">Any EBP</option>
              <option value="sealed">Sealed Optimal (EBP ≤ 55)</option>
              <option value="dual">Sealed or Vented (EBP 50–95)</option>
              <option value="vented">Vented / Horn Optimal (EBP ≥ 90)</option>
            </select>
          </div>
        </div>
      )}

      {/* Search input */}
      <div
        className="param-row"
        title="Search verified simulation-ready drivers by manufacturer, model, part number, or canonical_id"
      >
        <input
          type="text"
          className="graf-form-control"
          placeholder="Search drivers..."
          style={{ width: '100%' }}
          value={search}
          onFocus={() => setShowList(true)}
          onBlur={() => setTimeout(() => setShowList(false), 180)}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowList(true);
          }}
        />
      </div>

      {/* Search results dropdown */}
      {showList && (filteredCustom.length > 0 || filtered.length > 0 || search.trim().length >= 2) && (
        <div
          style={{
            position: 'absolute',
            zIndex: 100,
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: 'auto',
            background: 'var(--graf-surface, #fff)',
            border: '1px solid var(--graf-border, #e8e4dc)',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          }}
        >
          {filteredCustom.map((cd) => (
            <div
              key={`custom-${cd.name}`}
              style={{
                padding: '5px 8px',
                cursor: 'pointer',
                fontSize: 11.5,
                borderBottom: '1px solid var(--graf-warm-100, #f0ede8)',
                background: '#f8fafc',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                setSelectedEntry(null);
                onSelect(cd.params, cd.name);
                setSearch(cd.name);
                setCustomName(cd.name);
                setShowList(false);
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <strong>{cd.name}</strong>
                </span>
                <span
                  style={{
                    fontSize: 9,
                    padding: '1px 4px',
                    borderRadius: 3,
                    background: '#dbeafe',
                    color: '#1e40af',
                    fontWeight: 600,
                  }}
                >
                  My Custom Driver
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                Fs {cd.params.fs_hz}Hz · Re {cd.params.re_ohm}Ω · Qts {((cd.params.qes * cd.params.qms) / (cd.params.qes + cd.params.qms)).toFixed(2)} · Vas {(cd.params.vas_m3 * 1000).toFixed(1)}L
              </div>
            </div>
          ))}
          {filtered.map((d, i) => {
            const isFirstParty = d.source_tier === 'first_party';
            const ebp = Math.round(d.params.fs_hz / Math.max(0.01, d.params.qes));
            return (
              <div
                key={d.canonical_id ?? `${d.vendor}-${d.model}-${i}`}
                style={{
                  padding: '5px 8px',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  borderBottom: '1px solid var(--graf-warm-100, #f0ede8)',
                }}
                title={d.canonical_id ? `canonical_id: ${d.canonical_id}` : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const name = `${d.vendor} ${d.model}`;
                  setSelectedEntry(d);
                  setBurnInState('after_burn_in');
                  onSelect(d.params, name, d);
                  setSearch(name);
                  setShowList(false);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    <strong>{d.vendor}</strong> {d.model}
                    {d.part_number ? (
                      <span style={{ color: '#64748b', fontSize: 10, marginLeft: 4 }}>#{d.part_number}</span>
                    ) : null}
                  </span>
                  <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: 9,
                        padding: '1px 4px',
                        borderRadius: 3,
                        background: isFirstParty ? '#dcfce7' : '#e0f2fe',
                        color: isFirstParty ? '#166534' : '#075985',
                        fontWeight: 600,
                      }}
                    >
                      {isFirstParty ? '1st-Party' : 'CC-BY-4.0'}
                    </span>
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 1, display: 'flex', justifyContent: 'space-between' }}>
                  <span>
                    Fs {d.params.fs_hz}Hz · {d.z_nom}Ω · Vas {(d.params.vas_m3 * 1000).toFixed(1)}L · EBP {ebp}
                  </span>
                  <span>
                    {d.dia_m ? `${(d.dia_m * 100).toFixed(0)}cm` : ''}
                    {d.burn_in_conditions ? ' · Burn-In ⇄' : ''}
                  </span>
                </div>
              </div>
            );
          })}
          {search.trim().length >= 2 && (
            <div
              style={{
                padding: '6px 8px',
                cursor: 'pointer',
                fontSize: 11,
                background: '#eff6ff',
                color: '#1d4ed8',
                fontWeight: 600,
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                const name = search.trim();
                setCustomName(name);
                setShowCustomForm(true);
                handleSaveCustomDriver(name);
                setShowList(false);
              }}
            >
              + Create &quot;{search.trim()}&quot; as Custom Driver (edit T/S parameters below)
            </div>
          )}
        </div>
      )}

      {/* Provenance & Condition Badge Card for Active Catalogue Driver */}
      {selectedEntry && (
        <div
          style={{
            marginTop: 6,
            padding: '5px 7px',
            borderRadius: 4,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontSize: 10,
            lineHeight: 1.4,
          }}
          data-testid="driver-provenance-card"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            <span
              style={{
                padding: '1px 5px',
                borderRadius: 3,
                fontWeight: 600,
                background: selectedEntry.source_tier === 'first_party' ? '#dcfce7' : '#e0f2fe',
                color: selectedEntry.source_tier === 'first_party' ? '#166534' : '#075985',
              }}
            >
              {selectedEntry.source_tier === 'first_party' ? '✓ 1st-Party Manufacturer Spec' : '✓ Verified driver-base (CC BY 4.0)'}
            </span>
            {selectedEntry.checks_run_ids && (
              <span
                style={{ color: '#475569' }}
                title={`Validated equations: ${selectedEntry.checks_run_ids.join(', ')}`}
              >
                {selectedEntry.checks_run_ids.length}/6 T/S checks passed
              </span>
            )}
            {selectedEntry.source_urls?.[0] && (
              <a
                href={selectedEntry.source_urls[0]}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#0284c7', textDecoration: 'underline' }}
              >
                Datasheet ↗
              </a>
            )}
          </div>

          {selectedEntry.precedence_outcome === 'official_promoted_fixing_third_party' && (
            <div style={{ color: '#0f766e', marginTop: 3, fontWeight: 500 }}>
              ★ Promoted from 3rd-party quarantine via official manufacturer datasheet resolution.
            </div>
          )}

          {selectedEntry.recommended_enclosure_volume_liters && (
            <div style={{ color: '#334155', marginTop: 2 }}>
              Manufacturer recommended vented box: <strong>{selectedEntry.recommended_enclosure_volume_liters} L</strong> (kept separate from Vas = {(selectedEntry.params.vas_m3 * 1000).toFixed(2)} L)
            </div>
          )}

          {/* Burn-In Condition Switcher (e.g. Wavecor WF182BD17/18/19/20) */}
          {selectedEntry.burn_in_conditions && (
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              <span style={{ fontWeight: 600, color: '#334155' }}>Measurement Condition:</span>
              <div style={{ display: 'flex', gap: 3 }}>
                <button
                  className={`graf-btn graf-btn-sm ${burnInState === 'before_burn_in' ? 'graf-btn-primary' : 'graf-btn-outline'}`}
                  style={{ fontSize: 9.5, padding: '1px 5px' }}
                  onClick={() => {
                    setBurnInState('before_burn_in');
                    onSelect(
                      selectedEntry.burn_in_conditions!.before_burn_in,
                      `${selectedEntry.vendor} ${selectedEntry.model} (Before Burn-In)`,
                      selectedEntry
                    );
                  }}
                >
                  Before Burn-In (Fs {selectedEntry.burn_in_conditions.before_burn_in.fs_hz}Hz)
                </button>
                <button
                  className={`graf-btn graf-btn-sm ${burnInState === 'after_burn_in' ? 'graf-btn-primary' : 'graf-btn-outline'}`}
                  style={{ fontSize: 9.5, padding: '1px 5px' }}
                  onClick={() => {
                    setBurnInState('after_burn_in');
                    onSelect(
                      selectedEntry.burn_in_conditions!.after_burn_in,
                      `${selectedEntry.vendor} ${selectedEntry.model} (After Burn-In)`,
                      selectedEntry
                    );
                  }}
                >
                  After Burn-In (Fs {selectedEntry.burn_in_conditions.after_burn_in.fs_hz}Hz)
                </button>
              </div>
            </div>
          )}

          {/* One-Click Coaxial 2-Way Auto-Setup Button */}
          {matchingCoaxial && onApplyCoaxial2Way && (
            <div style={{ marginTop: 5 }}>
              <button
                className="graf-btn graf-btn-sm graf-btn-primary"
                style={{ width: '100%', fontSize: 10 }}
                onClick={() => onApplyCoaxial2Way(matchingCoaxial)}
                title={`Configure 2-Way system with ${matchingCoaxial.vendor} ${matchingCoaxial.model} LF cone + HF unit at ${matchingCoaxial.hf_section.recommended_crossover_hz} Hz`}
                data-testid="apply-coaxial-2way-btn"
              >
                ⇄ Configure Coaxial 2-Way (LF + HF @ {matchingCoaxial.hf_section.recommended_crossover_hz} Hz)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Generic presets + Coaxial quick-select fallback */}
      <div className="param-row" style={{ marginTop: 4 }}>
        <span className="param-label" style={{ flex: '0 0 50px' }}>Quick</span>
        <select
          className="graf-form-control graf-form-select"
          style={{ width: '100%' }}
          title="Quick-select a common driver type, saved custom driver, or coaxial 2-way pair"
          defaultValue=""
          onChange={(e) => {
            const val = e.target.value;
            if (val.startsWith('custom:')) {
              const cname = val.slice(7);
              const found = customDrivers.find((c) => c.name === cname);
              if (found) {
                setSelectedEntry(null);
                onSelect(found.params, found.name);
                setSearch(found.name);
                setCustomName(found.name);
              }
            } else if (val.startsWith('coax:') && catalogue && onApplyCoaxial2Way) {
              const cid = val.slice(5);
              const coax = catalogue.coaxialPresets.find((c) => c.id === cid);
              if (coax) {
                setSelectedEntry(coax.lf_entry);
                onApplyCoaxial2Way(coax);
                setSearch(`${coax.vendor} ${coax.model}`);
              }
            } else {
              const idx = parseInt(val, 10);
              if (!isNaN(idx)) {
                setSelectedEntry(null);
                onSelect(DRIVER_PRESETS[idx].params, DRIVER_PRESETS[idx].name);
                setSearch(DRIVER_PRESETS[idx].name);
              }
            }
            e.target.value = '';
          }}
        >
          <option value="" disabled>Generic, Custom & Coaxial presets...</option>
          {customDrivers.length > 0 && (
            <optgroup label="My Custom Drivers">
              {customDrivers.map((cd) => (
                <option key={cd.name} value={`custom:${cd.name}`}>
                  ★ {cd.name} (Fs {cd.params.fs_hz}Hz, {cd.params.re_ohm}Ω)
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Standard Role Presets">
            {DRIVER_PRESETS.map((p, i) => (
              <option key={i} value={String(i)}>{p.name}</option>
            ))}
          </optgroup>
          {catalogue && catalogue.coaxialPresets.length > 0 && (
            <optgroup label="1st-Party Coaxial 2-Way Pairs (Auto LF + HF)">
              {catalogue.coaxialPresets.map((c) => (
                <option key={c.id} value={`coax:${c.id}`}>
                  {c.vendor} {c.model} (LF + HF @ {c.hf_section.recommended_crossover_hz}Hz)
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    </div>
  );
}
