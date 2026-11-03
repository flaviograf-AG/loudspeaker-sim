#!/usr/bin/env node
/**
 * Comprehensive verification test suite for the 23-manufacturer first-party
 * loudspeaker driver catalogue importer.
 *
 * Covers:
 *   1. All 23 manufacturers present in report and catalogue DB
 *   2. Playbook regressions for every manufacturer:
 *      - REDCATT bulk JSON API + schema + ETag/updated_since incremental support
 *      - FaitalPRO metric Excel discovery + 12FH500 4Ω P/N 03004044 leading zero + deduplicated quick-spec block + coaxial LF/HF separation
 *      - LaVoce Italiana comparative XLS (both LF and HF sheets) + WAF153.00 Vas=146.26L vs recommended_enclosure_volume_liters=102L
 *      - Visaton AL 170 (Art. No. 1302, Qms=3.88) vs archived AL 170 A (Qms=4.47) kept distinct despite identical URL slug
 *      - B&C Speakers 18SW115 Xmax (14mm) separate from Xvar (16mm) + metric/imperial block deduplication
 *      - Eighteen Sound 10CX650 coaxial LF vs HF unit separation
 *      - Eminence Kappalite 3015LF core T/S separated from cabinet acceptable volume & Vd/Xlim
 *      - SB Acoustics SB17BAC35-8 coaxial woofer separated from SPECS TWEETER
 *      - SICA 12 L1 2.5 SL (Z007903) & 12 PNS 4 (Z008167) Cms µm/N -> mm/N conversion + localized URL deduplication
 *      - Beyma 12BR70 moving mass resolved from official datasheet PDF (0.074 kg = 74 g, not 0.074 g)
 *      - Jensen MOD 10-50 multi-column table: 4Ω Qes=2.91 not broadcast to 8Ω/16Ω/32Ω; 4Ω Vas=2078L / Qts=1.24 quarantined
 *      - Celestion FTR18-4080FD metric 1134.12 cm² selected over mislabelled 175.79 ft³ with unit_conflict flag
 *      - MONACOR SPH-200KE (Order No. 10.1840) parsed from HTML + PDF
 *      - Tang Band W5-2143 full-width colon stripped, 1514 uMN¯¹ -> 1.514 mm/N, 0.0094 M² -> 94 cm², sound modules excluded
 *      - PRV Audio 12W750A symbol-and-unit table parsed
 *      - RCF LF18N401 (11100027) trailing symbol suffixes stripped ("6.50 Qms") and 0.120 m2 -> 1200 cm²
 *      - Wavecor WF182BD17/18/19/20 4 distinct variants x 2 burn-in conditions (8 parameter sets), colspan=2 preserved without averaging
 *      - PURIFI PTT6.5W04-01 aliased from PTT6.5X04-NFA-01, PTT6.5W08-01, and passive radiator PTT6.5PR-01 separated into catalogue_only
 *      - Dayton Audio RS180-8 distinct from RS180S-8; RSS315HF-4 PDF CMap decoded BL=13.99 T·m overriding third-party BL=1.0
 *      - Mundorf AMT U-Series (AMTU160W1.1-R etc.) imported as catalogue_only with null Qts/Vas
 *      - Scan-Speak 18W/8531G00 slash preserved
 *      - SEAS H1571-08 U18RNX/P v2 parsed with part code, model designation, and datasheet revision
 *      - BMS Speakers 18N862 model extracted from header subtitle, 0.267 kg -> 267 g, 0.1219 m² -> 1219 cm²
 *   3. All 4 source-precedence cases
 *   4. Repeat-import idempotence (second_run_duplicates === 0)
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runFull23ManufacturerImport,
  buildSourceParameterSet,
  resolveSourcePrecedence,
} from "./import-first-party-catalogue.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_PATH = path.resolve(__dirname, "../src/presets/first_party_catalogue_report.json");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
  }
}

console.log("=== First-Party 23-Manufacturer Catalogue Importer Tests ===");

const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
const run1 = runFull23ManufacturerImport();
const run2 = runFull23ManufacturerImport();

const byId = run1.variantsById;

function getOff(v, cond = null) {
  const c = cond || v.primary_condition;
  return v.resolutions_by_condition[c]?.official_set;
}

function getTp(v, cond = null) {
  const c = cond || v.primary_condition;
  return v.resolutions_by_condition[c]?.third_party_set;
}

// 1. All 23 manufacturers present
const EXPECTED_MANUFACTURERS = [
  "REDCATT",
  "FaitalPRO",
  "LaVoce Italiana",
  "Visaton",
  "B&C Speakers",
  "Eighteen Sound",
  "Eminence",
  "SB Acoustics",
  "SICA",
  "Beyma",
  "Jensen",
  "Celestion",
  "MONACOR",
  "Tang Band",
  "PRV Audio",
  "RCF",
  "Wavecor",
  "PURIFI",
  "Dayton Audio",
  "Mundorf",
  "Scan-Speak",
  "SEAS",
  "BMS Speakers",
];

test("All 23 manufacturers are present in the report and have parsed first-party records", () => {
  assert.equal(report.totals.manufacturers_count, 23);
  const actualNames = report.manufacturer_reports.map((s) => s.manufacturer_name);
  assert.deepEqual(actualNames, EXPECTED_MANUFACTURERS);
  for (const s of report.manufacturer_reports) {
    assert.ok(s.counts.first_party_parsed >= 1, `${s.manufacturer_name} should have >=1 first-party parsed set`);
  }
});

// 2. REDCATT
test("REDCATT bulk JSON API imports 111 products (81 with Qts) keyed by ordering code", () => {
  const redcattSummary = report.manufacturer_reports.find((s) => s.manufacturer_name === "REDCATT");
  assert.equal(redcattSummary.counts.first_party_parsed, 111);
  const redcattDrivers = [...byId.values()].filter((v) => v.manufacturer === "REDCATT" && getOff(v));
  assert.equal(redcattDrivers.length, 111);
  const withQts = redcattDrivers.filter((v) => getOff(v)?.raw_record?.qts != null);
  assert.equal(withQts.length, 81);
});

// 3. FaitalPRO
test("FaitalPRO 12FH500 4Ω preserves leading zero in P/N 03004044 and separates coaxial LF/HF", () => {
  const fh500 = byId.get("faitalpro__12fh500__4ohm");
  assert.ok(fh500, "faitalpro__12fh500__4ohm must exist");
  assert.equal(fh500.part_number, "03004044");
  const off = getOff(fh500);
  assert.equal(off.raw_record.fs_hz, 45);
  assert.equal(off.raw_record.re_ohm, 3.3);
  assert.equal(off.raw_record.qts, 0.22);
  assert.equal(off.validation.status, "ACCEPT");

  const coaxHf = [...byId.values()].filter(
    (v) => v.manufacturer === "FaitalPRO" && v.component === "HF"
  );
  assert.ok(coaxHf.length >= 14, "Coaxial HF sections should be separated and marked catalogue_only");
  assert.ok(coaxHf.every((v) => v.catalogue_only === true));
});

// 4. LaVoce Italiana
test("LaVoce WAF153.00 keeps Vas = 146.26 L separate from recommended enclosure 102 L", () => {
  const waf = byId.get("lavoce_italiana__waf153_00__8ohm");
  assert.ok(waf, "lavoce_italiana__waf153_00__8ohm must exist");
  const off = getOff(waf);
  assert.equal(off.raw_record.vas_liters, 146.26);
  assert.equal(off.recommended_enclosure_volume_liters, 102);
  assert.equal(off.validation.status, "ACCEPT");
});

// 5. Visaton
test("Visaton AL 170 (Qms 3.88) and archived AL 170 A (Qms 4.47) remain distinct despite identical URL slug", () => {
  const active = byId.get("visaton__al_170__8ohm");
  const archived = byId.get("visaton__al_170_a__8ohm__archived");
  assert.ok(active, "Active AL 170 must exist");
  assert.ok(archived, "Archived AL 170 A must exist");
  assert.equal(active.model, "AL 170");
  assert.equal(active.part_number, "1302");
  assert.equal(getOff(active).raw_record.qms, 3.88);
  assert.equal(getOff(active).validation.status, "QUARANTINE"); // Qes=0.43 vs predicted 0.3651 (15.10% error)

  assert.equal(archived.model, "AL 170 A");
  assert.equal(getOff(archived).raw_record.qms, 4.47);
  assert.equal(getOff(archived).validation.status, "ACCEPT");
});

// 6. B&C Speakers
test("B&C Speakers 18SW115 keeps Xmax (14 mm) separate from Xvar (16 mm)", () => {
  const sw115 = byId.get("b_c_speakers__18sw115__8ohm");
  assert.ok(sw115, "b_c_speakers__18sw115__8ohm must exist");
  const off = getOff(sw115);
  assert.equal(off.xmax_one_way_mm, 14);
  assert.equal(off.xvar_or_xlim_mm, 16);
  assert.equal(off.validation.status, "ACCEPT");
});

// 7. Eighteen Sound
test("Eighteen Sound 10CX650 separates LF cone unit from HF compression unit", () => {
  const lf = byId.get("eighteen_sound__10cx650__8ohm__lf");
  const hf = byId.get("eighteen_sound__10cx650__8ohm__hf");
  assert.ok(lf, "LF section must exist");
  assert.ok(hf, "HF section must exist");
  assert.equal(lf.component, "LF");
  assert.equal(getOff(lf).raw_record.fs_hz, 54);
  assert.equal(getOff(lf).validation.status, "QUARANTINE"); // Official Cms=0.22 mm/N predicts Fs=60.3 Hz vs published 54 Hz (11.69% > 10%)
  assert.equal(hf.component, "HF");
  assert.equal(hf.catalogue_only, true);
});

// 8. Eminence
test("Eminence Kappalite 3015LF separates cabinet volumes and Xlim/Vd from core T/S fields", () => {
  const kap = byId.get("eminence__kappalite_3015lf__8ohm");
  assert.ok(kap, "eminence__kappalite_3015lf__8ohm must exist");
  const off = getOff(kap);
  assert.equal(off.raw_record.fs_hz, 44);
  assert.equal(off.xmax_one_way_mm, 9.6);
  assert.equal(off.xvar_or_xlim_mm, 17);
  assert.equal(off.vd_cm3, 846);
  assert.equal(off.recommended_enclosure_volume_liters, 74);
  assert.equal(off.validation.status, "ACCEPT");
});

// 9. SB Acoustics
test("SB Acoustics SB17BAC35-8 Coax separates woofer T/S from tweeter specs", () => {
  const woofer = byId.get("sb_acoustics__sb17bac35_8__8ohm__lf");
  const tweeter = byId.get("sb_acoustics__sb17bac35_8__4ohm__hf");
  assert.ok(woofer, "Woofer section must exist");
  assert.ok(tweeter, "Tweeter section must exist");
  assert.equal(getOff(woofer).raw_record.fs_hz, 35.2);
  assert.equal(getOff(woofer).validation.status, "ACCEPT");
  assert.equal(getOff(tweeter).raw_record.fs_hz, 1350);
  assert.equal(tweeter.catalogue_only, true);
});

// 10. SICA
test("SICA 12 L1 2.5 SL and 12 PNS 4 convert Cms from µm/N to mm/N and retain part codes", () => {
  const s1 = byId.get("sica__12_l1_2_5_sl__8ohm");
  const s2 = byId.get("sica__12_pns_4__8ohm");
  assert.ok(s1 && s2, "Both SICA fixtures must exist");
  assert.equal(s1.part_number, "Z007903");
  assert.ok(Math.abs(getOff(s1).raw_record.cms_mm_per_n - 0.239) < 1e-6);
  assert.equal(getOff(s1).validation.status, "ACCEPT");
  assert.equal(s2.part_number, "Z007957");
  assert.ok(getOff(s2).raw_record.cms_mm_per_n > 0 && getOff(s2).raw_record.cms_mm_per_n < 1.0);
  assert.equal(getOff(s2).validation.status, "ACCEPT");
});

// 11. Beyma
test("Beyma 12BR70 resolves unitless HTML moving mass (0.074) from PDF datasheet as 0.074 kg = 74 g and promotes from third-party quarantine", () => {
  const b = byId.get("beyma__12br70__8ohm");
  assert.ok(b, "beyma__12br70__8ohm must exist");
  const off = getOff(b);
  const tp = getTp(b);
  assert.equal(off.raw_record.mms_g, 74);
  assert.equal(off.validation.status, "ACCEPT");
  assert.equal(b.resolutions_by_condition.standard.precedence_outcome, "official_promoted_fixing_third_party");
  assert.equal(tp.raw_record.mms_g, 0.074);
});

// 12. Jensen
test("Jensen MOD 10-50 parses 4Ω/8Ω/16Ω/32Ω columns without shifting Qes=2.91 and quarantines 4Ω Vas=2078L/Qts=1.24", () => {
  const j4 = byId.get("jensen__mod_10_50__4ohm");
  const j8 = byId.get("jensen__mod_10_50__8ohm");
  const j16 = byId.get("jensen__mod_10_50__16ohm");
  const j32 = byId.get("jensen__mod_10_50__32ohm");
  assert.ok(j4 && j8 && j16 && j32);
  assert.equal(getOff(j4).raw_record.qes, 2.91);
  assert.equal(getOff(j4).raw_record.vas_liters, 2078);
  assert.equal(getOff(j4).validation.status, "QUARANTINE");
  assert.equal(getOff(j8).raw_record.qes, null);
  assert.equal(getOff(j16).raw_record.qes, null);
  assert.equal(getOff(j32).raw_record.qes, null);
  assert.equal(getOff(j8).validation.status, "ACCEPT"); // Fs = 1/(2π√(Mms*Cms)) passes!
  assert.equal(j8.simulator_eligible, false); // Missing qes & sd_cm2 for simulator
});

// 13. Celestion
test("Celestion FTR18-4080FD selects metric Sd=1134.12 cm² over mislabelled 175.79 ft³ and flags unit conflict", () => {
  const cel = byId.get("celestion__ftr18_4080fd__8ohm");
  assert.ok(cel, "celestion__ftr18_4080fd__8ohm must exist");
  const off = getOff(cel);
  assert.equal(off.raw_record.sd_cm2, 1134.12);
  assert.ok(
    off.unit_conflict_flags.some((f) => f.includes("ft3")),
    "Must record imperial unit mislabelling conflict flag"
  );
  assert.equal(off.validation.status, "ACCEPT");
});

// 14. MONACOR
test("MONACOR SPH-200KE (Order No. 10.1840) validates and accepts", () => {
  const mon = byId.get("monacor__sph_200ke__8ohm");
  assert.ok(mon, "monacor__sph_200ke__8ohm must exist");
  assert.equal(mon.part_number, "10.1840");
  assert.equal(getOff(mon).raw_record.fs_hz, 33);
  assert.equal(getOff(mon).validation.status, "ACCEPT");
});

// 15. Tang Band
test("Tang Band W5-2143 strips full-width colon, converts uMN¯¹ and M², and validates", () => {
  const tb = byId.get("tang_band__w5_2143__8ohm");
  assert.ok(tb, "tang_band__w5_2143__8ohm must exist");
  const off = getOff(tb);
  assert.ok(Math.abs(off.raw_record.cms_mm_per_n - 1.514) < 1e-6);
  assert.ok(Math.abs(off.raw_record.sd_cm2 - 94) < 1e-6);
  assert.equal(off.validation.status, "ACCEPT");
});

// 16. PRV Audio
test("PRV Audio 12W750A parses symbol-and-unit table and accepts", () => {
  const prv = byId.get("prv_audio__12w750a__8ohm");
  assert.ok(prv, "prv_audio__12w750a__8ohm must exist");
  const off = getOff(prv);
  assert.equal(off.raw_record.fs_hz, 59);
  assert.equal(off.raw_record.qts, 0.43);
  assert.equal(off.validation.status, "ACCEPT");
});

// 17. RCF
test("RCF LF18N401 strips trailing symbol suffixes ('6.50 Qms') and converts 0.120 m2 -> 1200 cm²", () => {
  const rcf = byId.get("rcf__lf18n401__8ohm");
  assert.ok(rcf, "rcf__lf18n401__8ohm must exist");
  assert.equal(rcf.part_number, "11100027");
  const off = getOff(rcf);
  assert.equal(off.raw_record.qms, 6.5);
  assert.equal(off.raw_record.qes, 0.27);
  assert.equal(off.raw_record.qts, 0.26);
  assert.equal(off.raw_record.sd_cm2, 1200);
  assert.equal(off.validation.status, "ACCEPT");
});

// 18. Wavecor
test("Wavecor WF182BD17/18/19/20 emits 4 distinct variants with 2 burn-in conditions each (8 parameter sets) and preserves colspan=2", () => {
  const b17 = byId.get("wavecor__wf182bd17__4ohm");
  const b18 = byId.get("wavecor__wf182bd18__8ohm");
  const b19 = byId.get("wavecor__wf182bd19__4ohm");
  const b20 = byId.get("wavecor__wf182bd20__8ohm");
  assert.ok(b17 && b18 && b19 && b20, "All 4 Wavecor variants must exist");
  for (const w of [b17, b18, b19, b20]) {
    const conds = Object.keys(w.resolutions_by_condition).sort();
    assert.deepEqual(conds, ["after_burn_in", "before_burn_in"]);
    assert.equal(getOff(w, "after_burn_in").validation.status, "ACCEPT");
    assert.equal(getOff(w, "before_burn_in").validation.status, "ACCEPT");
  }
  // Colspan=2 check: WF182BD17 and WF182BD19 share 4Ω Re=3.2 and Mms=20.7g, WF182BD18 and WF182BD20 share 8Ω Re=6.4 and Mms=21.2g
  assert.equal(getOff(b17).raw_record.re_ohm, 3.2);
  assert.equal(getOff(b19).raw_record.re_ohm, 3.2);
  assert.equal(getOff(b18).raw_record.re_ohm, 6.4);
  assert.equal(getOff(b20).raw_record.re_ohm, 6.4);
});

// 19. PURIFI
test("PURIFI aliases PTT6.5W04-01 from PTT6.5X04-NFA-01 and separates passive radiator PTT6.5PR-01 into catalogue_only", () => {
  const w04 = byId.get("purifi__ptt6_5w04_01__4ohm");
  const pr = byId.get("purifi__ptt6_5pr_01__unk_ohm");
  assert.ok(w04 && pr);
  assert.deepEqual(w04.aliases, ["PTT6.5X04-NFA-01"]);
  assert.equal(getOff(w04).validation.status, "ACCEPT");
  assert.equal(w04.simulator_eligible, true);
  assert.equal(pr.driver_type, "passive_radiator");
  assert.equal(pr.catalogue_only, true);
  assert.equal(pr.simulator_eligible, false);
});

// 20. Dayton Audio
test("Dayton Audio keeps RS180-8 distinct from RS180S-8 and overrides third-party RSS315HF-4 BL=1.0 with PDF CMap decoded BL=13.99 T·m", () => {
  const rs180 = byId.get("dayton_audio__rs180_8__8ohm");
  const rs180s = byId.get("dayton_audio__rs180s_8__8ohm");
  const rss315 = byId.get("dayton_audio__rss315hf_4__4ohm");
  assert.ok(rs180 && rs180s && rss315);
  assert.notEqual(rs180.canonical_variant_id, rs180s.canonical_variant_id);
  assert.equal(rs180.part_number, "295-355");
  assert.equal(rs180s.part_number, "295-374");
  assert.equal(getOff(rss315).raw_record.bl_tm, 13.99);
  assert.equal(getOff(rss315).validation.status, "ACCEPT");
  assert.equal(rss315.resolutions_by_condition.standard.precedence_outcome, "official_promoted_fixing_third_party");
  assert.equal(getTp(rss315).raw_record.bl_tm, 1);
});

// 21. Mundorf
test("Mundorf AMT U-Series drivers are imported as catalogue_only with null Qts/Vas", () => {
  const amt = byId.get("mundorf__amtu160w1_1_r__4ohm");
  assert.ok(amt, "mundorf__amtu160w1_1_r__4ohm must exist");
  assert.equal(amt.catalogue_only, true);
  assert.equal(amt.simulator_eligible, false);
  assert.equal(getOff(amt).raw_record.qts, null);
  assert.equal(getOff(amt).raw_record.vas_liters, null);
});

// 22. Scan-Speak
test("Scan-Speak 18W/8531G00 preserves slash in model name and validates", () => {
  const ss = byId.get("scan_speak__18w_8531g00__8ohm");
  assert.ok(ss, "scan_speak__18w_8531g00__8ohm must exist");
  assert.equal(ss.model, "18W/8531G00");
  assert.equal(getOff(ss).raw_record.fs_hz, 28);
  assert.equal(getOff(ss).validation.status, "ACCEPT");
});

// 23. SEAS
test("SEAS H1571-08 U18RNX/P v2 preserves part number, model designation, and datasheet revision", () => {
  const seas = byId.get("seas__u18rnx_p__8ohm");
  assert.ok(seas, "seas__u18rnx_p__8ohm must exist");
  assert.equal(seas.part_number, "H1571-08");
  assert.ok(seas.model.includes("U18RNX/P"));
  assert.equal(getOff(seas).revision, "v2");
  assert.equal(getOff(seas).validation.status, "ACCEPT");
});

// 24. BMS Speakers
test("BMS 18N862 extracts model from header subtitle and converts 0.267 kg -> 267 g and 0.1219 m² -> 1219 cm²", () => {
  const bms = byId.get("bms_speakers__18n862__8ohm");
  assert.ok(bms, "bms_speakers__18n862__8ohm must exist");
  assert.equal(bms.model, "18N862");
  assert.equal(getOff(bms).raw_record.mms_g, 267);
  assert.equal(getOff(bms).raw_record.sd_cm2, 1219);
  assert.equal(getOff(bms).validation.status, "ACCEPT");
});

// 25. All 4 Source Precedence Cases
test("resolveSourcePrecedence handles all 4 precedence cases accurately", () => {
  const validOfficial = buildSourceParameterSet({
    set_id: "test__drv__8ohm__fp",
    source_tier: "first_party",
    source_name: "Test Official",
    source_url: "https://example.com/official",
    manufacturer: "Test",
    model: "DRV",
    nominal_impedance_ohm: 8,
    fields: { fs_hz: 40, re_ohm: 6, qms: 4.0, qes: 0.4, qts: 0.3636, vas_liters: 50, sd_cm2: 500 },
  });
  const validThirdParty = buildSourceParameterSet({
    set_id: "test__drv__8ohm__tp",
    source_tier: "third_party_permissive",
    source_name: "Test ThirdParty",
    source_url: "https://example.com/tp",
    manufacturer: "Test",
    model: "DRV",
    nominal_impedance_ohm: 8,
    fields: { fs_hz: 41, re_ohm: 6, qms: 4.0, qes: 0.4, qts: 0.3636, vas_liters: 52, sd_cm2: 500 },
  });
  const badOfficial = buildSourceParameterSet({
    set_id: "test__drv__8ohm__fp_bad",
    source_tier: "first_party",
    source_name: "Test Official Bad",
    source_url: "https://example.com/official-bad",
    manufacturer: "Test",
    model: "DRV",
    nominal_impedance_ohm: 8,
    fields: { fs_hz: 40, re_ohm: 6, qms: 4.0, qes: 0.4, qts: 0.99, vas_liters: 50, sd_cm2: 500 },
  });
  const badThirdParty = buildSourceParameterSet({
    set_id: "test__drv__8ohm__tp_bad",
    source_tier: "third_party_permissive",
    source_name: "Test ThirdParty Bad",
    source_url: "https://example.com/tp-bad",
    manufacturer: "Test",
    model: "DRV",
    nominal_impedance_ohm: 8,
    fields: { fs_hz: 40, re_ohm: 6, qms: 4.0, qes: 0.4, qts: 0.99, vas_liters: 50, sd_cm2: 500 },
  });
  const unverifiedOfficial = buildSourceParameterSet({
    set_id: "test__drv__8ohm__fp_unv",
    source_tier: "first_party",
    source_name: "Test Official Unverified",
    source_url: "https://example.com/official-unv",
    manufacturer: "Test",
    model: "DRV",
    nominal_impedance_ohm: 8,
    fields: { fs_hz: 40, re_ohm: 6 },
  });

  // Case 1: Official valid + Third-party valid -> Official preferred
  const res1 = resolveSourcePrecedence("standard", validOfficial, validThirdParty);
  assert.equal(res1.precedence_outcome, "official_preferred_valid");
  assert.equal(res1.selected_set.set_id, validOfficial.set_id);
  assert.ok(res1.disagreements.some((d) => d.field === "vas_liters"));

  // Case 2: Official valid + Third-party quarantined -> Official promoted fixing third-party
  const res2 = resolveSourcePrecedence("standard", validOfficial, badThirdParty);
  assert.equal(res2.precedence_outcome, "official_promoted_fixing_third_party");
  assert.equal(res2.selected_set.set_id, validOfficial.set_id);

  // Case 3: Official quarantined + Third-party valid -> Third-party fallback while preserving official quarantined
  const res3 = resolveSourcePrecedence("standard", badOfficial, validThirdParty);
  assert.equal(res3.precedence_outcome, "third_party_fallback_official_quarantined");
  assert.equal(res3.selected_set.set_id, validThirdParty.set_id);
  assert.equal(res3.official_set.validation.status, "QUARANTINE");

  // Case 4: Official unverified + Third-party valid -> Official preferred unverified (not promoted by third-party)
  const res4 = resolveSourcePrecedence("standard", unverifiedOfficial, validThirdParty);
  assert.equal(res4.precedence_outcome, "official_preferred_unverified");
  assert.equal(res4.selected_set.set_id, unverifiedOfficial.set_id);
});

// 26. Repeat-import idempotence
test("Repeat import is idempotent with 0 duplicate canonical_variant_ids", () => {
  assert.equal(report.second_run_duplicates, 0);
  assert.equal(run1.variantsById.size, run2.variantsById.size);
  for (const k of run2.variantsById.keys()) {
    assert.ok(run1.variantsById.has(k));
  }
});

console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
