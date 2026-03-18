// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import { ORACLE_CARDS_PATH, DEFAULT_CARDS_PATH, ATOMIC_CARDS_PATH, COLUMNS_PATH, THUMBS_PATH, ensureDistDir } from "./paths";
import { log } from "./log";
import { loadArtCropManifest, loadCardManifest } from "./thumbhash";
import {
  COLOR_FROM_LETTER,
  FORMAT_NAMES,
  CardFlag,
  type ColumnarData,
} from "@frantic-search/shared";

// ---------------------------------------------------------------------------
// Scryfall card shape (fields we care about)
// ---------------------------------------------------------------------------

interface CardFace {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
}

interface AllPart {
  id?: string;
  component?: string;
}

interface Card {
  id?: string;
  oracle_id?: string;
  layout?: string;
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  legalities?: Record<string, string>;
  edhrec_rank?: number;
  reserved?: boolean;
  game_changer?: boolean;
  security_stamp?: string;
  border_color?: string;
  set_type?: string;
  promo_types?: string[];
  card_faces?: CardFace[];
  keywords?: string[];
  all_parts?: AllPart[];
}

// ---------------------------------------------------------------------------
// MTGJSON AtomicCards shape (fields we use for salt)
// ---------------------------------------------------------------------------

interface CardAtomic {
  identifiers?: { scryfallOracleId?: string };
  edhrecSaltiness?: number;
}
interface AtomicCardsJson {
  data?: Record<string, CardAtomic[]>;
}

const MULTI_FACE_LAYOUTS = new Set([
  "transform",
  "modal_dfc",
  "adventure",
  "split",
  "flip",
  "double_faced_token",
]);

// ---------------------------------------------------------------------------
// Bitmask encoding helpers
// ---------------------------------------------------------------------------

function encodeColors(colors: string[] | undefined): number {
  if (!colors) return 0;
  let mask = 0;
  for (const c of colors) {
    mask |= COLOR_FROM_LETTER[c] ?? 0;
  }
  return mask;
}

function isNotLegalAnywhere(legalities: Record<string, string> | undefined): boolean {
  if (!legalities) return true;
  for (const status of Object.values(legalities)) {
    if (status === "legal" || status === "restricted" || status === "banned") return false;
  }
  return true;
}

function isFunny(card: Card): boolean {
  if (card.security_stamp === "acorn") return true;
  if (card.border_color === "silver" || card.border_color === "gold") return true;
  if (card.set_type === "funny" && isNotLegalAnywhere(card.legalities)) return true;
  if (card.promo_types?.includes("playtest")) return true;
  return false;
}

function isUniversesBeyond(card: Card, oracleIdsWithUB: Set<string>): boolean {
  if (card.security_stamp === "triangle" || card.promo_types?.includes("universesbeyond")) {
    return true;
  }
  const oid = card.oracle_id ?? card.id;
  return oid != null && oracleIdsWithUB.has(oid);
}

function isMeldResult(card: Card): boolean {
  const layout = card.layout ?? "normal";
  const allParts = card.all_parts;
  if (layout !== "meld" || !allParts) return false;
  const cardId = card.id;
  const oracleId = card.oracle_id;
  return allParts.some(
    (p) =>
      p.component === "meld_result" &&
      (p.id === cardId || p.id === oracleId),
  );
}

function encodeFlags(card: Card, oracleIdsWithUB: Set<string>): number {
  let flags = 0;
  if (card.reserved) flags |= CardFlag.Reserved;
  if (isFunny(card)) flags |= CardFlag.Funny;
  if (isUniversesBeyond(card, oracleIdsWithUB)) flags |= CardFlag.UniversesBeyond;
  if (card.game_changer) flags |= CardFlag.GameChanger;
  if (isMeldResult(card)) flags |= CardFlag.MeldResult;
  return flags;
}

function encodeLegalities(legalities: Record<string, string> | undefined): { legal: number; banned: number; restricted: number } {
  let legal = 0, banned = 0, restricted = 0;
  if (!legalities) return { legal, banned, restricted };
  for (const [format, status] of Object.entries(legalities)) {
    const bit = FORMAT_NAMES[format];
    if (bit === undefined) continue;
    if (status === "legal") legal |= bit;
    else if (status === "banned") banned |= bit;
    else if (status === "restricted") restricted |= bit;
  }
  return { legal, banned, restricted };
}

// ---------------------------------------------------------------------------
// Dictionary encoding: map a small set of strings to uint8 indices
// ---------------------------------------------------------------------------

const NONE_SENTINEL = "";

class DictEncoder {
  private table: string[] = [NONE_SENTINEL];
  private index = new Map<string, number>([[NONE_SENTINEL, 0]]);

  encode(value: string | undefined): number {
    const v = value ?? NONE_SENTINEL;
    let idx = this.index.get(v);
    if (idx === undefined) {
      idx = this.table.length;
      if (idx > 255) throw new Error(`Dictionary exceeded 255 entries at "${v}"`);
      this.table.push(v);
      this.index.set(v, idx);
    }
    return idx;
  }

