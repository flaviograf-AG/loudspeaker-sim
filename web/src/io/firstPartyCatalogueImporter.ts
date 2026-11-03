/**
 * First-Party Loudspeaker Driver Catalogue Importer, Multi-Format Parser Suite,
 * Mathematical Screening Engine, and Source-Precedence Reconciler across 23 Manufacturers.
 *
 * Extends the existing `driverBaseImporter.ts` validation pipeline and reconciles
 * first-party manufacturer specifications (JSON API, XLSX comparison workbooks,
 * labelled HTML product pages, and PDF datasheets) against eligible third-party
 * (`driver-base` CC BY 4.0) records without counting the same physical driver twice.
 */

import {
  validateDriverBaseRecord,
  toDriverDbEntry,
  type DriverValidationRecord,
  type RawDriverBaseRecord,
  type ValidationOptions,
} from './driverBaseImporter';
import type { DriverDbEntry } from '../presets/drivers_db';

export type DriverCategoryType =
  | 'lf_woofer'
  | 'midwoofer'
  | 'midrange'
  | 'fullrange'
  | 'coax_lf'
  | 'coax_hf'
  | 'subwoofer'
  | 'guitar_bass'
  | 'tweeter'
  | 'tweeter_amt'
  | 'hf_compression'
  | 'passive_radiator';

export type MeasurementCondition =
  | 'standard'
  | 'broken_in'
  | 'before_burn_in'
  | 'after_burn_in';

export type SourceTier = 'first_party' | 'third_party_driver_base';

export type DiscoveryRouteStatus = 'live-run' | 'cached/fixture' | 'blocked' | 'partial';

export type SourcePrecedenceOutcome =
  | 'official_preferred_valid'
  | 'official_promoted_fixing_third_party'
  | 'third_party_fallback_official_quarantined'
  | 'no_eligible_simulation_set'
  | 'official_preferred_unverified'
  | 'first_party_only_valid'
  | 'first_party_only_quarantined'
  | 'first_party_only_unverified'
  | 'first_party_catalogue_only'
  | 'third_party_only_valid'
  | 'third_party_only_quarantined'
  | 'third_party_only_unverified';

export interface FieldProvenance {
  raw_value: unknown;
  raw_unit: string;
  normalized_value: number | null;
  normalized_unit: string;
  evidence_location: string;
  derived?: boolean;
  unit_conflict_note?: string;
}

export interface SourceParameterSet {
  set_id: string;
  source_tier: SourceTier;
  source_name: string;
  source_url: string;
  retrieved_at: string;
  snapshot_sha256: string;
  revision?: string;
  license_note: string;
  measurement_condition: MeasurementCondition;
  driver_type: DriverCategoryType;
  nominal_impedance_ohm: number | null;
  coil_wiring?: 'single' | 'dual_series' | 'dual_parallel' | 'coaxial_lf' | 'coaxial_hf';
  recommended_enclosure_volume_liters?: number | null;
  xmax_one_way_mm?: number | null;
  xvar_or_xlim_mm?: number | null;
  xdamage_p2p_mm?: number | null;
  vd_cm3?: number | null;
  mmd_g?: number | null;
  sensitivity_db_1w_1m?: number | null;
  sensitivity_db_2_83v_1m?: number | null;
  effective_area_cm2?: number | null;
  recommended_crossover_hz?: number | null;
  advanced_parameters?: Record<string, number | string>;
  unit_conflict_flags: string[];
  provenance_by_field: Record<string, FieldProvenance>;
  raw_record: RawDriverBaseRecord;
  validation: DriverValidationRecord;
  catalogue_only: boolean;
  simulator_eligible: boolean;
}

export interface ConditionResolution {
  condition: MeasurementCondition;
  precedence_outcome: SourcePrecedenceOutcome;
  reason: string;
  selected_set: SourceParameterSet | null;
  official_set?: SourceParameterSet;
  third_party_set?: SourceParameterSet;
  disagreements?: Array<{
    field: string;
    official_value: number | null;
    third_party_value: number | null;
    diff_pct: number;
  }>;
}

export interface CanonicalDriverVariant {
  canonical_variant_id: string;
  manufacturer: string;
  model: string;
  part_number?: string;
  commercial_designation?: string;
  aliases: string[];
  nominal_impedance_ohm: number | null;
  component: 'LF' | 'HF' | 'FULL';
  driver_type: DriverCategoryType;
  lifecycle_status: 'active' | 'archived_historical';
  catalogue_only: boolean;
  simulator_eligible: boolean;
  primary_condition: MeasurementCondition;
  resolutions_by_condition: Record<string, ConditionResolution>;
  selected_simulation_entry?: DriverDbEntry;
}

