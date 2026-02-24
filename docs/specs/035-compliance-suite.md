# Spec 035: Compliance Suite

**Status:** Implemented 

**Depends on:** ADR-013 (Scryfall Search Parity), Spec 002 (Query Engine)

## Goal

Provide an automated, repeatable way to verify that Frantic Search's query engine produces correct results for a curated set of queries, and to detect when Scryfall's behavior changes. The suite replaces ad-hoc manual `diff`-based comparison (documented in `docs/guides/scryfall-comparison.md`) with a structured, executable test corpus.

## Background

Over the course of building the query engine, we have reverse-engineered numerous undocumented details of Scryfall's search semantics — how `*` is treated in numeric comparisons (Spec 034), how card-level evaluation works across DFC faces (Spec 033), how `is:` keywords are derived from card data (Spec 032), and so on. These findings currently live scattered across specs and are validated only by synthetic unit tests.

Synthetic tests prove the evaluator implements the *spec* correctly. They do not prove the spec is correct against the *reference implementation*. A compliance suite closes this gap by testing against real card data (locally) and optionally verifying assumptions against the Scryfall API.

## Non-Goals

- **Bug-for-bug parity with Scryfall.** ADR-013 establishes that we intentionally diverge in areas like result aggregation (Specialize variants, playtest cards). The suite accommodates these via divergence annotations.
- **Exhaustive query coverage.** The suite is curated, not generated. Each test case exists to exercise a specific semantic edge case or protect a past bug fix.
- **Performance benchmarking.** This is a correctness tool, not a speed tool.

## Location

The compliance suite lives inside the existing `cli/` workspace as a new `compliance` subcommand. The CLI already has the data-loading and query-evaluation plumbing; adding a subcommand avoids a fifth top-level workspace, keeps the monorepo lean, and reuses the existing `cac` CLI framework. The YAML parsing library is a new dependency of `cli/`, but it is small and dev-only in spirit (no production code path uses it).

Suite definition files live alongside the CLI source:

```
cli/
├── suites/
│   ├── numeric.yaml       # Power, toughness, loyalty, defense comparisons
│   ├── color.yaml         # Color and color identity
│   ├── text.yaml          # Name, oracle text, type line matching
│   ├── operators.yaml     # AND, OR, NOT, parentheses
│   ├── is-keywords.yaml   # is: operator keywords
│   ├── mana.yaml          # Mana cost matching
│   └── legality.yaml      # Format legality
└── src/
    ├── index.ts           # Existing CLI entry point (adds compliance subcommand)
    ├── compliance/
    │   ├── run.ts         # Compliance subcommand handler
    │   ├── local.ts       # Runs queries against shared/ engine + real data
    │   ├── scryfall.ts    # Runs queries against Scryfall API (verification mode)
    │   ├── loader.ts      # Parses YAML suite files
    │   └── reporter.ts    # Formats and prints results
    └── ...                # Existing parse/search commands
```

## Test Definition Format

Each suite file is a YAML document containing an array of test cases.

### Schema

```yaml
- name: "Human-readable description"
  query: "pow<2 pow>2"

  # Optional: use a different query string for Scryfall verification.
  # Common when Scryfall requires extra qualifiers like include:extras
  # to match our broader result set (see ADR-013), or when our syntax
  # diverges from Scryfall's. Any test with count assertions that cover
  # funny/digital/Specialize cards will likely need this.
  scryfall_query: "pow<2 pow>2 include:extras"

  assertions:
    # At least one assertion is required.

    contains:            # These card names MUST appear in results.
      - "Delver of Secrets"
      - "Tarmogoyf"

    excludes:            # These card names MUST NOT appear in results.
      - "Colossal Dreadmaw"

    count_min: 45        # Result count >= this value.
    count_max: 60        # Result count <= this value.
    count: 10            # Result count == this value (use sparingly).

  # Optional: mark as a known divergence from Scryfall.
  # Effect depends on mode:
  #   Local mode  — test runs normally; the annotation is informational.
  #   Verify mode — test is skipped for Scryfall verification and
  #                 reported in a separate "divergences" section.
  # Always include a reference to the spec or ADR that documents the
  # divergence rationale.
  divergence: "1d4+1 is parsed as 2 locally vs 141 on Scryfall (Spec 034)"
```

### Assertion Semantics

| Assertion | Meaning |
|---|---|
| `contains` | Every listed card name must be present in the local result set. Case-insensitive match against front face name or combined name (see § Card Name Matching). |
| `excludes` | No listed card name may be present in the local result set. |
| `count` | The result count must exactly equal this number. **Fragile** — breaks whenever the bulk data changes. Reserve for truly fixed sets (e.g., `is:shockland`). Prefer `count_min` + `count_max` with equal values when an exact count is needed but the set may grow. |
| `count_min` | The result count must be at least this number. Preferred over `count` for open-ended queries where new cards may be printed. |
| `count_max` | The result count must be at most this number. Guards against wildly inflated results from a bug. Pair with `count_min` for bounded ranges. |

All assertions in a test case must pass for the test to pass.

### Card Name Matching

`contains` and `excludes` match each result card against both the **front face name** (`names[canonicalFace[i]]`) and the **combined name** (`combined_names[canonicalFace[i]]`). A card satisfies a `contains` entry if either name matches (case-insensitive). This means:

