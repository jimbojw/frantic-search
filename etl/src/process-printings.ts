// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import {
  DEFAULT_CARDS_PATH,
  ORACLE_CARDS_PATH,
  COLUMNS_PATH,
  PRINTINGS_PATH,
  FLAVOR_INDEX_PATH,
  ARTIST_INDEX_PATH,
  TCGCSV_PRODUCT_MAP_PATH,
  ensureDistDir,
} from "./paths";
import { log } from "./log";
import { encodePromoTypesFlags } from "./encode-promo-types-flags";
import {
  RARITY_FROM_STRING,
  FINISH_FROM_STRING,
  FRAME_FROM_STRING,
  GAME_NAMES,
  PrintingFlag,
  type PrintingColumnarData,
  type SetLookupEntry,
  type ColumnarData,
} from "@frantic-search/shared";

// ---------------------------------------------------------------------------
// Scryfall default-cards shape (fields we care about)
// ---------------------------------------------------------------------------

interface DefaultCardFace {
  illustration_id?: string;
  oracle_id?: string;
  name?: string;
  printed_name?: string;
  flavor_name?: string;
  flavor_text?: string;
  artist?: string;
}

interface DefaultCard {
  id?: string;
  oracle_id?: string;
  illustration_id?: string;
  card_faces?: DefaultCardFace[];
  name?: string;
  printed_name?: string;
  flavor_name?: string;
  flavor_text?: string;
  artist?: string;
  layout?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  rarity?: string;
  released_at?: string;
  full_art?: boolean;
  textless?: boolean;
  reprint?: boolean;
  promo?: boolean;
  digital?: boolean;
  highres_image?: boolean;
  oversized?: boolean;
  story_spotlight?: boolean;
  booster?: boolean;
  border_color?: string;
  frame?: string;
  frame_effects?: string[];
  finishes?: string[];
  games?: string[];
  promo_types?: string[];
  /** Scryfall set type; when `alchemy`, ETL sets the `alchemy` promo bit for `is:alchemy` parity (Spec 046). */
  set_type?: string;
  prices?: Record<string, string | null>;
  tcgplayer_id?: number;
  tcgplayer_etched_id?: number;
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function encodeRarity(rarity: string | undefined): number {
  return RARITY_FROM_STRING[rarity ?? ""] ?? 0;
}

function encodeFrame(frame: string | undefined): number {
  return FRAME_FROM_STRING[frame ?? ""] ?? 0;
}

// Sets with non-standard card backs that are not tournament-legal.
// 30th Anniversary Edition has black front borders but a gold card back.
const NON_TOURNAMENT_BACK_SETS = new Set(["30a"]);

function encodePrintingFlags(card: DefaultCard): number {
  let flags = 0;
  if (card.full_art) flags |= PrintingFlag.FullArt;
  if (card.textless) flags |= PrintingFlag.Textless;
  if (card.reprint) flags |= PrintingFlag.Reprint;
  if (card.promo) flags |= PrintingFlag.Promo;
  if (card.digital) flags |= PrintingFlag.Digital;
  if (card.highres_image) flags |= PrintingFlag.HighresImage;
  if (card.border_color === "borderless") flags |= PrintingFlag.Borderless;
  if (card.frame_effects?.includes("extendedart")) flags |= PrintingFlag.ExtendedArt;
  if (card.border_color === "gold" || NON_TOURNAMENT_BACK_SETS.has(card.set ?? "")) {
    flags |= PrintingFlag.GoldBorder;
  }
  if (card.oversized) flags |= PrintingFlag.Oversized;
  if (card.story_spotlight) flags |= PrintingFlag.Spotlight;
  if (card.booster) flags |= PrintingFlag.Booster;
  if (card.frame_effects?.includes("masterpiece")) flags |= PrintingFlag.Masterpiece;
  if (card.frame_effects?.includes("colorshifted")) flags |= PrintingFlag.Colorshifted;
  if (card.frame_effects?.includes("showcase")) flags |= PrintingFlag.Showcase;
  if (card.frame_effects?.includes("inverted")) flags |= PrintingFlag.Inverted;
  if (card.frame_effects?.includes("nyxtouched")) flags |= PrintingFlag.Nyxtouched;
  return flags;
}

function parsePriceCents(priceStr: string | null | undefined): number {
  if (!priceStr) return 0;
  const dollars = parseFloat(priceStr);
  if (isNaN(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

const PRICE_KEY_FOR_FINISH: Record<string, string> = {
  nonfoil: "usd",
  foil: "usd_foil",
  etched: "usd_etched",
};

function encodeGames(games: string[] | undefined): number {
  if (!games || games.length === 0) return 0;
  let bits = 0;
  for (const g of games) {
    bits |= GAME_NAMES[g.toLowerCase()] ?? 0;
  }
  return bits;
}

/** Encode an ISO date string (YYYY-MM-DD) as a uint32 YYYYMMDD integer. */
function encodeDateYmd(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return 0;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return 0;
  return y * 10000 + m * 100 + d;
}

// ---------------------------------------------------------------------------
// Set dictionary encoder (uint16 indices)
// ---------------------------------------------------------------------------

class SetEncoder {
  private table: SetLookupEntry[] = [];
  private index = new Map<string, number>();

  encode(code: string, name: string, releasedAt: number): number {
    let idx = this.index.get(code);
    if (idx === undefined) {
      idx = this.table.length;
      this.table.push({ code, name, released_at: releasedAt });
      this.index.set(code, idx);
    }
    return idx;
  }

  lookup(): SetLookupEntry[] {
    return this.table;
  }
}

/** String-to-index encoder with index 0 reserved for "". Spec 128. */
class StringEncoder {
  private table: string[] = [""];
  private index = new Map<string, number>();

  encode(s: string): number {
    if (s === "") return 0;
    let idx = this.index.get(s);
    if (idx === undefined) {
      idx = this.table.length;
      this.table.push(s);
      this.index.set(s, idx);
    }
    return idx;
  }

  lookup(): string[] {
    return this.table;
  }
}

// ---------------------------------------------------------------------------
// Build oracle_id → canonical_face_ref mapping
// ---------------------------------------------------------------------------

interface OracleCard {
  id?: string;
  oracle_id?: string;
  layout?: string;
}

function buildOracleIdMap(verbose: boolean): Map<string, number> {
  log("Building oracle_id → canonical_face_ref mapping…", verbose);

  const oracleRaw = fs.readFileSync(ORACLE_CARDS_PATH, "utf-8");
  const oracleCards: OracleCard[] = JSON.parse(oracleRaw);

  const columnsRaw = fs.readFileSync(COLUMNS_PATH, "utf-8");
  const columns: ColumnarData = JSON.parse(columnsRaw);

  // Build scryfall_id → canonical_face index from columns.json
  const scryfallIdToCanonical = new Map<string, number>();
  for (let i = 0; i < columns.scryfall_ids.length; i++) {
    const sid = columns.scryfall_ids[i];
    if (sid && !scryfallIdToCanonical.has(sid)) {
      scryfallIdToCanonical.set(sid, columns.canonical_face[i]);
    }
  }

  // Map oracle_id → canonical_face via oracle-cards.json scryfall IDs
  const map = new Map<string, number>();
  for (const card of oracleCards) {
    if (!card.oracle_id || !card.id) continue;
    const canonical = scryfallIdToCanonical.get(card.id);
    if (canonical !== undefined) {
      map.set(card.oracle_id, canonical);
    }
  }

  log(`Mapped ${map.size} oracle_ids to canonical face indices`, verbose);
  return map;
}

/** Build canonical_face -> canonical printing scryfall_id from columns. */
function buildCanonicalScryfallIdMap(): Map<number, string> {
  const columnsRaw = fs.readFileSync(COLUMNS_PATH, "utf-8");
  const columns: ColumnarData = JSON.parse(columnsRaw);
  const map = new Map<number, string>();
  for (let i = 0; i < columns.canonical_face.length; i++) {
    if (columns.canonical_face[i] === i && columns.scryfall_ids[i]) {
      map.set(i, columns.scryfall_ids[i]);
    }
  }
  return map;
}

/** Front-face illustration_id (multiface uses card_faces[0]). */
function getFrontIllustrationId(card: DefaultCard): string | undefined {
  return card.card_faces?.[0]?.illustration_id ?? card.illustration_id;
}

// ---------------------------------------------------------------------------
// Main processing
// ---------------------------------------------------------------------------

export function processPrintings(verbose: boolean): void {
  if (!fs.existsSync(DEFAULT_CARDS_PATH)) {
    log(`${DEFAULT_CARDS_PATH} not found — skipping printings processing`, true);
    return;
  }

  if (!fs.existsSync(COLUMNS_PATH)) {
    throw new Error(
      `${COLUMNS_PATH} not found — run card processing first (processCards must complete before processPrintings)`,
    );
  }

  const oracleIdMap = buildOracleIdMap(verbose);
  const canonicalScryfallIdMap = buildCanonicalScryfallIdMap();

  log(`Reading ${DEFAULT_CARDS_PATH}…`, verbose);
  const raw = fs.readFileSync(DEFAULT_CARDS_PATH, "utf-8");
  const defaultCards: DefaultCard[] = JSON.parse(raw);

  // Pass 1: build illustration_id -> index per canonical face (Issue #75)
  const faceIllustrationOrder = new Map<number, string[]>();
  const faceIllustrationSeen = new Map<number, Set<string>>();
  const canonicalKey = new Map<number, string>();
  for (const card of defaultCards) {
    const cf = oracleIdMap.get(card.oracle_id ?? "");
    if (cf === undefined) continue;
    const illId = getFrontIllustrationId(card);
    const key = illId ?? `__null__:${card.id ?? ""}`;
    let order = faceIllustrationOrder.get(cf);
    let seen = faceIllustrationSeen.get(cf);
    if (!order) {
      order = [];
      faceIllustrationOrder.set(cf, order);
    }
    if (!seen) {
      seen = new Set();
      faceIllustrationSeen.set(cf, seen);
    }
    if (!seen.has(key)) {
      order.push(key);
      seen.add(key);
    }
    const canonicalId = canonicalScryfallIdMap.get(cf);
    if (canonicalId && card.id === canonicalId) {
      canonicalKey.set(cf, key);
    }
  }
  const illustrationIndexMap = new Map<number, Map<string, number>>();
  for (const [cf, order] of faceIllustrationOrder) {
    const map = new Map<string, number>();
    const canKey = canonicalKey.get(cf);
    if (canKey !== undefined) map.set(canKey, 0);
    let idx = 1;
    for (const key of order) {
      if (key !== canKey) map.set(key, idx++);
    }
    illustrationIndexMap.set(cf, map);
  }

  // Load TCGCSV product map for TCGPlayer Mass Entry resolution (Spec 128)
  let productMap: Record<string, { setAbbrev: string; number: string; name: string }> | null = null;
  if (fs.existsSync(TCGCSV_PRODUCT_MAP_PATH)) {
    try {
      const mapRaw = fs.readFileSync(TCGCSV_PRODUCT_MAP_PATH, "utf-8");
      const parsed = JSON.parse(mapRaw) as {
        productMap?: Record<string, { setAbbrev: string; number: string; name: string }>;
      };
      productMap = parsed.productMap ?? null;
    } catch (err) {
      process.stderr.write(
        `Warning: TCGCSV product map parse failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  const setEncoder = new SetEncoder();
  const tcgSetEncoder = new StringEncoder();
  const tcgNumberEncoder = new StringEncoder();
  const tcgNameEncoder = new StringEncoder();
  let hasAnyTcgResolution = false;

  const data: PrintingColumnarData = {
    canonical_face_ref: [],
    scryfall_ids: [],
    collector_numbers: [],
    set_indices: [],
    rarity: [],
    printing_flags: [],
    finish: [],
    frame: [],
    price_usd: [],
    released_at: [],
    games: [],
    promo_types_flags_0: [],
    promo_types_flags_1: [],
    illustration_id_index: [],
    set_lookup: [],
    ...(productMap && {
      tcgplayer_set_indices: [] as number[],
      tcgplayer_number_indices: [] as number[],
      tcgplayer_name_indices: [] as number[],
    }),
  };

  let dropped = 0;
  let totalEntries = 0;
  const altNamesIndex: Record<string, number[]> = {};
  const flavorIndex: Record<string, Array<[number, number]>> = {};
  const artistIndex: Record<string, Array<[number, number]>> = {};

  for (const card of defaultCards) {
    // reversible_card layout: Scryfall puts oracle_id on card_faces[0], not top-level (Issue #98)
    const oracleId = card.oracle_id ?? card.card_faces?.[0]?.oracle_id;
    if (!oracleId) {
      dropped++;
      continue;
    }

    const canonicalFace = oracleIdMap.get(oracleId);
    if (canonicalFace === undefined) {
      dropped++;
      continue;
    }

    const finishes = card.finishes ?? ["nonfoil"];
    const scryfallId = card.id ?? "";
    const collectorNumber = card.collector_number ?? "";
    const releasedAtYmd = encodeDateYmd(card.released_at);
    const setIdx = setEncoder.encode(card.set ?? "", card.set_name ?? "", releasedAtYmd);
    const rarityBits = encodeRarity(card.rarity);
    const flagBits = encodePrintingFlags(card);
    const frameBits = encodeFrame(card.frame);
    const gamesBits = encodeGames(card.games);
    const promoFlags = encodePromoTypesFlags(card);

    const illId = getFrontIllustrationId(card);
    const illKey = illId ?? `__null__:${card.id ?? ""}`;
    const illMap = illustrationIndexMap.get(canonicalFace);
    const illIdx = illMap?.get(illKey) ?? 0;

    // Collect alternate names for this printing (Spec 111). Raw names; client normalizes at load.
    const altNames: string[] = [];
    const collectAlt = (alt: string | undefined, refName: string) => {
      if (!alt || alt.toLowerCase() === refName.toLowerCase()) return;
      altNames.push(alt);
    };
    collectAlt(card.printed_name, card.name ?? "");
    collectAlt(card.flavor_name, card.name ?? "");
    for (const face of card.card_faces ?? []) {
      collectAlt(face.printed_name, face.name ?? card.name ?? "");
      collectAlt(face.flavor_name, face.name ?? card.name ?? "");
    }

    const printingRowStart = totalEntries;
    const oracleName = card.card_faces?.[0]?.name ?? card.name ?? "";

    for (const finishStr of finishes) {
      const finishVal = FINISH_FROM_STRING[finishStr];
      if (finishVal === undefined) continue;

      const priceKey = PRICE_KEY_FOR_FINISH[finishStr] ?? "usd";
      const priceCents = parsePriceCents(card.prices?.[priceKey]);

      data.canonical_face_ref.push(canonicalFace);
      data.scryfall_ids.push(scryfallId);
      data.collector_numbers.push(collectorNumber);
      data.set_indices.push(setIdx);
      data.rarity.push(rarityBits);
      data.printing_flags.push(flagBits);
      data.finish.push(finishVal);
      data.frame.push(frameBits);
      data.price_usd.push(priceCents);
      data.released_at.push(releasedAtYmd);
      (data.games ??= []).push(gamesBits);
      data.promo_types_flags_0!.push(promoFlags.flags0);
      data.promo_types_flags_1!.push(promoFlags.flags1);
      data.illustration_id_index!.push(illIdx);

      // TCGPlayer Mass Entry resolution (Spec 128)
      if (productMap) {
        const productId =
          finishStr === "etched" && card.tcgplayer_etched_id != null
            ? card.tcgplayer_etched_id
            : card.tcgplayer_id;
        const entry = productId != null ? productMap[String(productId)] : undefined;
        if (entry) {
          data.tcgplayer_set_indices!.push(tcgSetEncoder.encode(entry.setAbbrev));
          data.tcgplayer_number_indices!.push(tcgNumberEncoder.encode(entry.number));
          const nameIdx =
            entry.name === oracleName
              ? tcgNameEncoder.encode("")
              : tcgNameEncoder.encode(entry.name);
          data.tcgplayer_name_indices!.push(nameIdx);
          hasAnyTcgResolution = true;
        } else {
          data.tcgplayer_set_indices!.push(0);
          data.tcgplayer_number_indices!.push(0);
          data.tcgplayer_name_indices!.push(0);
        }
      }

      totalEntries++;
    }

    // Map each alternate name to the printing rows just emitted (Spec 111)
    if (altNames.length > 0) {
      for (let pi = printingRowStart; pi < totalEntries; pi++) {
        for (const alt of altNames) {
          (altNamesIndex[alt] ??= []).push(pi);
        }
      }
    }

    // Flavor text inverted index (Spec 141): raw flavor text → (face_index_within_card, printing_row) pairs
    const facesWithFlavor: Array<{ flavorText: string; faceIndex: number }> = [];
    if (card.card_faces?.length) {
      for (let i = 0; i < card.card_faces.length; i++) {
        const ft = card.card_faces[i].flavor_text?.trim();
        if (ft) facesWithFlavor.push({ flavorText: ft, faceIndex: i });
      }
    } else {
      const ft = card.flavor_text?.trim();
      if (ft) facesWithFlavor.push({ flavorText: ft, faceIndex: 0 });
    }
    for (const { flavorText, faceIndex } of facesWithFlavor) {
      let pairs = flavorIndex[flavorText];
      if (!pairs) {
        pairs = [];
        flavorIndex[flavorText] = pairs;
      }
      for (let pi = printingRowStart; pi < totalEntries; pi++) {
        pairs.push([faceIndex, pi]);
      }
    }

    // Artist inverted index (Spec 148): raw artist name → (face_index_within_card, printing_row) pairs
    const facesWithArtist: Array<{ artist: string; faceIndex: number }> = [];
    if (card.card_faces?.length) {
      for (let i = 0; i < card.card_faces.length; i++) {
        const a = card.card_faces[i].artist?.trim();
        if (a) facesWithArtist.push({ artist: a, faceIndex: i });
      }
    } else {
      const a = card.artist?.trim();
      if (a) facesWithArtist.push({ artist: a, faceIndex: 0 });
    }
    for (const { artist, faceIndex } of facesWithArtist) {
      let pairs = artistIndex[artist];
      if (!pairs) {
        pairs = [];
        artistIndex[artist] = pairs;
      }
      for (let pi = printingRowStart; pi < totalEntries; pi++) {
        pairs.push([faceIndex, pi]);
      }
    }
  }

  // Sort each alternate name's printing row array (Spec 111)
  for (const arr of Object.values(altNamesIndex)) {
    arr.sort((a, b) => a - b);
  }
  if (Object.keys(altNamesIndex).length > 0) {
    data.alternate_names_index = altNamesIndex;
  }

  // Flavor index: dedupe, sort by (face, printing), write strided format (Spec 141)
  const flavorIndexStrided: Record<string, number[]> = {};
  let flavorTotalPairs = 0;
  for (const [key, pairs] of Object.entries(flavorIndex)) {
    const seen = new Set<string>();
    const unique: Array<[number, number]> = [];
    for (const [f, p] of pairs) {
      const k = `${f},${p}`;
      if (!seen.has(k)) {
        seen.add(k);
        unique.push([f, p]);
      }
    }
    unique.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
    const strided: number[] = [];
    for (const [f, p] of unique) {
      strided.push(f, p);
    }
    flavorIndexStrided[key] = strided;
    flavorTotalPairs += strided.length / 2;
  }
  const flavorIndexJson = JSON.stringify(flavorIndexStrided) + "\n";
  ensureDistDir();
  fs.writeFileSync(FLAVOR_INDEX_PATH, flavorIndexJson);
  const flavorIndexBytes = Buffer.byteLength(flavorIndexJson, "utf8");
  log(`Wrote ${FLAVOR_INDEX_PATH}`, true);
  log(
    `Flavor index: ${Object.keys(flavorIndexStrided).length} unique keys, ${flavorTotalPairs} pairs, ${(flavorIndexBytes / 1024).toFixed(1)} KB`,
    verbose,
  );

  // Artist index: dedupe, sort by (face, printing), write strided format (Spec 148)
  const artistIndexStrided: Record<string, number[]> = {};
  let artistTotalPairs = 0;
  for (const [key, pairs] of Object.entries(artistIndex)) {
    const seen = new Set<string>();
    const unique: Array<[number, number]> = [];
    for (const [f, p] of pairs) {
      const k = `${f},${p}`;
      if (!seen.has(k)) {
        seen.add(k);
        unique.push([f, p]);
      }
    }
    unique.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
    const strided: number[] = [];
    for (const [f, p] of unique) {
      strided.push(f, p);
    }
    artistIndexStrided[key] = strided;
    artistTotalPairs += strided.length / 2;
  }
  const artistIndexJson = JSON.stringify(artistIndexStrided) + "\n";
  fs.writeFileSync(ARTIST_INDEX_PATH, artistIndexJson);
  const artistIndexBytes = Buffer.byteLength(artistIndexJson, "utf8");
  log(`Wrote ${ARTIST_INDEX_PATH}`, true);
  log(
    `Artist index: ${Object.keys(artistIndexStrided).length} artists, ${artistTotalPairs} pairs, ${(artistIndexBytes / 1024).toFixed(1)} KB`,
    verbose,
  );

  data.set_lookup = setEncoder.lookup();

  if (productMap && !hasAnyTcgResolution) {
    delete data.tcgplayer_set_indices;
    delete data.tcgplayer_number_indices;
    delete data.tcgplayer_name_indices;
  } else if (productMap && hasAnyTcgResolution) {
    data.tcgplayer_set_lookup = tcgSetEncoder.lookup();
    data.tcgplayer_number_lookup = tcgNumberEncoder.lookup();
    data.tcgplayer_name_lookup = tcgNameEncoder.lookup();
  }

  log(`Dropped ${dropped} unmappable entries`, verbose);
  log(`Emitted ${totalEntries} printing rows (${data.set_lookup.length} unique sets)`, verbose);

  ensureDistDir();
  fs.writeFileSync(PRINTINGS_PATH, JSON.stringify(data) + "\n");
  log(`Wrote ${PRINTINGS_PATH}`, true);
}
