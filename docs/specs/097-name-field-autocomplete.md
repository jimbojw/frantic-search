# Spec 097: Name Field Autocomplete

**Status:** Implemented

**Depends on:** Spec 089 (Inline Autocomplete), Spec 096 (Name Comparison Operators)

## Goal

Extend inline autocomplete (Spec 089) so that typing `name:bolt`, `name>M`, `name="Lightning`, etc. suggests card names from the loaded dataset. Suggestions must be context-aware: when the cursor is in a value position for the `name` field, use card names; never suggest field aliases (e.g. "manavalue") in that context.

## Background

When typing `name>M`, the UI incorrectly suggested "Manavalue" because the token "M" was interpreted as a **field name** prefix (matching the `m`/`mana`/`manavalue` aliases) instead of a **name field value**. The same applied to `name:bolt`, `name=Lightning`, `name<Z`, etc. — no card-name suggestions were offered for the `name` field.

### Root cause

1. **Context detection:** Value context was only recognized when `prev.type === TokenType.COLON`. When the operator was `>`, `<`, `>=`, `<=`, `=`, or `!=`, the code never returned value context.
2. **Field-prefix fallback:** For a WORD token with prefix "M", the code checked if "M" matched any field alias (lines 86–97). Since `m` and `mana` prefix-matched, it returned **field** context.
3. **No name handling:** Even when value context was correctly detected for `name:L`, `computeSuggestion` had no branch for `fn === 'name'` and returned `null`.

## Design

### Context detection (getCompletionContext)

Extend value-context detection so it applies when the previous token is **any** operator (not just COLON), and the token two positions back is a known field.

- **Change:** Add a check **before** the field-prefix fallback: if `prev` is an operator (`isOperator(prev)`) and `tokens[i-2]` is a known field, return value context with that field name.

Order matters: this check must run before the field-prefix logic, otherwise `name>M` will still match "m" as a field alias.

### Suggestion logic (computeSuggestion)

In the `case 'value':` branch, add:

```typescript
if (fn === 'name' || fn === 'n') {
  if (!data.names?.length) return null
  const match = firstMatchByPrefix(data.names, prefix)
  return match
}
```

- **Unquoted:** Return the first card name that prefix-matches (case-insensitive). Stop at the first whitespace so multi-word names (e.g. "Mine Security") yield only the first word ("Mine"), avoiding a bare-word token for the remainder.
- **Quoted:** The QUOTED branch already produces value context with `fieldName`. Return the matching card name; `applyCompletion` replaces from `tokenStart` to `cursorOffset` as usual.

### No protocol or data changes

`AutocompleteData` already includes `names` from `buildAutocompleteData`. No worker or `DisplayColumns` changes.

## Scope

- **Operators:** All `name` operators: `:`, `=`, `!=`, `>`, `<`, `>=`, `<=`.
- **Token types:** Unquoted WORD and quoted QUOTED values.
- **Data source:** `AutocompleteData.names` (from `DisplayColumns.names`), same as bare-word and exact-name.

## File Summary

| File | Change |
|------|--------|
| `app/src/query-autocomplete.ts` | 1) Add value-context check for any operator before field-prefix fallback; 2) Add `name`/`n` case in `computeSuggestion` |
| `app/src/query-autocomplete.test.ts` | Add tests: `name>M` suggests card name; `name:bolt` suggests card name; `name:L` suggests "Lightning Bolt"; no "manavalue" for `name>M` |
| `docs/specs/089-inline-autocomplete.md` | Add row to completion contexts table; add Implementation Note referencing Spec 097 |

## Acceptance Criteria

1. Typing `name>M` suggests a card name (e.g. "Mountain"), not "manavalue".
2. Typing `name:bolt` or `name:L` suggests a card name.
3. All `name` operators (`:`, `=`, `!=`, `>`, `<`, `>=`, `<=`) receive card-name suggestions.
4. Quoted values (`name:"Lightning`) suggest card names.
5. No regressions to other field autocomplete (set, type, etc.) or bare-word/exact-name completion.
