# TCGPlayer Resolution Debug Guide

When TCGPlayer export shows Scryfall collector numbers instead of TCGPlayer numbers, use this guide to verify the pipeline.

## Quick Checks

### 1. TCGCSV data present

```bash
# Product map should exist and have entries
test -f data/dist/tcgcsv-product-map.json && echo "OK" || echo "MISSING"
node -e "const m=require('./data/dist/tcgcsv-product-map.json'); console.log('Entries:', Object.keys(m.productMap||{}).length)"
```

### 2. Printings have TCGPlayer columns

```bash
node -e "
const p = require('./data/dist/printings.json');
const has = p.tcgplayer_set_indices?.length > 0;
console.log('TCGPlayer columns:', has ? 'present' : 'absent');
if (has) {
  const nz = p.tcgplayer_set_indices.filter(i=>i>0).length;
  console.log('Resolved rows:', nz);
}
"
```

### 3. Verify a specific card

For Banquet Guests LTC 450 (Showcase Scrolls): TCGPlayer and Scryfall both use 450 for that product, so output `[LTC] 450` is correct.

For Banquet Guests LTC 130 (regular): TCGCSV has number `130` for that product (not 47 as mentioned in the spec). Output `[LTC] 130` is expected.

### 4. Cards where numbers differ

To confirm resolution is active, use a card where Scryfall and TCGPlayer differ, e.g. Admiral Beckett Brass from The List (plst): Scryfall `XLN-217` vs TCGPlayer `217/279`.

## Common Causes

| Symptom | Cause |
|--------|-------|
| No TCGPlayer columns | Run `npm run etl -- download-tcgcsv` then `npm run etl -- process` |
| Stale data in dev | Ensure `data/dist/printings.json` is from a run that included TCGCSV |
| Deployed site stale | Rebuild and redeploy; cache may serve old printings.json |

## Data Flow

1. `download-tcgcsv` → raw TCGCSV in `data/raw/`
2. `process` runs `processTcgcsv` → `data/dist/tcgcsv-product-map.json`
3. `processPrintings` joins `tcgplayer_id` to product map → `tcgplayer_set_indices`, `tcgplayer_number_indices` in `printings.json`
4. Worker loads printings, `extractPrintingDisplayColumns` resolves indices → `tcgplayer_set_codes`, `tcgplayer_collector_numbers`
5. `serializeTcgplayer` uses these when `preferTcgplayerForSetAndNumber` and both are non-empty