export interface ManufacturerStageReport {
  manufacturer_key: string;
  manufacturer_name: string;
  discovery_route: string;
  status: DiscoveryRouteStatus;
  status_note?: string;
  license_policy: string;
  counts: {
    unique_product_pages: number;
    source_skus: number;
    first_party_parsed: number;
    third_party_reconciled: number;
    parse_failed: number;
    validated_accept: number;
    quarantined: number;
    unverified: number;
    catalogue_only: number;
    simulator_eligible: number;
    net_new_canonical_variants: number;
    enriched_existing_variants: number;
    promoted_from_third_party_quarantine: number;
    flagged_for_review: number;
  };
}

export interface CatalogueImportSummary {
  generated_at: string;
  tolerance_pct: number;
  review_threshold_pct: number;
  second_run_duplicates: number;
  totals: {
    manufacturers_count: number;
    total_canonical_variants: number;
    first_party_parsed_sets: number;
    third_party_reconciled_sets: number;
    validated_accept: number;
    quarantined: number;
    unverified: number;
    catalogue_only: number;
    simulator_eligible: number;
    net_new_canonical_variants: number;
    enriched_existing_variants: number;
    promoted_from_third_party_quarantine: number;
  };
  manufacturer_reports: ManufacturerStageReport[];
  ambiguous_identity_matches: Array<{
    manufacturer: string;
    first_party_model: string;
    candidate_third_party_model: string;
    reason: string;
  }>;
  unresolved_conflicts: Array<{
    canonical_variant_id: string;
    manufacturer: string;
    model: string;
    conflict_type: string;
    details: string;
  }>;
  reproducible_Readout_examples: Record<string, unknown>;
}

/**
 * Determine whether a driver category is eligible for lumped-element woofer/enclosure simulation
 * vs catalogue-only (tweeters, AMT ribbons, HF compression drivers, passive radiators).
 */
export function isCategoryCatalogueOnly(driverType: DriverCategoryType): boolean {
  return (
    driverType === 'tweeter' ||
    driverType === 'tweeter_amt' ||
    driverType === 'hf_compression' ||
    driverType === 'coax_hf' ||
    driverType === 'passive_radiator'
  );
}

/**
 * Normalize a manufacturer + model + impedance + component + lifecycle into a deterministic canonical key.
 */
export function buildCanonicalVariantId(params: {
  manufacturerKey: string;
  model: string;
  nominalImpedanceOhm?: number | null;
  component?: 'LF' | 'HF' | 'FULL';
  lifecycleStatus?: 'active' | 'archived_historical';
}): string {
  const mfg = params.manufacturerKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  // Normalize known alias PTT6.5X04-NFA-01 -> PTT6.5W04-01
  let rawModel = params.model.trim();
  if (mfg === 'purifi' && rawModel.toUpperCase() === 'PTT6.5X04-NFA-01') {
    rawModel = 'PTT6.5W04-01';
  }
  const mod = rawModel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const imp =
    params.nominalImpedanceOhm != null && Number.isFinite(params.nominalImpedanceOhm)
      ? `${params.nominalImpedanceOhm}ohm`
      : 'unk_ohm';
  const comp = params.component && params.component !== 'FULL' ? `__${params.component.toLowerCase()}` : '';
  const arch = params.lifecycleStatus === 'archived_historical' ? '__archived' : '';
  return `${mfg}__${mod}__${imp}${comp}${arch}`;
}

/**
 * Evaluate a SourceParameterSet using the 6-equation SI validator and type-specific rules.
 */
export function evaluateSourceParameterSet(
  input: Omit<SourceParameterSet, 'validation' | 'catalogue_only' | 'simulator_eligible'>,
  options: ValidationOptions = {}
): SourceParameterSet {
  const validation = validateDriverBaseRecord(input.raw_record, options);
  const catalogue_only = isCategoryCatalogueOnly(input.driver_type);
  const simulator_eligible = !catalogue_only && validation.simulation_ready;

  return {
    ...input,
    validation,
    catalogue_only,
    simulator_eligible,
  };
}

