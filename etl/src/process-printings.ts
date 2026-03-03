// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import {
  DEFAULT_CARDS_PATH,
  ORACLE_CARDS_PATH,
  COLUMNS_PATH,
  PRINTINGS_PATH,
  ensureDistDir,
} from "./paths";
import { log } from "./log";
import {
  RARITY_FROM_STRING,
  FINISH_FROM_STRING,
  FRAME_FROM_STRING,
  GAME_NAMES,
  PrintingFlag,
  PROMO_TYPE_FLAGS,
  type PrintingColumnarData,
  type SetLookupEntry,
  type ColumnarData,
} from "@frantic-search/shared";

// ---------------------------------------------------------------------------
// Scryfall default-cards shape (fields we care about)
// ---------------------------------------------------------------------------

interface DefaultCardFace {
  illustration_id?: string;
}

interface DefaultCard {
  id?: string;
  oracle_id?: string;
  illustration_id?: string;
  card_faces?: DefaultCardFace[];
  name?: string;
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
  border_color?: string;
  frame?: string;
  frame_effects?: string[];
  finishes?: string[];
  games?: string[];
  promo_types?: string[];
  prices?: Record<string, string | null>;
}

// Same set of layouts filtered in the card-level ETL
const FILTERED_LAYOUTS = new Set([
  "art_series",
  "token",
  "double_faced_token",
  "emblem",
  "planar",
  "scheme",
  "vanguard",
  "augment",
  "host",
]);

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

function encodePromoTypesFlags(card: DefaultCard): { flags0: number; flags1: number } {
  let flags0 = 0;
  let flags1 = 0;
  const types = card.promo_types ?? [];
  for (const t of types) {
    const entry = PROMO_TYPE_FLAGS[t.toLowerCase()];
    if (entry) {
      const bit = 1 << entry.bit;
      if (entry.column === 0) flags0 |= bit;
      else flags1 |= bit;
    }
  }
  return { flags0, flags1 };
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
    const layout = card.layout ?? "normal";
    if (FILTERED_LAYOUTS.has(layout)) continue;
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

  log(`Processing ${defaultCards.length} default card entries…`, verbose);

  const setEncoder = new SetEncoder();

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
  };

  let dropped = 0;
  let totalEntries = 0;

  for (const card of defaultCards) {
    const layout = card.layout ?? "normal";
    if (FILTERED_LAYOUTS.has(layout)) {
      dropped++;
      continue;
    }

    if (!card.oracle_id) {
      dropped++;
      continue;
    }

    const canonicalFace = oracleIdMap.get(card.oracle_id);
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

      totalEntries++;
    }
  }

  data.set_lookup = setEncoder.lookup();

  log(`Dropped ${dropped} unmappable/filtered entries`, verbose);
  log(`Emitted ${totalEntries} printing rows (${data.set_lookup.length} unique sets)`, verbose);

  ensureDistDir();
  fs.writeFileSync(PRINTINGS_PATH, JSON.stringify(data) + "\n");
  log(`Wrote ${PRINTINGS_PATH}`, true);
}
