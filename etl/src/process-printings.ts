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
  PrintingFlag,
  type PrintingColumnarData,
  type SetLookupEntry,
  type ColumnarData,
} from "@frantic-search/shared";

// ---------------------------------------------------------------------------
// Scryfall default-cards shape (fields we care about)
// ---------------------------------------------------------------------------

interface DefaultCard {
  id?: string;
  oracle_id?: string;
  name?: string;
  layout?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  rarity?: string;
  full_art?: boolean;
  textless?: boolean;
  reprint?: boolean;
  promo?: boolean;
  digital?: boolean;
  highres_image?: boolean;
  border_color?: string;
  frame?: string;
  frame_effects?: string[];
  finishes?: string[];
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

// ---------------------------------------------------------------------------
// Set dictionary encoder (uint16 indices)
// ---------------------------------------------------------------------------

class SetEncoder {
  private table: SetLookupEntry[] = [];
  private index = new Map<string, number>();

  encode(code: string, name: string): number {
    let idx = this.index.get(code);
    if (idx === undefined) {
      idx = this.table.length;
      this.table.push({ code, name });
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

  log(`Reading ${DEFAULT_CARDS_PATH}…`, verbose);
  const raw = fs.readFileSync(DEFAULT_CARDS_PATH, "utf-8");
  const defaultCards: DefaultCard[] = JSON.parse(raw);

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
    const setIdx = setEncoder.encode(card.set ?? "", card.set_name ?? "");
    const rarityBits = encodeRarity(card.rarity);
    const flagBits = encodePrintingFlags(card);
    const frameBits = encodeFrame(card.frame);

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