  lookup(): string[] {
    return this.table;
  }
}

// ---------------------------------------------------------------------------
// Columnar output
// ---------------------------------------------------------------------------

/** Build alternate_names_index from default-cards. Spec 111.
 * Keys are raw alternate names; client normalizes at load time. */
function buildAlternateNamesIndex(
  data: ColumnarDataBuilder,
  verbose: boolean
): Record<string, number> {
  const index: Record<string, number> = {};
  try {
    const defaultRaw = fs.readFileSync(DEFAULT_CARDS_PATH, "utf-8");
    const defaultCards: Array<{
      oracle_id?: string;
      name?: string;
      printed_name?: string;
      flavor_name?: string;
      card_faces?: Array<{ oracle_id?: string; name?: string; printed_name?: string; flavor_name?: string }>;
    }> = JSON.parse(defaultRaw);

    // Build oracle_id → canonical_face from columns
    const oracleToFace = new Map<string, number>();
    for (let i = 0; i < data.oracle_ids.length; i++) {
      const oid = data.oracle_ids[i];
      if (oid) oracleToFace.set(oid, data.canonical_face[i] ?? i);
    }

    for (const card of defaultCards) {
      const collect = (alt: string | undefined, oracleName: string, oid: string | undefined) => {
        if (!alt || !oid) return;
        if (alt.toLowerCase() === oracleName.toLowerCase()) return;
        const canonicalFace = oracleToFace.get(oid);
        if (canonicalFace === undefined) return;
        index[alt] = canonicalFace;
      };

      const oracleId = card.oracle_id ?? card.card_faces?.[0]?.oracle_id;
      collect(card.printed_name, card.name ?? "", oracleId);
      collect(card.flavor_name, card.name ?? "", oracleId);

      for (const face of card.card_faces ?? []) {
        const faceOid = face.oracle_id ?? oracleId;
        const faceName = face.name ?? card.name ?? "";
        collect(face.printed_name, faceName, faceOid);
        collect(face.flavor_name, faceName, faceOid);
      }
    }

    log(`Alternate names: ${Object.keys(index).length} entries from default-cards`, verbose);
  } catch {
    log("default-cards.json not found; alternate_names_index empty", verbose);
  }
  return index;
}

function loadSaltMap(verbose: boolean): Map<string, number> {
  if (!fs.existsSync(ATOMIC_CARDS_PATH)) {
    log("atomic-cards.json not found; salt column will be all null", verbose);
    return new Map();
  }
  const raw = fs.readFileSync(ATOMIC_CARDS_PATH, "utf-8");
  const parsed: AtomicCardsJson = JSON.parse(raw);
  const map = new Map<string, number>();
  for (const cardAtomics of Object.values(parsed.data ?? {})) {
    for (const atomic of cardAtomics) {
      const oracleId = atomic.identifiers?.scryfallOracleId;
      const salt = atomic.edhrecSaltiness;
      if (oracleId != null && salt != null) {
        map.set(oracleId, salt);
      }
    }
  }
  log(`EDHREC salt: ${map.size} oracle_ids from atomic-cards.json`, verbose);
  return map;
}

/** ColumnarData with oracle_ids guaranteed (used when building). */
type ColumnarDataBuilder = ColumnarData & { oracle_ids: string[] };

interface ThumbHashData {
  art_crop: string[];
  card: string[];
}

function pushFaceRow(
  data: ColumnarDataBuilder,
  thumbs: ThumbHashData,
  face: CardFace,
  card: Card,
  cardIdx: number,
  canonicalFace: number,
  leg: { legal: number; banned: number; restricted: number },
  oracleIdsWithUB: Set<string>,
  artCropManifest: Record<string, string>,
  cardManifest: Record<string, string>,
  powerDict: DictEncoder,
  toughnessDict: DictEncoder,
  loyaltyDict: DictEncoder,
  defenseDict: DictEncoder,
  saltMap: Map<string, number>,
): void {
  data.names.push(face.name ?? "");
  data.mana_costs.push(face.mana_cost ?? "");
  data.oracle_texts.push(face.oracle_text ?? "");
  data.colors.push(encodeColors(face.colors ?? card.colors));
  data.color_identity.push(encodeColors(card.color_identity));
  data.type_lines.push(face.type_line ?? "");

  data.powers.push(powerDict.encode(face.power));
  data.toughnesses.push(toughnessDict.encode(face.toughness));
  data.loyalties.push(loyaltyDict.encode(face.loyalty));
  data.defenses.push(defenseDict.encode(face.defense));

  data.legalities_legal.push(leg.legal);
  data.legalities_banned.push(leg.banned);
  data.legalities_restricted.push(leg.restricted);

  data.card_index.push(cardIdx);
  data.canonical_face.push(canonicalFace);
  data.scryfall_ids.push(card.id ?? "");
  data.oracle_ids.push(card.oracle_id ?? "");
  const id = card.id ?? "";
  thumbs.art_crop.push(artCropManifest[id] ?? "");
  thumbs.card.push(cardManifest[id] ?? "");
  data.layouts.push(card.layout ?? "normal");
  data.flags.push(encodeFlags(card, oracleIdsWithUB));
  data.edhrec_ranks.push(card.edhrec_rank ?? null);
  data.edhrec_salts.push(saltMap.get(card.oracle_id ?? "") ?? null);
}

