# Spec 037: Histogram Toggles

**Status:** Implemented

**Depends on:** Spec 036 (Source Spans), Spec 025 (Results Breakdown)

## Goal

Replace the histogram's fire-and-forget append behavior with toggle-based interactions. Every bar click and × click is reversible — tap once to activate, tap again to deactivate. Where possible, repeated clicks on related bars modify a shared AST node in place rather than appending additional terms.

## Background

### Current behavior

The RESULTS breakdown has three histogram columns: Color Identity, Mana Value, and Card Type. Each row has two click targets:

- **Bar click** (drill) — appends a term like `ci>=r` or `t:creature`.
- **× click** (exclude) — appends a negated term like `-ci>=r` or `-t:creature`.

Both actions call `onAppendQuery(term)`, which concatenates the term to the end of the query string. There is no awareness of whether the term already exists, and no way to undo the action without manually editing the query or using the breakdown's × remove button.

### Problems

1. **No undo.** Clicking a bar is a one-way action. If you accidentally click the red color identity bar, you get `ci>=r` appended. Clicking it again appends a second `ci>=r`, which is redundant but cluttering.
2. **No composition.** Clicking the red bar and then the blue bar produces `ci>=r ci>=u` — two independent terms. These could be a single `ci>=ru` with the same semantics and less visual noise.
3. **No visual state.** The bars don't indicate whether a filter is currently active. The user has no way to know from looking at the histogram whether `t:creature` is already in the query.

### Design principles

- **Toggle.** Every click is reversible. Tap to add a filter, tap the same control again to remove it.
- **In-place edits.** When the query already contains a relevant term, modify it via source spans (Spec 036) instead of appending a new term.
- **Shared nodes where semantically valid.** Color identity drill terms (W/U/B/R/G) share a single `ci>=` node, accumulating or removing color letters. Colorless, multicolor, mana value, and type terms are independent node-level toggles.

## Design

### Node search

All toggle logic depends on finding an existing AST node in the breakdown tree. Define a general-purpose DFS search that returns the first matching `BreakdownNode`:

```typescript
function findFieldNode(
  breakdown: BreakdownNode,
  field: string[],
  operator: string,
  negated: boolean,
): BreakdownNode | null
```

Parameters:
- `field` — accepted field names including aliases (e.g., `['ci', 'identity', 'id', 'commander', 'cmd']`).
- `operator` — the operator to match (e.g., `>=`, `:`, `=`).
- `negated` — if `true`, match only FIELD nodes that are direct children of a NOT node. If `false`, match only FIELD nodes that are **not** children of a NOT node.

The search uses **depth-first, pre-order traversal**, which finds the leftmost (earliest in query string order) matching node. The `BreakdownNode.label` for FIELD nodes has the format `field + operator + value` (e.g., `ci>=r`). For NOT-leaf nodes, the label is `-field + operator + value` (e.g., `-ci>=r`) and the type is `NOT`.

The label preserves the original field name as the user typed it — `ci>=r`, `identity>=r`, `cmd>=r`, etc. The search must extract the field portion of the label and check it against **all** aliases in the `field` list. For example, a search for `field=['ci', 'identity', 'id', 'commander', 'cmd']` with `operator='>='` matches labels `ci>=r`, `identity>=r`, `cmd>=wu`, etc.

### Active state detection

To render visual state on bars and × buttons, the component needs to determine whether each filter is currently "on." This requires access to the breakdown tree, not just the histograms.

For each bar/button, "active" means the relevant term is present in the AST:

| Row | Bar active when | × active when |
|---|---|---|
| W/U/B/R/G | `ci>=` node exists (un-negated) AND its value contains the color letter | `ci:` node exists (un-negated) AND its value does NOT contain the color letter; OR no `ci:` node exists and a `ci:wubXg`-style term (missing this letter) exists |
| Colorless | `ci=c` or `ci:c` node exists (un-negated) | `-ci=c` or `-ci:c` node exists |
| Multicolor | `ci:m` node exists (un-negated) | `-ci:m` node exists |
| MV (0–6) | `mv=N` node exists (un-negated) | `-mv=N` node exists |
| MV (7+) | `mv>=7` node exists (un-negated) | `-mv>=7` node exists |
| Type | `t:X` node exists (un-negated) | `-t:X` node exists |

