# Comparing List Contents with Search Results

When the My List feature and search results disagree — for example, a list contains one specific printing but the search shows multiple — it's important to have a repeatable way to investigate. This guide covers how to use the `list-diff` CLI tool to compare list contents against search output. See Spec 120 for the full design.

## When to Compare

- You've added or changed list mask building or `my:list` evaluation logic.
- A `my:list` query returns a suspicious number of results (e.g., "1 card (2 prints)" when the list has only one printing).
- You're debugging discrepancies between what's in a list and what the search displays.

## List Diff Workflow

**Recommended:** Use the `list-diff` subcommand:

```bash
# From file
npm run cli -- list-diff "v:images unique:prints include:extras my:list" --list ./my-list.txt

# From stdin (use --list=- as shell may not pass - correctly with --list -)
echo "1x Dawn of Hope (ltc) 164 [Draw]" | npm run cli -- list-diff "v:images unique:prints include:extras my:list" --list=-
```

This parses the deck list, builds masks, runs the query, and reports:
- **In Both:** Cards/printings that match between list and search.
- **Only in List:** In the list but not returned by search (possible under-match bug).
- **Only in Search:** Returned by search but not in the list (possible over-match bug).

Use `--quiet` for comparison keys only.

## Prerequisite: Search with List

To run `my:list` queries in the CLI at all, use `search` with `--list`:

```bash
echo "1x Lightning Bolt" | npm run cli -- search "my:list" --list=- --output names
```

This enables ad-hoc debugging without the full list-diff comparison.

## Deck List Format

The tool accepts the same deck list formats as the app: Archidekt, Moxfield, MTGGoldfish, TappedOut, Arena, Melee. See Spec 108 for format details.

Printing-level entries (set + collector number) are resolved to specific printings. Name-only entries are resolved to card level; with `unique:prints`, they expand to canonical nonfoil per Spec 077.

## Interpreting Results

| Scenario | Meaning |
|----------|---------|
| **Only in Search** | Search returned cards/printings not in the list. Likely bug in mask building or `my:list` + `unique:prints` override. |
| **Only in List** | List has entries the search didn't return. Could be validation/parsing issue or evaluator under-matching. |
| **In Both = Expected = Actual** | No discrepancy; list and search agree. |

## Related

- **Spec 120** — CLI list-diff subcommand design.
- **Spec 077** — `my:list` query semantics and `unique:prints` override.
- **Spec 076** — List mask cache and `getListMask`.
- **Scryfall comparison** — For non-`my:list` queries, use `docs/guides/scryfall-comparison.md` and the `diff` subcommand.
