# Spec 186: CLI `deck-score` Subcommand

**Status:** Draft

**Depends on:** Spec 185 (Deck Characteristic Engine), Spec 114 / Spec 116 (deck list validation), Spec 120 (CLI list input patterns — `--list` file/stdin), Spec 110 (Hybrid Deck Editor — list text is the same product surface), ADR-011 (CLI workspace)

**Related:** Spec 069 (CLI `diff` — diagnostics + summary output), Spec 120 (`list-diff` — list parsing and masks)

## Goal

Add a **`deck-score`** subcommand to the CLI that runs a **plain-text deck list** through the same **Spec 185** deck scoring pipeline used by the search worker (Salt, Conformity, Bling on the 0–1000 display scale). The command exists for **developers, tuning, and automation** (including AI agents): it must be script-friendly, repeatable, and **parity-aligned** with in-app scores for the same resolved deck.

Input is **only** the deck list (file or stdin); no query string is required.

## Background

Spec 185 defines weights, p-means, Renard scaling, and coverage. The worker computes scores from `ResolvedInstance[]` after the app resolves list instances. Today there is no command-line way to score an arbitrary list file against **local processed data** without running the SPA.

This subcommand closes that gap: load `columns.json` / `printings.json`, validate and resolve the list, emit **final scores** plus **diagnostic context** so users can interpret results, debug validation issues, and compare runs when parameters (e.g. `p`) or exclusions change.

**List text parity:** The command is not a separate “strict MTGO subset” format. It accepts the **same liberal deck list text** as the Deck Editor and other CLI list consumers: same lexer/parser behavior, same resolution rules, same `ParsedEntry` outcomes. That parity is intentional so a list pasted in the app scores the same as the same file passed to `deck-score`.

## Requirements

### 1. Invocation

- **Syntax:** `frantic-search deck-score --list <path>` or `frantic-search deck-score --list -` (or `npm run cli -- deck-score --list …`).
- **List input:** `--list <path>` reads a deck list from a file; **`--list -`** reads from **standard input** (same convention as `search --list` / `list-diff --list`; document shell usage, e.g. `npm run cli -- deck-score --list=-` when the shell mishandles `--list -`).
- **Help:** `--help` describes flags, stdin behavior, and data prerequisites.

### 2. Data loading

- Load **`columns.json`** and, when present, **`printings.json`**, using the same path defaults and **`--data` / `--printings` overrides** as the existing `search` / `diff` / `list-diff` commands.
- **Scoring weights** (Spec 185 Step 1) require printing columnar data for Bling weights and cheapest-printing-per-face. If **`printings.json` is missing** (or printing data cannot be loaded), the implementation must either:
  - **Refuse** with a clear error and non-zero exit, or
  - **Document** a defined degraded behavior (e.g. Salt/Conformity only with Bling fixed to 0 and a stderr warning).

  Prefer **one** behavior and state it normatively here; the default recommendation is **fail fast** unless a compelling parity reason exists for partial scoring.

- **Supplemental tag files** (`otags.json`, etc.) are **not** required for deck scoring; do not require them for this command.

### 3. List text and shared resolution (normative)

- **Acceptance:** Deck list text is whatever the **index-based validation engine** accepts — the same pipeline as **`search --list`**, **`list-diff`**, and the Deck Editor’s validation (worker **`validate-list`** / shared **`validateDeckListWithEngine`**). Do **not** introduce a second, stricter grammar for `deck-score`.
- **Reuse:** Implementation must **call shared resolution code** used elsewhere, not reimplement parsing or oracle/printing lookup. Concretely:
  - Validate the **full list text** with **`validateDeckListWithEngine`** → **`ValidationResult`** / **`ParsedEntry[]`** (same as `cli/src/list-utils.ts` today).
  - **`extractDisplayColumns`** / **`extractPrintingDisplayColumns`** from loaded data, then **`buildOracleToCanonicalFaceMap`**, **`buildPrintingLookup`**, and any other maps required for **`resolveInstancesForScoring`** — same as the worker / Lists flow.
  - Expand **`ParsedEntry[]`** to **`InstanceState[]`** (**one instance per physical copy**, `quantity` expansion, finish/oracle/scryfall fields) using **one shared helper** in `shared` if the app does not already export a single function — the CLI and app must not diverge on how a resolved line becomes instances.
  - **`resolveInstancesForScoring`** → **`ResolvedInstance[]`** (Spec 185), **omitting** unresolved entries (**`D`** semantics).

If a gap exists today (e.g. only the card list store builds `InstanceState[]` and no exported helper maps **`ParsedEntry[]` → `InstanceState[]`**), add the helper **once** in **`shared`** and use it from both the app and CLI.

### 4. Scoring pipeline (normative)

After **`ResolvedInstance[]`** is built in § 3, mirror **`app/src/worker.ts`** for **weight precomputation and `scoreDeck` only**:

1. Build **`DeckScoringWeights`** via **`buildSaltWeights`**, **`buildConformityWeights`**, **`buildBlingWeights`**, **`buildCheapestPrintingPerFace`** from columnar data.
2. **`scoreDeck(resolvedInstances, weights, config?)`** → **`DeckScores`**.