### Toggle behavior by histogram type

#### Color Identity: W/U/B/R/G (bar click — drill)

These five bars share a single `ci>=` node. Clicking a bar accumulates or removes a color letter from that node's value. When writing the value back, colors are always serialized in **WUBRG order** — the standard Magic color ordering. The implementation parses the current value into a color bitmask, sets or clears the toggled color's bit, then serializes back in canonical order.

**Toggle on** (color letter NOT in existing node, or no node exists):
1. Search for un-negated FIELD node with field ∈ `{ci, identity, id, commander, cmd}` and operator `>=`.
2. If found: add the color to the value and splice the canonicalized result via `valueSpan`. E.g., `ci>=r` + U → `ci>=ur`.
3. If not found: append `ci>=X` to the query.

**Toggle off** (color letter IS in existing node):
1. Find the node as above.
2. Remove the color letter from the value and splice the canonicalized result. E.g., `ci>=ur` − U → `ci>=r`.
3. If the value becomes empty after removal: remove the entire node via its `span`.

#### Color Identity: W/U/B/R/G (× click — exclude)

Exclusion operates on the first un-negated `ci:` (colon) node, which encodes "color identity is a subset of these colors." Excluding a color means removing it from the allowed set.

A color is "currently excluded" when a `ci:` node exists and its value does **not** contain that color letter. A color is "not currently excluded" when no `ci:` node exists, or the node's value contains the letter. The same WUBRG canonicalization applies — edits parse the value to a bitmask, toggle the bit, and serialize in canonical order.

**Toggle on** (color is NOT currently excluded → exclude it):
1. Search for un-negated FIELD node with field ∈ `{ci, identity, id, commander, cmd}` and operator `:`.
2. If found: remove the color letter from the value and splice the canonicalized result via `valueSpan`. E.g., `ci:wubrg` → `ci:wubg` (excluding red).
3. If not found: append `ci:` with all five colors minus the excluded one. E.g., excluding red → append `ci:wubg`.

**Toggle off** (color IS currently excluded → un-exclude it):
1. Find the `ci:` node as above.
2. Add the color letter back to the value and splice the canonicalized result. E.g., `ci:wubg` → `ci:wubrg`.
3. If the value becomes `wubrg` (all five colors): remove the node entirely — it's a tautological constraint.

**Interaction with colorless:** If the `ci:` node's value is `c` (colorless only), adding a color letter to it produces a semantically questionable value like `cw`. The spec for colorless × (below) handles the `ci:c` case independently. The WUBRG × logic should skip `ci:` nodes whose value is exactly `c` or `m` — these are special-purpose nodes, not the WUBRG subset constraint.

#### Color Identity: Colorless (bar and ×)

Colorless is an independent node-level toggle. It does not share a node with the WUBRG bars.

**Bar click (drill):**
1. Search for un-negated FIELD node with field ∈ `{ci, identity, ...}`, operator `:`, and value `c`.
2. Found → remove the node (toggle off).
3. Not found → append `ci:c` (toggle on).

**× click (exclude):**
1. Search for NOT-wrapped FIELD node with field ∈ `{ci, identity, ...}`, operator `:`, and value `c`.
2. Found → remove the NOT node (toggle off).
3. Not found → append `-ci:c` (toggle on).

Note: detecting "value is `c`" requires inspecting the label. The search function finds candidates by field + operator + negation; the caller checks the value.

#### Color Identity: Multicolor (bar and ×)

Multicolor is also an independent node-level toggle, using the pseudo-value `m`.

**Bar click (drill):**
1. Search for un-negated FIELD node with field ∈ `{ci, identity, ...}`, operator `:`, and value `m`.
2. Found → remove (toggle off).
3. Not found → append `ci:m` (toggle on).

**× click (exclude):**
1. Search for NOT-wrapped FIELD node with field ∈ `{ci, identity, ...}`, operator `:`, and value `m`.
2. Found → remove (toggle off).
3. Not found → append `-ci:m` (toggle on).

#### Mana Value (bar and ×)