export function processCards(verbose: boolean): void {
  // Build oracle_ids that have any UB printing (from default-cards, which has all printings)
  let oracleIdsWithUB = new Set<string>();
  try {
    const defaultRaw = fs.readFileSync(DEFAULT_CARDS_PATH, "utf-8");
    const defaultCards: Array<{ oracle_id?: string; promo_types?: string[]; security_stamp?: string }> = JSON.parse(defaultRaw);
    for (const c of defaultCards) {
      if ((c.promo_types?.includes("universesbeyond") || c.security_stamp === "triangle") && c.oracle_id) {
        oracleIdsWithUB.add(c.oracle_id);
      }
    }
    log(`Universes Beyond: ${oracleIdsWithUB.size} oracle_ids from default-cards`, verbose);
  } catch {
    log("default-cards.json not found; Universes Beyond from oracle-cards only", verbose);
  }

  log(`Reading ${ORACLE_CARDS_PATH}…`, verbose);
  const raw = fs.readFileSync(ORACLE_CARDS_PATH, "utf-8");
  const cards: Card[] = JSON.parse(raw);

  log(`Processing ${cards.length} cards…`, verbose);

  const saltMap = loadSaltMap(verbose);

  const artCropManifest = loadArtCropManifest();
  const cardManifest = loadCardManifest();
  log(`Art crop ThumbHash manifest: ${Object.keys(artCropManifest).length} entries`, verbose);
  log(`Card image ThumbHash manifest: ${Object.keys(cardManifest).length} entries`, verbose);

  const powerDict = new DictEncoder();
  const toughnessDict = new DictEncoder();
  const loyaltyDict = new DictEncoder();
  const defenseDict = new DictEncoder();

  const data: ColumnarDataBuilder = {
    names: [],
    mana_costs: [],
    oracle_texts: [],
    colors: [],
    color_identity: [],
    type_lines: [],
    powers: [],
    toughnesses: [],
    loyalties: [],
    defenses: [],
    legalities_legal: [],
    legalities_banned: [],
    legalities_restricted: [],
    card_index: [],
    canonical_face: [],
    scryfall_ids: [],
    oracle_ids: [],
    layouts: [],
    flags: [],
    edhrec_ranks: [],
    edhrec_salts: [],
    power_lookup: [],
    toughness_lookup: [],
    loyalty_lookup: [],
    defense_lookup: [],
    keywords_index: {},
  };

  const thumbs: ThumbHashData = { art_crop: [], card: [] };
  const keywordsIndex: Record<string, number[]> = {};

  for (let cardIdx = 0; cardIdx < cards.length; cardIdx++) {
    const card = cards[cardIdx];
    const layout = card.layout ?? "normal";

    const leg = encodeLegalities(card.legalities);
    const faceRowStart = data.names.length;

    for (const kw of new Set((card.keywords ?? []).map((k) => k.toLowerCase().trim()))) {
      if (kw) (keywordsIndex[kw] ??= []).push(faceRowStart);
    }

    if (MULTI_FACE_LAYOUTS.has(layout) && card.card_faces && card.card_faces.length > 0) {
      for (const face of card.card_faces) {
        pushFaceRow(data, thumbs, face, card, cardIdx, faceRowStart, leg, oracleIdsWithUB, artCropManifest,
          cardManifest, powerDict, toughnessDict, loyaltyDict, defenseDict, saltMap);
      }
    } else {
      pushFaceRow(data, thumbs, card, card, cardIdx, faceRowStart, leg, oracleIdsWithUB, artCropManifest,
        cardManifest, powerDict, toughnessDict, loyaltyDict, defenseDict, saltMap);
    }
  }

  for (const arr of Object.values(keywordsIndex)) {
    arr.sort((a, b) => a - b);
  }

  data.power_lookup = powerDict.lookup();
  data.toughness_lookup = toughnessDict.lookup();
  data.loyalty_lookup = loyaltyDict.lookup();
  data.defense_lookup = defenseDict.lookup();
  data.keywords_index = keywordsIndex;

  // Build alternate_names_index from default-cards (Spec 111)
  data.alternate_names_index = buildAlternateNamesIndex(data, verbose);

  log(`Emitted ${data.names.length} face rows`, verbose);
  log(`Lookup table sizes: power=${data.power_lookup.length}, toughness=${data.toughness_lookup.length}, loyalty=${data.loyalty_lookup.length}, defense=${data.defense_lookup.length}`, verbose);

  ensureDistDir();

  fs.writeFileSync(COLUMNS_PATH, JSON.stringify(data) + "\n");
  log(`Wrote ${COLUMNS_PATH}`, true);

  fs.writeFileSync(THUMBS_PATH, JSON.stringify(thumbs) + "\n");
  log(`Wrote ${THUMBS_PATH}`, true);
}