- Single-face cards match on their name (front face and combined name are identical).
- DFCs and Transform cards can be referenced by front face name alone (e.g., `"Delver of Secrets"`), avoiding the name-format divergence documented in ADR-013.
- Split cards and other multi-face cards can be referenced by their combined name (e.g., `"Claim // Fame"`) when the test needs to identify a specific card whose front-face name is ambiguous or when the combined form is more recognizable.

Test authors should prefer front face names for clarity and only use the combined `"A // B"` form when necessary to disambiguate.

## Runner Modes

### Local Mode (default)

```bash
npm run cli -- compliance
```

1. Load `data/dist/columns.json` into a `CardIndex`.
2. For each test case in each suite file:
   - Parse and evaluate the query.
   - Check all assertions against the result set.
3. Report pass/fail per test case.
4. Exit non-zero if any non-divergence test fails.

This mode requires no network access and runs in seconds. It is suitable for CI.

### Scryfall Verification Mode

```bash
npm run cli -- compliance --verify
```

1. For each test case (excluding those with `divergence` set):
   - Run the `scryfall_query` (or `query` if no override) against the Scryfall API.
   - Check the same `contains`, `excludes`, and `count*` assertions against Scryfall's results.
2. Report any assertion failures — these indicate our test expectations may be wrong, or Scryfall's behavior has changed.

This mode is **not** for CI. It is a manual audit tool run periodically (e.g., after a bulk data update) to validate that our test expectations still hold.

### Rate Limiting

The Scryfall client must wait at least 100ms between any two HTTP requests to the Scryfall API — this includes delays between test cases and between pagination requests within a single test. Test cases should be designed to avoid pagination (< 175 results) — prefer specific edge-case queries over broad ones. If a test unavoidably returns more than 175 results, the client follows `next_page` links with the same 100ms minimum delay.

## Data Prerequisites

Local mode requires `data/dist/columns.json`, which is git-ignored and produced by the ETL pipeline (`npm run etl -- download && npm run etl -- process`). The runner must check for this file on startup and exit with a clear error message if it is missing, directing the user to run the ETL commands.

For CI, there are two options:

1. **Pre-built artifact (recommended).** Cache `data/dist/columns.json` as a CI artifact, refreshed periodically (e.g., weekly or on-demand). This avoids a network dependency and keeps runs fast.
2. **On-the-fly ETL.** Run the download and process steps before the compliance suite. This guarantees freshness but adds ~30 seconds and a Scryfall network dependency to every CI run.

The compliance suite should **not** be part of the default `npm test` command. It is a separate CI step (or manual step) with its own data prerequisites.

## Error Handling

| Condition | Behavior |
|---|---|
| YAML syntax error in a suite file | Hard failure. Report the file name and parse error, then exit non-zero. Malformed suite files are author errors that must be fixed before any tests run. |
| Missing required field (`name`, `query`, or `assertions`) | Hard failure for that suite file. Report the invalid test case and skip the rest of the file. |
| Empty `assertions` (no contains/excludes/count fields) | Hard failure for that test case. At least one assertion is required. |
| Query parses to a degenerate AST (e.g., empty string) | The test runs normally. If the result set is empty and the test has `contains` assertions, those assertions fail. The runner does not special-case zero-result evaluations. |
| Scryfall API returns an error (verify mode) | Report the HTTP status and error body for that test case, mark it as an error (distinct from pass/fail), and continue with the remaining tests. |
| Scryfall API rate limit (429) | Retry after the `Retry-After` header value (or 1 second if absent), up to 3 retries. If still throttled, report the test as an error and continue. |
| `data/dist/columns.json` missing | Exit immediately with a message directing the user to run the ETL pipeline. |

## Adding a Test Case

When you discover a new edge case (via bug report, spec work, or manual comparison):

1. Write a test case in the appropriate suite file.
2. Run `npm run cli -- compliance` to verify it passes locally.
3. Run `npm run cli -- compliance --verify` to confirm Scryfall agrees (if applicable).
4. If Scryfall disagrees and we're intentionally diverging, add a `divergence` annotation with a reference to the relevant spec or ADR.

## Relationship to Other Documentation

| Document | Contains |
|---|---|
| **ADRs** | *Why* we made a cross-cutting decision (e.g., ADR-013: we don't aim for strict parity). |
| **Specs** | *How* a feature works and what we decided for edge cases (e.g., Spec 034: `*` → 0). |
| **Compliance suite** | *What* the real world does — executable assertions against real card data, verifiable against Scryfall. |
| **Comparison guide** | *How to investigate* a discrepancy manually (ad-hoc workflow, still useful for one-off debugging). |

Findings migrate from specs into the compliance suite as test cases. Specs retain the design rationale; the suite holds the empirical proof.

## Acceptance Criteria

1. `npm run cli -- compliance` loads suite YAML files, runs queries against the local engine with real card data, and reports pass/fail per test case.
2. `npm run cli -- compliance --verify` runs the same assertions against the Scryfall API (with rate limiting) and reports discrepancies.
3. Divergence-annotated tests are reported separately and do not cause a non-zero exit in local mode.
4. At least one suite file exists with at least 5 test cases covering empirical findings from Specs 032–034 (is-operator keywords, card-level evaluation, numeric stat values).
5. The runner produces clear, readable output: test name, query, pass/fail, and on failure, which assertion failed and why.
6. Adding a new test case requires only editing a YAML file — no TypeScript changes needed.
