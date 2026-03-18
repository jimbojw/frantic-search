## `is:commander` Gap Analysis

### Current Implementation

```typescript
// eval-is.ts:342-350
(legendary AND (creature OR planeswalker)) OR oracle_text.includes("can be your commander")
```

### Diff Results

```
npm run cli -- diff "is:commander" --quiet

In Both:               3,030
Only in Frantic Search:  325  (false positives)
Only in Scryfall:        111  (false negatives)
Total discrepancies:     436
```

---

### False Positives — 325 cards we match but Scryfall doesn't

| Category | Count | Root Cause |
|---|---|---|
| Legendary Planeswalkers (not creature) | ~294 | Code checks `creature OR planeswalker`, but planeswalkers are **not** commanders in EDH unless they have "can be your commander" text |
| DFC/flip back-face-only legendary creatures | ~31 | Code iterates all face rows. Cards like Westvale Abbey // Ormendahl match because the **back face** is a Legendary Creature, but commander eligibility is determined by the front face only |

### False Negatives — 111 cards Scryfall matches but we don't

| Category | Count | Root Cause | Addressable in evaluator? |
|---|---|---|---|
| Un-set legendary creatures | 39 | Filtered by `include:extras: no` in diff tool | No — comparison methodology |
| Backgrounds (CLB) | 29 | `Legendary Enchantment — Background` — valid second commanders, missing type check | **Yes** |
| Legendary Vehicles / Spacecraft | 23 | `Legendary Artifact — Vehicle` etc. — Scryfall tags these as commanders, no "can be your commander" in oracle text | **Yes** |
| Zero-legality legendaries (MSC, SOC) | 12 | Legendary creatures with no format legalities, filtered by extras legality check | No — comparison methodology |
| Extras with cmd text (un-set/SOC) | 2 | Filtered by extras | No — comparison methodology |

---

### Proposed Fix

One change to the `commander` / `brawler` case in `eval-is.ts`:

```typescript
case "commander":
case "brawler":
  for (let i = 0; i < n; i++) {
    const tl = index.typeLinesLower[i];
    const isLegendary = tl.includes("legendary");
    const isFront = cf[i] === i;
    const isCreature = tl.includes("creature");
    const isVehicle = tl.includes("vehicle") || tl.includes("spacecraft");
    const isBackground = tl.includes("background");
    const hasCommanderText = index.oracleTextsLower[i].includes("can be your commander");
    if ((isFront && isLegendary && (isCreature || isVehicle || isBackground)) || hasCommanderText) {
      buf[cf[i]] = 1;
    }
  }
  break;
```

Four changes:
1. **Remove `planeswalker`** from the type check (−294 false positives)
2. **Front-face guard** (`cf[i] === i`) for the type-line condition (−31 false positives)
3. **Add `background`** subtype (−29 false negatives)
4. **Add `vehicle` / `spacecraft`** subtype (−23 false negatives)

### Expected Outcome

| Metric | Before | After |
|---|---|---|
| False positives | 325 | ~0 |
| False negatives | 111 | ~59 |
| Total gap | 436 | **~59** (~86% reduction) |

The remaining ~59 are un-set legendary creatures and zero-legality special-product cards (Marvel, Starter Commander). These are correctly excluded from normal results by the `include:extras: no` default — Scryfall's API returns them without requiring `include:extras`, so the diff tool sees them as mismatches. This is a comparison-scope question, not an evaluator bug.