Each MV bar is an independent node-level toggle. The eight bars correspond to exact values 0–6 and the `>=7` bucket.

**Bar click (drill) for MV 0–6:**
1. Search for un-negated FIELD with field ∈ `{mv, cmc, manavalue}`, operator `=`, value `N`.
2. Found → remove (toggle off).
3. Not found → append `mv=N` (toggle on).

**Bar click (drill) for MV 7+:**
1. Search for un-negated FIELD with field ∈ `{mv, cmc, manavalue}`, operator `>=`, value `7`.
2. Found → remove (toggle off).
3. Not found → append `mv>=7` (toggle on).

**× click (exclude) for MV 0–6:**
1. Search for NOT-wrapped FIELD with field ∈ `{mv, cmc, manavalue}`, operator `=`, value `N`.
2. Found → remove (toggle off).
3. Not found → append `-mv=N` (toggle on).

**× click (exclude) for MV 7+:**
1. Search for NOT-wrapped FIELD with field ∈ `{mv, cmc, manavalue}`, operator `>=`, value `7`.
2. Found → remove (toggle off).
3. Not found → append `-mv>=7` (toggle on).

#### Card Type (bar and ×)

Each type bar is an independent node-level toggle.

**Bar click (drill):**
1. Search for un-negated FIELD with field ∈ `{t, type}`, operator `:`, value matching the type.
2. Found → remove (toggle off).
3. Not found → append `t:creature` (or whichever type).

**× click (exclude):**
1. Search for NOT-wrapped FIELD with field ∈ `{t, type}`, operator `:`, value matching the type.
2. Found → remove (toggle off).
3. Not found → append `-t:creature`.

### Node removal

Toggling off requires removing a node from the query string. Two cases:

**Leaf node removal (direct child of root AND):** Splice the node's `span` out of the query string. Collapse any resulting double-space into a single space, and trim leading/trailing whitespace.

**Nested node removal (inside OR or nested AND):** Use the parent-subtree reconstruction approach from Spec 036 § 5: reconstruct the parent subtree with the target child removed, then splice the result at the parent's span.

**Single-term removal:** If the node is the only term in the query, removing it produces an empty string, which clears the search.

### Prop changes

`ResultsBreakdown` currently receives:

```typescript
{
  histograms: Histograms
  onAppendQuery: (term: string) => void
}
```

It needs additional context to perform toggle logic:

```typescript
{
  histograms: Histograms
  breakdown: BreakdownNode | null
  query: string
  onSetQuery: (query: string) => void
}
```

- `breakdown` — the current AST breakdown tree, used by `findFieldNode` to detect active state and locate nodes for modification.
- `query` — the current query string, used as the base for splice operations.
- `onSetQuery` — replaces `onAppendQuery`. Sets the query string directly (the component computes the full new query internally).

### Visual state

Active bars and × buttons need visual differentiation to indicate their toggle state:

**Active bar (filter is on):**
- The bar itself already has a fill proportional to the histogram count. Add a subtle highlight or background tint to the clickable row area to indicate the filter is active. E.g., a faint background matching the bar color at low opacity.

**Active × (exclusion is on):**
- The × icon changes to a persistent color (e.g., `text-red-500`) instead of showing color only on hover.

Exact visual treatment is left to implementation. The key requirement is that the user can glance at the histogram and see which filters are active without reading the query string.

## Scope of Changes

| File | Change |
|---|---|
| `app/src/ResultsBreakdown.tsx` | Replace `onAppendQuery` with `onSetQuery`; accept `breakdown` and `query` props; implement toggle logic per histogram type; add visual active state |
| `app/src/App.tsx` | Pass `breakdown()`, `query()`, and a `setQuery`-based callback to `ResultsBreakdown` instead of `appendQuery` |
| `app/src/query-edit.ts` (new) | `sealQuery`, `findFieldNode`, `spliceQuery`, and helper functions shared between `ResultsBreakdown` and future TERMS drawer controls |

The `query-edit.ts` module contains the search, splice, and query-preparation logic that will also be used by the color identity checkboxes (future spec) in the TERMS drawer. Extracting it now avoids duplication later.

## Test Strategy

