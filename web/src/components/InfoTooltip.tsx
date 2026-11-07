import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipLink {
  label: string;
  url: string;
}

export interface RichTooltipEntry {
  title?: string;
  body: string;
  formula?: string;
  links?: TooltipLink[];
}

/**
 * Authoritative acoustics reference links & explanations keyed by concept / parameter / section ID.
 */
export const ACOUSTIC_KNOWLEDGE_BASE: Record<string, RichTooltipEntry> = {
  // === SECTION HEADERS (variant="section") ===
  'section:driver-accordion': {
    title: 'Driver Selection & Electromechanical Model',
    body: 'Select a verified manufacturer driver from the database, create your own custom driver from a datasheet, or import measured frequency response (FRD) and impedance (ZMA) files.',
    links: [
      { label: 'Wikipedia: Thiele/Small Parameters', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters' },
      { label: 'Rod Elliott (ESP): Loudspeaker Design', url: 'https://sound-au.com/articles/enclosures.htm' },
    ],
  },
  'section:enclosure-accordion': {
    title: 'Acoustic Enclosure & Cabinet Geometry',
    body: 'Simulate how the box behind the driver shapes low-frequency extension, transient damping (Qtc), cone excursion, and port air velocity. Includes 3D baffle dimensions and wood panel cut-lists.',
    links: [
      { label: 'Wikipedia: Loudspeaker Enclosure', url: 'https://en.wikipedia.org/wiki/Loudspeaker_enclosure' },
      { label: 'Linkwitz Lab: Box & Baffle Acoustics', url: 'https://www.linkwitzlab.com/diffraction.htm' },
    ],
  },
  'section:crossover-accordion': {
    title: 'Active DSP & Passive RLC Crossover Network',
    body: 'Divide the frequency spectrum between ways, align acoustic phase & time-of-flight delay, and design real passive inductor/capacitor/resistor ladder circuits with impedance compensation.',
    links: [
      { label: 'Wikipedia: Audio Crossover', url: 'https://en.wikipedia.org/wiki/Audio_crossover' },
      { label: 'Rod Elliott (ESP): Passive Crossover Design', url: 'https://sound-au.com/lr-passive.htm' },
    ],
  },
  'section:system-accordion': {
    title: 'System Simulation, Optimizer & Export',
    body: 'Configure sweep resolution and amplifier drive level, run the automated crossover optimizer, compare design snapshots, and export FRD/CSV curves, CAD schematics, or MiniDSP biquads.',
    links: [
      { label: 'Wikipedia: Electrical Characteristics of Speakers', url: 'https://en.wikipedia.org/wiki/Electrical_characteristics_of_dynamic_loudspeakers' },
    ],
  },
  'section:driver-db': {
    title: 'Driver Database & Custom Driver Library',
    body: 'Search 1,200+ simulation-ready drivers from official 1st-party manufacturer datasheets and the CC-BY-4.0 driver-base catalog, or click "+ Custom Driver" to enter and save your own chassis.',
    links: [
      { label: 'Loudspeaker Database (Datasheets)', url: 'https://www.loudspeakerdatabase.com/' },
      { label: 'Wikipedia: Thiele/Small Parameters', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters' },
    ],
  },
  'section:driver-ts': {
    title: 'Thiele-Small Small-Signal Parameters',
    body: 'Lumped parameters defined by A.N. Thiele and R.H. Small that model the low-frequency electromechanical behavior of a moving-coil driver near resonance.',
    formula: 'Fs = 1 / (2π√(Mms·Cms))  |  Qts = (Qes·Qms)/(Qes+Qms)',
    links: [
      { label: 'Wikipedia: Thiele/Small Parameters', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters' },
      { label: 'AudioJudgement: Thiele-Small Explained', url: 'https://audiojudgement.com/thiele-small-parameters-explained/' },
    ],
  },
  'section:physical-params': {
    title: 'Lumped Physical Electromechanical Components',
    body: 'Fundamental physical motor, mass, stiffness, and damping parameters (Beranek & Mellow). Editing any physical parameter automatically recalculates Fs, Qes, Qms, and Vas in real time.',
    formula: 'Qes = (Re / Bl²)·√(Mms / Cms)  |  Vas = Cms·Sd²·ρ₀·c²',
    links: [
      { label: 'Wikipedia: Moving-Coil Loudspeaker', url: 'https://en.wikipedia.org/wiki/Loudspeaker#Moving-coil' },
      { label: 'Voice Coil / Klippel Parameter Guide', url: 'https://www.klippel.de/know-how/literature.html' },
    ],
  },
  'section:frd-zma': {
    title: 'Measured FRD & ZMA Data Import',
    body: 'Import real acoustic SPL/Phase (.frd) and electrical impedance (.zma) measurements (e.g., from REW, ARTA, or Klippel). Supports multi-angle off-axis curves (0°–60°) and hybrid box simulation.',
    links: [
      { label: 'REW (Room EQ Wizard) Documentation', url: 'https://www.roomeqwizard.com/help/help_en-GB/html/export.html' },
      { label: 'FRD Consortium File Format Guide', url: 'https://www.roomeqwizard.com/help/help_en-GB/html/import.html' },
    ],
  },
  'section:enclosure-type': {
    title: 'Acoustic Enclosure Alignment',
    body: 'Choose how the rear radiation of the cone is loaded: Sealed (2nd-order roll-off, best transient response), Vented/Ported (4th-order Helmholtz resonator), Passive Radiator, Transmission Line, Horn, Bandpass, or Open Baffle.',
    links: [
      { label: 'Wikipedia: Loudspeaker Enclosure Types', url: 'https://en.wikipedia.org/wiki/Loudspeaker_enclosure' },
      { label: 'DIYAudio & Subwoofers: Sealed vs Ported', url: 'https://sound-au.com/articles/enclosures.htm' },
    ],
  },
  'section:cabinet-3d': {
    title: '3D Cabinet Geometry, Baffle Step & Cut-List',
    body: 'Computes internal net volume (deducting wood thickness, bracing, driver magnet, and port volume), panel cut-list in mm, and couples front baffle width W directly to Baffle Step diffraction.',
    formula: 'f_bsc = 115 / W_meters',
    links: [
      { label: 'Linkwitz Lab: Baffle Diffraction & Step', url: 'https://www.linkwitzlab.com/diffraction.htm' },
      { label: 'Rod Elliott: Baffle Step Compensation', url: 'https://sound-au.com/bafflestep.htm' },
    ],
  },
  'section:crossover-mode': {
    title: 'Crossover Architecture (Active DSP vs Passive RLC)',
    body: 'Active DSP applies ideal electronic filters before each power amplifier (no impedance interaction). Passive RLC places real inductors, capacitors, and resistors between one amplifier and the reactive driver load.',
    links: [
      { label: 'Wikipedia: Active vs Passive Crossovers', url: 'https://en.wikipedia.org/wiki/Audio_crossover#Active_crossovers' },
      { label: 'Rod Elliott: Active vs Passive Crossover', url: 'https://sound-au.com/bi-amp.htm' },
    ],
  },
  'section:crossover-points': {
    title: 'Target Crossover Frequencies & Slopes',
    body: 'Defines the acoustic hand-off frequency and target filter slope (1st order 6 dB/oct, 2nd order 12 dB/oct, or 4th order 24 dB/oct Linkwitz-Riley) between adjacent driver ways.',
    links: [
      { label: 'Wikipedia: Linkwitz–Riley Filter', url: 'https://en.wikipedia.org/wiki/Linkwitz%E2%80%93Riley_filter' },
      { label: 'Wikipedia: Butterworth Filter', url: 'https://en.wikipedia.org/wiki/Butterworth_filter' },
    ],
  },
  'section:passive-rlc': {
    title: 'Passive RLC Ladder Network & Compensation',
    body: 'Build a real passive crossover using series and shunt components, parallel R∥C / R∥L networks, Sperrkreis (series trap), Saugkreis (shunt notch), Zobel impedance flattening, and L-Pad attenuators.',
    links: [
      { label: 'Wikipedia: Zobel Network (Boucherot Cell)', url: 'https://en.wikipedia.org/wiki/Zobel_network#Loudspeaker_drivers' },
      { label: 'Wikipedia: L-Pad Attenuator', url: 'https://en.wikipedia.org/wiki/L_pad' },
    ],
  },
  'section:driver-alignment': {
    title: 'Acoustic Center, Delay, Gain & Polarity',
    body: 'Align the acoustic centers (Z-offset / time delay), relative level, and polarity of each driver so waves sum constructively in phase at the crossover frequency.',
    links: [
      { label: 'Linkwitz Lab: Acoustic Phase & Time Alignment', url: 'https://www.linkwitzlab.com/frontiers.htm#J' },
    ],
  },
  'section:parametric-eq': {
    title: 'Per-Way Active DSP Filters & Baffle Step EQ',
    body: 'Add Parametric EQ (PEQ) bells, Low/High shelves, Baffle Step shelves, or All-Pass phase filters to linearize the response of an individual driver channel.',
    links: [
      { label: 'Wikipedia: Equalization (Parametric EQ)', url: 'https://en.wikipedia.org/wiki/Equalization_(audio)#Parametric_equalizer' },
      { label: 'Audio EQ Cookbook (R. Bristow-Johnson)', url: 'https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html' },
    ],
  },
  'section:simulation': {
    title: 'Sweep Settings & Amplifier Source Impedance',
    body: 'Controls the frequency sweep grid, RMS drive voltage (2.83 Vrms = 1 W into 8 Ω), and amplifier + cable series resistance (Source R), which affects passive crossover damping and Qes.',
    links: [
      { label: 'Wikipedia: Damping Factor & Source Impedance', url: 'https://en.wikipedia.org/wiki/Damping_factor' },
    ],
  },
  'section:optimizer': {
    title: 'Automated Crossover & Response Optimizer',
    body: 'Uses Nelder-Mead / Levenberg-Marquardt numerical optimization in WASM to tune filter frequencies, gains, or passive RLC values to flatten the combined system SPL between your target frequencies.',
    links: [
      { label: 'Wikipedia: Mathematical Optimization', url: 'https://en.wikipedia.org/wiki/Mathematical_optimization' },
    ],
  },

  // === PARAMETER / ITEM TOOLTIPS (variant="item") ===
  'param:fs': {
    title: 'Fs — Free-Air Resonance Frequency',
    body: 'The frequency at which the moving mass (Mms) and suspension compliance (Cms) resonate in free air without an enclosure. Impedance reaches its primary peak at Fs.',
    formula: 'Fs = 1 / (2π · √(Mms · Cms))',
    links: [{ label: 'Wikipedia: Thiele/Small (Fs)', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters#Small_signal_parameters' }],
  },
  'param:re': {
    title: 'Re — DC Voice Coil Resistance',
    body: 'The pure DC resistance of the voice coil winding measured with an ohmmeter (typically 15–25% lower than the nominal impedance Z_nom, e.g., ~6.2 Ω for an 8 Ω driver).',
    links: [{ label: 'Wikipedia: Voice Coil Resistance', url: 'https://en.wikipedia.org/wiki/Electrical_characteristics_of_dynamic_loudspeakers' }],
  },
  'param:le': {
    title: 'Le — Voice Coil Inductance',
    body: 'Inductance of the voice coil in millihenries (mH). Causes impedance to rise with frequency (Z ≈ Re + jωLe), which can prevent passive low-pass filters from rolling off properly unless compensated with a Zobel network.',
    formula: 'C_zobel = Le / Re²   |   R_zobel = Re',
    links: [{ label: 'Wikipedia: Zobel Impedance Compensation', url: 'https://en.wikipedia.org/wiki/Zobel_network#Loudspeaker_drivers' }],
  },
  'param:qes': {
    title: 'Qes — Electrical Q Factor at Fs',
    body: 'Measures how strongly the magnet motor (Bl) damps cone motion at resonance. A lower Qes (< 0.35) indicates a strong magnet motor suited for vented or horn enclosures; higher Qes (> 0.5) suits sealed or open-baffle designs.',
    formula: 'Qes = (Re / Bl²) · √(Mms / Cms)',
    links: [{ label: 'Wikipedia: Thiele/Small (Qes)', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters#Qualitative_descriptions' }],
  },
  'param:qms': {
    title: 'Qms — Mechanical Q Factor at Fs',
    body: 'Measures mechanical damping in the spider, surround, and voice coil former at resonance. Higher Qms (3–10) means lower mechanical friction losses.',
    formula: 'Qms = √(Mms / Cms) / Rms',
    links: [{ label: 'Wikipedia: Thiele/Small (Qms)', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters#Small_signal_parameters' }],
  },
  'param:qts': {
    title: 'Qts — Total Driver Q Factor at Fs',
    body: 'Combined electrical and mechanical damping at resonance. Qts < 0.4 favors vented/horn enclosures; Qts 0.4–0.6 works well in sealed or vented boxes; Qts > 0.7 suits infinite-baffle or open-baffle designs.',
    formula: 'Qts = (Qes · Qms) / (Qes + Qms)',
    links: [{ label: 'Wikipedia: Thiele/Small (Qts)', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters#Small_signal_parameters' }],
  },
  'param:vas': {
    title: 'Vas — Equivalent Compliance Volume',
    body: 'The volume of air (in Liters) that has the same acoustic stiffness as the driver suspension when acted upon by a piston of area Sd. Larger Vas means a softer suspension or larger cone.',
    formula: 'Vas = Cms · Sd² · ρ₀ · c²',
    links: [{ label: 'Wikipedia: Thiele/Small (Vas)', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters#Small_signal_parameters' }],
  },
  'param:sd': {
    title: 'Sd — Effective Radiating Piston Area',
    body: 'Effective surface area of the cone (cm²), measured to halfway across the rubber surround. Determines air volume displacement (Vd = Sd × Xmax) and high-frequency beaming directivity.',
    formula: 'Sd = π · (D_eff / 2)²',
    links: [{ label: 'Wikipedia: Thiele/Small (Sd)', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters#Large_signal_parameters' }],
  },
  'param:xmax': {
    title: 'Xmax — Maximum Linear One-Way Excursion',
    body: 'Maximum distance (mm) the cone can travel in one direction before the voice coil leaves the uniform magnetic gap and distortion rises rapidly (~10% THD).',
    formula: 'Vd = Sd · Xmax',
    links: [{ label: 'Wikipedia: Excursion (Xmax)', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters#Large_signal_parameters' }],
  },
  'param:bl': {
    title: 'Bl — Electrodynamic Force Factor (Motor Strength)',
    body: 'Product of magnetic flux density (B) in the gap and submerged voice-coil wire length (l) in Tesla-meters (T·m or N/A). F = B·l·I.',
    formula: 'Bl = √(Re · 2π·Fs · Mms / Qes)',
    links: [{ label: 'Wikipedia: Force Factor (Bl)', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters#Fundamental_mechanical_parameters' }],
  },
  'param:mms': {
    title: 'Mms — Total Moving Mass',
    body: 'Total mass (grams) of the cone, voice coil, former, half the surround/spider, plus the acoustic air radiation mass load (Mmr). Heavier Mms lowers Fs and sensitivity.',
    formula: 'Mms = 1 / ((2π·Fs)² · Cms)',
    links: [{ label: 'Wikipedia: Moving Mass (Mms)', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters#Fundamental_mechanical_parameters' }],
  },
  'param:cms': {
    title: 'Cms — Mechanical Suspension Compliance',
    body: 'Softness of the spider and surround (mm/N), the inverse of mechanical stiffness Kms (N/mm). Higher Cms lowers Fs and increases Vas.',
    formula: 'Cms = 1 / Kms = Vas / (ρ₀ · c² · Sd²)',
    links: [{ label: 'Wikipedia: Compliance (Cms)', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters#Fundamental_mechanical_parameters' }],
  },
  'param:rms': {
    title: 'Rms — Mechanical Suspension Loss Resistance',
    body: 'Viscous mechanical damping in the spider and surround (kg/s or N·s/m). Controls the height of the impedance peak at Fs.',
    formula: 'Rms = (2π · Fs · Mms) / Qms',
    links: [{ label: 'Wikipedia: Mechanical Resistance (Rms)', url: 'https://en.wikipedia.org/wiki/Thiele/Small_parameters#Fundamental_mechanical_parameters' }],
  },
  'param:ke': {
    title: 'Ke — Eddy-Current Semi-Inductance Loss (Knudsen)',
    body: 'Models frequency-dependent eddy currents in the iron pole piece where impedance rises at 3 dB/octave (√ω) rather than 6 dB/octave.',
    links: [{ label: 'Klippel: Voice Coil Inductance Modeling', url: 'https://www.klippel.de/know-how/literature.html' }],
  },
  'param:ebp': {
    title: 'EBP — Efficiency Bandwidth Product',
    body: 'Rule-of-thumb indicator for enclosure selection: EBP = Fs / Qes. EBP ≤ 50 favors Sealed boxes; EBP 50–90 works in Sealed or Vented; EBP ≥ 90 favors Vented, Horn, or Bandpass.',
    formula: 'EBP = Fs / Qes',
    links: [{ label: 'AudioJudgement: EBP Calculation', url: 'https://audiojudgement.com/thiele-small-parameters-explained/' }],
  },
  'param:qtc': {
    title: 'Qtc — Sealed Box Total System Q',
    body: 'Determines bass damping and impulse ring of a sealed enclosure: Qtc = 0.50 (critically damped, zero overshoot), Qtc = 0.577 (Bessel, maximally flat group delay), Qtc = 0.707 (Butterworth, maximally flat SPL), Qtc > 0.9 (underdamped bass peak).',
    formula: 'Qtc = Qts · √(1 + Vas / Vb)   |   Fc = Fs · √(1 + Vas / Vb)',
    links: [{ label: 'Wikipedia: Closed-Box Loudspeaker (Qtc)', url: 'https://en.wikipedia.org/wiki/Loudspeaker_enclosure#Closed-box_(sealed)_enclosures' }],
  },
  'param:fb': {
    title: 'Fb — Helmholtz Port Tuning Frequency',
    body: 'Resonant frequency of the air mass in the port coupled with the air spring inside the cabinet. At Fb, the port radiates almost all acoustic output and cone excursion drops to a minimum.',
    formula: 'Fb = (c / 2π) · √(S_port / (V_box · L_eff))',
    links: [{ label: 'Wikipedia: Bass Reflex & Helmholtz Resonance', url: 'https://en.wikipedia.org/wiki/Bass_reflex' }],
  },
  'param:ql': {
    title: 'Ql — Enclosure Leakage & Absorption Loss Q',
    body: 'Accounts for acoustic energy absorbed by cabinet walls, damping wool, and air leaks. Ql = 7 is typical for a well-built stuffed box; Ql = 3 is heavily damped; Ql ≥ 15 is an unlined rigid box.',
    links: [{ label: 'Wikipedia: Bass Reflex Enclosure Losses', url: 'https://en.wikipedia.org/wiki/Bass_reflex' }],
  },
  'param:baffle-step': {
    title: 'f_bsc — Baffle Step Diffraction Frequency',
    body: 'Below f_bsc, sound wavelengths wrap around the cabinet into full space (4π steradians). Above f_bsc, the front baffle reflects sound forward into half space (2π), causing up to a +6 dB shelf rise (~4.5 dB in typical rooms).',
    formula: 'f_bsc ≈ 115 / W_baffle(m)',
    links: [
      { label: 'Linkwitz Lab: Baffle Step Diffraction', url: 'https://www.linkwitzlab.com/diffraction.htm' },
      { label: 'Rod Elliott (ESP): Baffle Step Compensation', url: 'https://sound-au.com/bafflestep.htm' },
    ],
  },
};

/**
 * Automatically match a label or raw tooltip string to an entry in ACOUSTIC_KNOWLEDGE_BASE
 * so existing NumericInputs get rich explanations + authoritative links automatically.
 */
export function resolveKnowledgeEntry(label?: string, docKey?: string): RichTooltipEntry | undefined {
  if (docKey && ACOUSTIC_KNOWLEDGE_BASE[docKey]) {
    return ACOUSTIC_KNOWLEDGE_BASE[docKey];
  }
  if (!label) return undefined;
  const norm = label.trim().toLowerCase();
  if (norm === 'fs') return ACOUSTIC_KNOWLEDGE_BASE['param:fs'];
  if (norm === 're') return ACOUSTIC_KNOWLEDGE_BASE['param:re'];
  if (norm === 'le') return ACOUSTIC_KNOWLEDGE_BASE['param:le'];
  if (norm === 'qes') return ACOUSTIC_KNOWLEDGE_BASE['param:qes'];
  if (norm === 'qms') return ACOUSTIC_KNOWLEDGE_BASE['param:qms'];
  if (norm === 'vas') return ACOUSTIC_KNOWLEDGE_BASE['param:vas'];
  if (norm === 'sd') return ACOUSTIC_KNOWLEDGE_BASE['param:sd'];
  if (norm === 'xmax') return ACOUSTIC_KNOWLEDGE_BASE['param:xmax'];
  if (norm.startsWith('bl')) return ACOUSTIC_KNOWLEDGE_BASE['param:bl'];
  if (norm.startsWith('mms')) return ACOUSTIC_KNOWLEDGE_BASE['param:mms'];
  if (norm.startsWith('cms')) return ACOUSTIC_KNOWLEDGE_BASE['param:cms'];
  if (norm.startsWith('rms')) return ACOUSTIC_KNOWLEDGE_BASE['param:rms'];
  if (norm.startsWith('ke')) return ACOUSTIC_KNOWLEDGE_BASE['param:ke'];
  if (norm === 'ql' || norm.endsWith('ql')) return ACOUSTIC_KNOWLEDGE_BASE['param:ql'];
  if (norm.includes('target fb')) return ACOUSTIC_KNOWLEDGE_BASE['param:fb'];
  if (norm.includes('width (w)')) return ACOUSTIC_KNOWLEDGE_BASE['param:baffle-step'];
  return undefined;
}

interface InfoTooltipProps {
  /** Visual style: 'section' uses the distinct indigo/teal header background; 'item' uses the dark slate/amber parameter background */
  variant?: 'section' | 'item';
  /** Key in ACOUSTIC_KNOWLEDGE_BASE */
  docKey?: string;
  /** Optional explicit title */
  title?: string;
  /** Primary explanation text */
  text?: string;
  /** Optional equation / formula */
  formula?: string;
  /** Optional authoritative reference links */
  links?: TooltipLink[];
  /** Optional custom trigger element (defaults to a subtle '?' icon badge) */
  children?: ReactNode;
}

export function InfoTooltip({
  variant = 'item',
  docKey,
  title,
  text,
  formula,
  links,
  children,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: 'bottom' | 'top' }>({
    top: 0,
    left: 0,
    placement: 'bottom',
  });
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const kb = docKey ? ACOUSTIC_KNOWLEDGE_BASE[docKey] : undefined;
  const resolvedTitle = title ?? kb?.title;
  const resolvedBody = text ?? kb?.body ?? '';
  const resolvedFormula = formula ?? kb?.formula;
  const resolvedLinks = links ?? kb?.links ?? [];

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 310;
    const estHeight = 150;
    const pad = 10;

    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(pad, Math.min(window.innerWidth - tooltipWidth - pad, left));

    const spaceBelow = window.innerHeight - rect.bottom;
    const placement: 'bottom' | 'top' = spaceBelow < estHeight && rect.top > estHeight ? 'top' : 'bottom';
    const top = placement === 'bottom' ? rect.bottom + 6 : rect.top - 6;

    setCoords({ top, left, placement });
  };

  const handleOpen = () => {
    clearCloseTimer();
    updatePosition();
    setOpen(true);
  };

  const handleScheduledClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 220);
  };

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  if (!resolvedBody && !resolvedTitle) return null;

  return (
    <>
      <span
        ref={triggerRef}
        className={`info-tooltip-trigger ${variant === 'section' ? 'info-tooltip-trigger-section' : 'info-tooltip-trigger-item'}`}
        onMouseEnter={handleOpen}
        onMouseLeave={handleScheduledClose}
        onFocus={handleOpen}
        onBlur={handleScheduledClose}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else handleOpen();
        }}
        role="button"
        tabIndex={0}
        aria-label={resolvedTitle || 'More information'}
      >
        {children ?? '?'}
      </span>

      {open &&
        createPortal(
          <div
            className={`info-tooltip-popover ${
              variant === 'section' ? 'info-tooltip-popover-section' : 'info-tooltip-popover-item'
            }`}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: coords.placement === 'top' ? 'translateY(-100%)' : undefined,
              zIndex: 9999,
            }}
            onMouseEnter={clearCloseTimer}
            onMouseLeave={handleScheduledClose}
            onClick={(e) => e.stopPropagation()}
            role="tooltip"
          >
            <div className="info-tooltip-badge-row">
              <span className="info-tooltip-kind-badge">
                {variant === 'section' ? 'SECTION OVERVIEW' : 'PARAMETER GUIDE'}
              </span>
            </div>
            {resolvedTitle && <div className="info-tooltip-title">{resolvedTitle}</div>}
            <div className="info-tooltip-body">{resolvedBody}</div>
            {resolvedFormula && <div className="info-tooltip-formula">{resolvedFormula}</div>}
            {resolvedLinks.length > 0 && (
              <div className="info-tooltip-links">
                <span className="info-tooltip-links-label">Learn more:</span>
                {resolvedLinks.map((lnk, i) => (
                  <a
                    key={i}
                    href={lnk.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="info-tooltip-link"
                  >
                    {lnk.label} ↗
                  </a>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