/**
 * Apply the 4-way Source Precedence Rules between an official first-party set and a third-party set
 * for the exact same canonical variant and measurement condition:
 *
 * 1. Official passes (`ACCEPT`) and third-party passes (`ACCEPT`) -> Official wins (`official_preferred_valid`),
 *    logging any parameter disagreements (>1%).
 * 2. Official passes (`ACCEPT`) and third-party was `QUARANTINE` -> Official wins and promotes the variant
 *    (`official_promoted_fixing_third_party`), preserving third-party failure evidence.
 * 3. Official fails (`QUARANTINE`) after units/variant are confirmed, and third-party passes (`ACCEPT`)
 *    for the exact variant and condition -> Third-party fallback is selected (`third_party_fallback_official_quarantined`),
 *    keeping the official quarantined set for diagnosis.
 * 4. Official fails (`QUARANTINE`) and no eligible passing third-party fallback -> No simulation set
 *    (`no_eligible_simulation_set`); variant remains quarantined/catalogue-only.
 * 5. Official lacks independent checks (`UNVERIFIED`) -> Official stays preferred `UNVERIFIED`
 *    (`official_preferred_unverified`); third-party values do NOT automatically override it or promote it to simulation-ready.
 */
export function resolveSourcePrecedence(
  condition: MeasurementCondition,
  officialSet?: SourceParameterSet,
  thirdPartySet?: SourceParameterSet
): ConditionResolution {
  const compareFields = [
    'fs_hz',
    're_ohm',
    'qms',
    'qes',
    'qts',
    'vas_liters',
    'sd_cm2',
    'mms_g',
    'cms_mm_per_n',
    'rms_ns_per_m',
    'bl_tm',
    'le_mh',
    'xmax_mm',
  ];

  const computeDisagreements = (off: SourceParameterSet, tp: SourceParameterSet) => {
    const diffs: NonNullable<ConditionResolution['disagreements']> = [];
    for (const f of compareFields) {
      const ov = typeof off.raw_record[f] === 'number' ? (off.raw_record[f] as number) : null;
      const tv = typeof tp.raw_record[f] === 'number' ? (tp.raw_record[f] as number) : null;
      if (ov != null && tv != null && tv !== 0) {
        const diff_pct = Number(((100 * Math.abs(ov - tv)) / Math.abs(tv)).toFixed(2));
        if (diff_pct > 1.0) {
          diffs.push({ field: f, official_value: ov, third_party_value: tv, diff_pct });
        }
      }
    }
    return diffs;
  };

  if (officialSet && thirdPartySet) {
    const disagreements = computeDisagreements(officialSet, thirdPartySet);
    if (officialSet.catalogue_only) {
      return {
        condition,
        precedence_outcome: 'first_party_catalogue_only',
        reason: 'Driver type is catalogue-only (HF/AMT/passive radiator); official first-party specs retained without woofer simulation.',
        selected_set: officialSet,
        official_set: officialSet,
        third_party_set: thirdPartySet,
        disagreements,
      };
    }

    if (officialSet.validation.status === 'ACCEPT') {
      if (thirdPartySet.validation.status === 'QUARANTINE') {
        return {
          condition,
          precedence_outcome: 'official_promoted_fixing_third_party',
          reason:
            'Official first-party specification passed mathematical screening and corrected a quarantined third-party record; third-party evidence preserved.',
          selected_set: officialSet,
          official_set: officialSet,
          third_party_set: thirdPartySet,
          disagreements,
        };
      }
      return {
        condition,
        precedence_outcome: 'official_preferred_valid',
        reason:
          'Official first-party specification passed mathematical screening and takes precedence over third-party dataset.',
        selected_set: officialSet,
        official_set: officialSet,
        third_party_set: thirdPartySet,
        disagreements,
      };
    }

    if (officialSet.validation.status === 'UNVERIFIED') {
      return {
        condition,
        precedence_outcome: 'official_preferred_unverified',
        reason:
          'Official first-party specification has no independent consistency checks (UNVERIFIED); third-party values do not automatically override or promote it.',
        selected_set: officialSet,
        official_set: officialSet,
        third_party_set: thirdPartySet,
        disagreements,
      };
    }

    // Official is QUARANTINE
    if (thirdPartySet.validation.status === 'ACCEPT' && thirdPartySet.simulator_eligible) {
      return {
        condition,
        precedence_outcome: 'third_party_fallback_official_quarantined',
        reason:
          'Official first-party set failed mathematical screening (>10% error or invalid field); verified third-party set for exact variant/condition selected as fallback while preserving official quarantined record.',
        selected_set: thirdPartySet,
        official_set: officialSet,
        third_party_set: thirdPartySet,
        disagreements,
      };
    }

    return {
      condition,
      precedence_outcome: 'no_eligible_simulation_set',
      reason:
        'Official first-party set failed mathematical screening and no passing third-party fallback exists for this exact variant and condition.',
      selected_set: null,
      official_set: officialSet,
      third_party_set: thirdPartySet,
      disagreements,
    };
  }

  if (officialSet) {
    if (officialSet.catalogue_only) {
      return {
        condition,
        precedence_outcome: 'first_party_catalogue_only',
        reason: 'Catalogue-only driver type (HF/AMT/passive radiator) from official first-party source.',
        selected_set: officialSet,
        official_set: officialSet,
      };
    }
    if (officialSet.validation.status === 'ACCEPT') {
      return {
        condition,
        precedence_outcome: 'first_party_only_valid',
        reason: 'Official first-party specification passed mathematical screening (net-new variant not in third-party dataset).',
        selected_set: officialSet,
        official_set: officialSet,
      };
    }
    if (officialSet.validation.status === 'UNVERIFIED') {
      return {
        condition,
        precedence_outcome: 'first_party_only_unverified',
        reason: 'Official first-party specification has insufficient parameters for an independent check (UNVERIFIED).',
        selected_set: officialSet,
        official_set: officialSet,
      };
    }
    return {
      condition,
      precedence_outcome: 'first_party_only_quarantined',
      reason: 'Official first-party specification failed mathematical screening (QUARANTINE) and no third-party fallback exists.',
      selected_set: null,
      official_set: officialSet,
    };
  }

  if (thirdPartySet) {
    if (thirdPartySet.validation.status === 'ACCEPT') {
      return {
        condition,
        precedence_outcome: 'third_party_only_valid',
        reason: 'Verified third-party specification (CC BY 4.0 driver-base) passed mathematical screening.',
        selected_set: thirdPartySet,
        third_party_set: thirdPartySet,
      };
    }
    if (thirdPartySet.validation.status === 'UNVERIFIED') {
      return {
        condition,
        precedence_outcome: 'third_party_only_unverified',
        reason: 'Third-party specification lacks independent consistency checks (UNVERIFIED).',
        selected_set: thirdPartySet,
        third_party_set: thirdPartySet,
      };
    }
    return {
      condition,
      precedence_outcome: 'third_party_only_quarantined',
      reason: 'Third-party specification failed mathematical screening (QUARANTINE).',
      selected_set: null,
      third_party_set: thirdPartySet,
    };
  }

  return {
    condition,
    precedence_outcome: 'no_eligible_simulation_set',
    reason: 'No parameter sets available.',
    selected_set: null,
  };
}