### Unit tests for `findFieldNode`

| Breakdown tree | Search params | Expected result |
|---|---|---|
| `AND(ci>=r, t:creature)` | field=`[ci,identity,...]`, op=`>=`, negated=false | `ci>=r` node |
| `AND(ci>=r, t:creature)` | field=`[ci,identity,...]`, op=`>=`, negated=true | `null` |
| `AND(-ci>=r, t:creature)` | field=`[ci,identity,...]`, op=`>=`, negated=true | `-ci>=r` NOT node |
| `AND(-ci>=r, ci>=u)` | field=`[ci,identity,...]`, op=`>=`, negated=false | `ci>=u` node |
| `OR(ci>=r, t:creature)` | field=`[ci,identity,...]`, op=`>=`, negated=false | `ci>=r` node |
| `AND(t:creature)` | field=`[ci,identity,...]`, op=`>=`, negated=false | `null` |

### Unit tests for toggle logic

**Color identity WUBRG drill:**

| Initial query | Action | Expected result |
|---|---|---|
| (empty) | click R bar | `ci>=r` |
| `ci>=r` | click R bar | (empty) |
| `ci>=r` | click U bar | `ci>=ur` |
| `ci>=ur` | click R bar | `ci>=u` |
| `ci>=r t:creature` | click U bar | `ci>=ur t:creature` |
| `t:creature ci>=r` | click R bar | `t:creature` |
| `ci>=r` | click W bar | `ci>=wr` |

**Color identity WUBRG exclude:**

| Initial query | Action | Expected result |
|---|---|---|
| (empty) | × on R | `ci:wubg` |
| `ci:wubg` | × on R | (empty) |
| `ci:wub` | × on U | `ci:wb` |
| `ci:wb` | × on U | `ci:wub` |
| `ci:wb` | × on W | `ci:b` |
| `ci:b` | × on B | (empty) |

**Colorless toggle:**

| Initial query | Action | Expected result |
|---|---|---|
| (empty) | click C bar | `ci:c` |
| `ci:c` | click C bar | (empty) |
| (empty) | × on C | `-ci:c` |
| `-ci:c` | × on C | (empty) |

**Mana value toggle:**

| Initial query | Action | Expected result |
|---|---|---|
| (empty) | click MV 3 bar | `mv=3` |
| `mv=3` | click MV 3 bar | (empty) |
| `mv=3` | click MV 5 bar | `mv=3 mv=5` |
| (empty) | × on MV 3 | `-mv=3` |
| `-mv=3` | × on MV 3 | (empty) |

**Type toggle:**

| Initial query | Action | Expected result |
|---|---|---|
| (empty) | click Creature bar | `t:creature` |
| `t:creature` | click Creature bar | (empty) |
| (empty) | × on Creature | `-t:creature` |
| `-t:creature` | × on Creature | (empty) |

### Splice correctness

Verify that toggling preserves surrounding text:

| Initial query | Action | Expected result |
|---|---|---|
| `f:edh ci>=r t:creature` | click U bar | `f:edh ci>=ur t:creature` |
| `f:edh ci>=ur t:creature` | click R bar | `f:edh ci>=u t:creature` |
| `f:edh  ci>=r  t:creature` | click R bar (toggle off) | `f:edh    t:creature` (extra space acceptable) |

## Edge Cases

### User-typed queries with aliases

The user may type `identity>=wu` instead of `ci>=wu`. The search matches on any alias in the field set, so the toggle finds and modifies the node in place regardless of which alias was used. The alias is preserved, but the value is canonicalized to WUBRG order — `identity>=wu` + R → `identity>=wur`.

### Multiple `ci>=` nodes

The query `ci>=r OR ci>=u` has two `ci>=` nodes. DFS finds the first (`ci>=r`). Clicking the U bar modifies it to `ci>=ru`, even though a separate `ci>=u` exists. This may produce a semantically redundant query (`ci>=ru OR ci>=u`), but it is not incorrect. Consolidating multiple nodes is out of scope (as discussed — contradictory queries can be intentional on DFC-aware fields).

### WUBRG × skip of special values