Optional **tuning flags** (for experimentation; defaults match Spec 185 / `score-deck.ts`):

- `--salt-p`, `--conformity-p`, `--bling-p` (positive reals; invalid values → error).

### 5. Output

Follow **CLI output conventions** (`cli/AGENTS.md`): **stdout** carries the **primary, structured result** suitable for piping; **stderr** carries **human-oriented diagnostics** (warnings, validation summary, file-not-found hints). Aligns with Spec 069 / 120 spirit: **not only raw numbers**.

#### 5.1 Stdout (machine-readable default)

- **Default:** print a **single JSON object** (pretty-print optional via `--pretty` or default compact; pick one and document) containing at least:
  - **`salt`**, **`conformity`**, **`bling`** — integers 0–1000 per Spec 185 Step 3.
  - **`saltCoverage`**, **`conformityCoverage`**, **`blingCoverage`** — each `{ "scoredCopies": number, "totalCopies": number }` per `DeckScores`.
  - **`deckSize`**: resolved instance count `D` (length of `ResolvedInstance[]` after drops).
  - **`parameters`**: `{ "saltP": number, "conformityP": number, "blingP": number }` (effective values after defaults).

Optional fields (recommended for transparency and diff-tool parity):

- **`preRenard`**: `{ "salt": number, "conformity": number, "bling": number }` — scaled **`raw × 1000`** per gauge **before** Renard (IEEE doubles). Omitted or `null` when gauge is logical true zero / empty deck per Spec 185; implementers may use a single object with nullable numbers.
- **`validation`**: summary of list processing, e.g. `{ "linesTotal": number, "linesOk": number, "linesError": number, "instancesUnresolved": number }` — exact keys are implementation choices if documented in `--help`.

#### 5.2 Stderr (diagnostics)

Emit **non-fatal** information to stderr, including where useful:

- Path to **`columns.json`** / **`printings.json`** used (or abbreviated).
- **Validation:** short summary of failed lines (line index + message) when errors exist; do not spam full deck text unless `--verbose`.
- **Dropped instances:** count of instances excluded from `D` (unresolved oracle/printing).
- **Warnings:** e.g. empty deck after resolution, degraded mode if ever supported.

**Verbose mode:** **`--verbose`** (or **`-v`**) may print additional stderr detail (e.g. per-unique-canonical-face salt/conformity metrics and weights for debugging). Not required for v1 minimum; if omitted initially, reserve the flag name in `--help` or omit until implemented.

#### 5.3 Quiet mode

- **`--quiet`**: reduce stderr noise; stdout must still contain the **same JSON schema** with **scores and coverage** (and recommended `deckSize` / `parameters`). Validation failures may still force non-zero exit (see § 6).

#### 5.4 Optional text output

- **`--format text`** (or similar): human-readable summary on stdout (scores + coverage + one-line validation summary). JSON remains the default for agent/script use.

### 6. Errors and exit codes

- **Missing `--list`:** error message + non-zero exit.
- **Missing or unreadable list file:** error + non-zero exit.
- **Missing `columns.json`:** same guidance as `search` (message referencing `npm run etl -- download` / `process`).
- **Validation:** if the list has **no** resolvable entries after validation (or **zero** resolved instances), exit **non-zero** with a clear message, unless the spec explicitly allows scoring an empty deck (Spec 185: empty → 0 scores — prefer **non-zero exit** for “nothing to score” so scripts detect failure, or exit 0 with all zeros — **choose one** and document; recommendation: **non-zero** when `D === 0` after resolution because it usually indicates a bad file).
- **Fatal errors:** non-zero exit; do not print partial JSON on stdout.

### 7. Non-goals (v1)

- **Zone filtering** (Commander-only, etc.) — out of scope unless Spec 185 is extended.
- **Automatic exclusion** of basic lands or other categories — out of scope; may be added later with flags and spec updates.
- **Network calls** — none; fully local.

## Acceptance Criteria

- [ ] `npm run cli -- deck-score --list <path>` runs when `data/dist/columns.json` and `printings.json` exist after ETL.
- [ ] `npm run cli -- deck-score --list=-` accepts a deck list on stdin.
- [ ] Stdout default is **JSON** including **salt**, **conformity**, **bling**, **coverage** objects, **deckSize**, and **parameters**.
- [ ] Stderr carries **diagnostic** information (paths, validation summary, dropped counts) unless **`--quiet`**.
- [ ] **`--data`** / **`printings`** overrides behave like other CLI commands.
- [ ] List parsing and **`ResolvedInstance[]`** construction use **shared** validation + resolution (§ 3); no parallel CLI-only parser.
- [ ] Scores match the worker’s **`scoreDeck`** output for the same **`ResolvedInstance[]`** and weight tables (within integer Renard output; floating **preRenard** may be compared with tolerance if exposed).
- [ ] **`--salt-p` / `--conformity-p` / `--bling-p`** override defaults when present.
- [ ] **`docs/specs/185-deck-characteristic-engine.md`** cross-referenced from implementation notes or CLI help text where appropriate.

## Implementation Notes

*(None yet — append when implementation deviates or ships.)*