/**
 * Atomic per-manufacturer staging state:
 * If staging a manufacturer's snapshot throws or produces 0 records unexpectedly,
 * the previous good manufacturer stage is preserved untouched.
 */
export interface CatalogueDatabaseState {
  variants_by_id: Map<string, CanonicalDriverVariant>;
  simulation_ready_by_id: Map<string, DriverDbEntry>;
  manufacturer_stages: Map<string, { variants: CanonicalDriverVariant[]; report: ManufacturerStageReport }>;
}

export function stageManufacturerAtomically(
  currentState: CatalogueDatabaseState,
  manufacturerKey: string,
  stageProducer: () => { variants: CanonicalDriverVariant[]; report: ManufacturerStageReport }
): { updated: boolean; error?: string; state: CatalogueDatabaseState } {
  try {
    const produced = stageProducer();
    if (!produced || !Array.isArray(produced.variants) || produced.variants.length === 0) {
      throw new Error(`Stage for manufacturer "${manufacturerKey}" produced 0 variants`);
    }

    const nextStages = new Map(currentState.manufacturer_stages);
    nextStages.set(manufacturerKey, produced);

    const nextVariants = new Map<string, CanonicalDriverVariant>();
    const nextSimReady = new Map<string, DriverDbEntry>();

    for (const stage of nextStages.values()) {
      for (const v of stage.variants) {
        if (nextVariants.has(v.canonical_variant_id)) {
          continue; // Idempotent deduplication by canonical_variant_id
        }
        nextVariants.set(v.canonical_variant_id, v);
        if (v.simulator_eligible && v.selected_simulation_entry) {
          nextSimReady.set(v.canonical_variant_id, v.selected_simulation_entry);
        }
      }
    }

    return {
      updated: true,
      state: {
        variants_by_id: nextVariants,
        simulation_ready_by_id: nextSimReady,
        manufacturer_stages: nextStages,
      },
    };
  } catch (err) {
    return {
      updated: false,
      error: err instanceof Error ? err.message : String(err),
      state: currentState,
    };
  }
}

export { validateDriverBaseRecord, toDriverDbEntry };
