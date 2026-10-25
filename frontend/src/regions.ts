// The six regions, used only to organise the optional regional questions
// (backend/regional.go), never to describe a person. Each country the person
// can pick (country.ts) belongs to one region or to none; the research behind
// the grouping is in docs/research/regions/report.md. Countries the research
// did not cover (Central Asia, the Caucasus, Eastern Europe outside the EU,
// the Pacific islands) belong to none for now, so they get the shared
// questions only. backend TestRegionsMatchTheFrontend keeps REGIONS in step.

export const REGIONS = ['africa', 'mena', 'south-asia', 'east-asia', 'latin-america', 'west'] as const
export type Region = (typeof REGIONS)[number]

const MEMBERS: Record<Region, string> = {
  // Sub-Saharan Africa
  africa:
    'AO BF BI BJ BW CD CF CG CI CM CV DJ ER ET GA GH GM GN GQ GW KE KM LR LS MG ML MR MU MW MZ NA NE NG RE RW SC SH SL SN SO SS ST SZ TD TG TZ UG YT ZA ZM ZW',
  // The Middle East and North Africa, with Türkiye and Iran
  mena: 'AE BH DZ EG EH IL IQ IR JO KW LB LY MA OM PS QA SA SD SY TN TR YE',
  'south-asia': 'AF BD BT IN LK MV NP PK',
  // East and Southeast Asia
  'east-asia': 'BN CN HK ID JP KH KP KR LA MM MN MO MY PH SG TH TL TW VN',
  // Latin America and the Caribbean
  'latin-america':
    'AG AI AR AW BB BL BO BQ BR BS BZ CL CO CR CU CW DM DO EC FK GD GF GP GT GY HN HT JM KN KY LC MF MQ MS MX NI PA PE PR PY SR SV SX TC TT UY VC VE VG VI',
  // Europe, North America, Australia and New Zealand
  west: 'AD AL AT AU AX BA BE BG BM CA CH CY CZ DE DK EE ES FI FO FR GB GG GI GL GR HR HU IE IM IS IT JE LI LT LU LV MC ME MK MT NL NO NZ PL PM PT RO RS SE SI SJ SK SM US VA',
}

const BY_COUNTRY: Record<string, Region> = Object.fromEntries(
  REGIONS.flatMap((r) => MEMBERS[r].split(' ').map((cc) => [cc, r])),
)

export const regionCountries = (r: Region): string[] => MEMBERS[r].split(' ')

// regionOf is the region a country belongs to, or null.
export function regionOf(country: string | null | undefined): Region | null {
  return (country && BY_COUNTRY[country]) || null
}