The WUBRG × logic searches for a `ci:` node to manipulate. It must skip nodes whose value is `c` (colorless) or `m` (multicolor), since those are special-purpose constraints, not the WUBRG subset constraint. The search finds the first `ci:` node whose value consists only of WUBRG letters (any subset of `wubrg`, case-insensitive).

### × creating `ci:wubrg`

If a `ci:` node's value reaches `wubrg` (all five colors), it means "identity is a subset of all colors" — a tautology. The node should be removed. This happens when the user toggles off the last exclusion: e.g., `ci:wubg` (R excluded) → × on R → would produce `ci:wubrg` → remove entirely.

### Empty query after removal

Removing the only term in a query produces an empty string. This clears the search and returns the user to the landing state, which is consistent with the existing behavior when removing the last term via the breakdown × button (Spec 023).

### Unclosed delimiters before append

The query may contain unclosed syntactic constructs — an unclosed quote (`name:"ang`), unclosed regex (`name:/ang`), or unclosed parenthesis (`(t:creature`). Naively appending a term produces broken results: `name:/ang ci>=w` puts `ci>=w` inside the regex, because the lexer consumes to EOF when it cannot find a closing delimiter.

Before any append operation, unclosed delimiters must be closed. The `sealQuery` function in `query-edit.ts` handles this:

1. Lex the query.
2. Inspect the last non-EOF token. If it is QUOTED and the source text (`query.slice(token.start, token.end)`) does not end with the matching quote character, append the closing quote. Same for REGEX and `/`.
3. Count `LPAREN − RPAREN` across all tokens. Append that many `)`.

The function closes inner delimiters first (quote/regex), then outer ones (parens). For example, `f:commander (t:enchantment OR name:"ang` → `f:commander (t:enchantment OR name:"ang")`.

This applies to both the existing `appendQuery` in `App.tsx` and the toggle-on append path in `ResultsBreakdown`.

### Appending to an OR-rooted query

When appending a new term and the current query's breakdown root is an OR node, the existing `appendQuery` wraps the current query in parentheses: `(existing) newterm`. The same logic applies here when a toggle-on requires appending. The query is sealed before wrapping.

## Out of Scope

- **TERMS drawer color identity checkboxes.** That is a separate spec. It will reuse `findFieldNode` and `spliceQuery` from `query-edit.ts`.
- **Consolidating duplicate nodes.** If the user manually types `ci>=r ci>=r`, the toggle does not merge them. It finds and modifies the first.
- **Whitespace normalization.** Removing a node may leave extra spaces. The splice utility does not normalize whitespace (Spec 036 § "Trailing whitespace after removal").

## Acceptance Criteria

1. Clicking a histogram bar that corresponds to an existing query term removes that term (toggle off).
2. Clicking a histogram bar that does not correspond to an existing term adds it (toggle on).
3. The × button follows the same toggle behavior for negated terms.
4. For WUBRG color identity drill bars, repeated clicks on different colors accumulate into a single `ci>=` node (e.g., `ci>=ru`) rather than appending separate terms.
5. For WUBRG color identity × buttons, exclusion manipulates a shared `ci:` node, removing or adding color letters.
6. Colorless, multicolor, mana value, and type bars use independent node-level toggles.
7. Active bars and × buttons are visually distinguishable from inactive ones.
8. All toggles are reversible — two clicks on the same control returns the query to its previous state.
9. In-place edits preserve surrounding query text byte-for-byte (verified via source spans).
10. `findFieldNode` and `spliceQuery` are extracted into a shared module (`query-edit.ts`) for reuse by future TERMS drawer controls.

## Implementation Notes

- 2026-02-25: The WUBRG color identity (bar and ×) and colorless sections of this spec are superseded by Spec 043 (Graduated Color Identity Interaction), which replaces the binary toggle model with a graduated "more / less" progression through `ci>=` → `ci:` → `ci=` levels. The mana value and card type sections remain authoritative. The shared infrastructure (`findFieldNode`, `spliceQuery`, `removeNode`, `sealQuery`) is unchanged.
- 2026-02-26: The multicolor section is also superseded by Spec 043. Multicolor bar/× now follow "more / less" semantics (idempotent when already active, cross-removal of the opposite node) instead of the binary toggle model.
