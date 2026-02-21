# ADR-007: Bit-Packed Data Representation

**Status:** Accepted

## Context

Each MTG card has several fields that are small, finite sets:

- **Colors** (W, U, B, R, G) — 5 possible values, often in combination.
- **Color Identity** — same 5 values.
- **Rarity** — 4 values (Common, Uncommon, Rare, Mythic).
- **Power/Toughness** — numeric values plus special tokens (`*`, `X`, `1+*`, etc.).
- **Types/Supertypes** — a bounded set (Creature, Instant, Sorcery, Legendary, etc.).

Representing these as string arrays (e.g., `["W", "U"]`) is highly redundant across 27,000+ cards and wasteful for mobile downloads.

## Decision

Encode these fields as **bitmasks** (integer values where each bit represents membership in the set).

For example:
- Colors: `White = 1 << 0`, `Blue = 1 << 1`, `Black = 1 << 2`, `Red = 1 << 3`, `Green = 1 << 4`.
- A white-blue card: `0b00011` (= 3).

These bitmask constants are defined in the `shared` package so that both the ETL (encoding) and the app (decoding/filtering) use identical definitions.

## Rationale

- A 5-color field compresses from a variable-length array of strings to a single byte.
- Bitwise operations (`&`, `|`) enable extremely fast filtering in the WebWorker — no string comparison or array iteration.
- CBOR (see ADR-005) supports compact integer encoding natively.

## Consequences

- **Positive:** Dramatic reduction in per-card data size.
- **Positive:** Search/filter operations become simple bitwise checks, which are the fastest operations a CPU can perform.
- **Negative:** Less human-readable; debugging requires helper functions to decode bitmasks back to names.
- **Negative:** Adding new values to a bitmask field requires care to avoid breaking existing bit positions.
