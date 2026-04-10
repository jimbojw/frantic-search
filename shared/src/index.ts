// SPDX-License-Identifier: Apache-2.0
export {
  Color,
  COLOR_FROM_LETTER,
  COLOR_NAMES,
  COLOR_COLORLESS,
  COLOR_MULTICOLOR,
  COLOR_IMPOSSIBLE,
  Format,
  FORMAT_NAMES,
  CardFlag,
  Rarity,
  RARITY_FROM_STRING,
  RARITY_NAMES,
  RARITY_ORDER,
  Finish,
  FINISH_FROM_STRING,
  PrintingFlag,
  Frame,
  FRAME_FROM_STRING,
  FRAME_NAMES,
  Game,
  GAME_NAMES,
  PROMO_TYPE_FLAGS,
} from "./bits";

export type {
  ColumnarData,
  PrintingColumnarData,
  SetLookupEntry,
  OracleTagData,
  IllustrationTagData,
  FlavorTagData,
  ArtistIndexData,
  KeywordData,
} from "./data";

export type { ToWorker, FromWorker, DisplayColumns, PrintingDisplayColumns, UniqueMode, BreakdownNode, Histograms } from "./worker-protocol";
export type { Suggestion } from "./suggestion-types";

export type {
  InstanceState,
  InstanceStateEntry,
  ListMetadata,
  ListMetadataEntry,
  MaterializedView,
  InstanceUpdatedMessage,
  ListMetadataUpdatedMessage,
  CardListBroadcastMessage,
} from "./card-list";
export {
  EXTERNAL_LIST_ID,
  TRASH_LIST_ID,
  DEFAULT_LIST_ID,
  BROADCAST_CHANNEL_NAME,
  KNOWN_ZONES,
} from "./card-list";

export { TokenType } from "./search/ast";
export type { ASTNode, BareWordNode, FieldNode, Token, QueryNodeResult, Span, SortDirective } from "./search/ast";
export { lex } from "./search/lexer";
export { CardIndex } from "./search/card-index";
export { PrintingIndex } from "./search/printing-index";
export { NodeCache, nodeKey, FIELD_ALIASES, getUniqueModeFromQuery } from "./search/evaluator";
export { collectInPrefixHintNormalizedCandidates } from "./search/eval-printing";
export type { TagDataRef, KeywordDataRef } from "./search/evaluator";
export { buildKeywordDataRef, buildKeywordEvalIndex } from "./search/eval-keywords";
export type { OracleTagEvalEntry, IllustrationTagEvalEntry } from "./search/eval-tags";
export { buildOracleTagEvalIndex, buildIllustrationTagEvalIndex } from "./search/eval-tags";
export {
  normalizeFlavorIndexForSearch,
  normalizeArtistIndexForSearch,
  resolveIllustrationTagsToPrintingRows,
} from "./supplemental-index-build";
export {
  EXTRAS_LAYOUT_SET,
  EXTRAS_LAYOUT_IS_KEYWORDS,
  DEFAULT_OMIT_SET_CODES,
  DEFAULT_OMIT_SET_TYPE_MEMORABILIA,
  isMemorabiliaDefaultOmit,
  isSetCodeWidenedByQuery,
  isSetTypeWidenedByQuery,
  isSetTypeWidenedByPrefixes,
} from "./search/default-filter";
export {
  printingPassesDefaultInclusionFilter,
  type DefaultInclusionPrintingRow,
} from "./search/default-inclusion-filter";
export { levenshteinDistance } from "./levenshtein";
export { normalizeAlphanumeric } from "./normalize";
export { IS_KEYWORDS, typeLineIsPermanent } from "./search/eval-is";
export { parse } from "./search/parser";
export { escapeMarkdownLinkText, formatMarkdownInlineLink } from "./markdown-link";
export { formatSlackCardReference } from "./slack-card-reference";
export { singleExactNameFromAst } from "./search/exact-name-from-ast";
export { toScryfallQuery } from "./search/canonicalize";
export { astUsesFranticExtensionSyntax } from "./search/query-extension-syntax";
export {
  resolveForField,
  expandIsKeywordsFromPrefix,
  expandIsKeywordsExact,
  collectIsNotPrefixHintNormalizedCandidates,
  normalizeForResolution,
  normalizeForTagResolution,
  matchesBoundaryAlignedPrefix,
} from "./search/categorical-resolve";
export {
  buildPrefixBranchHint,
  collapseBranchTokens,
  sortBranchTokens,
  type PrefixBranchHintMode,
} from "./search/prefix-branch-hint";
export type { ResolutionContext } from "./search/categorical-resolve";
export { queryForSortSeed } from "./search/query-for-sort";
export { getSortByFromQuery } from "./search/query-sort";
export { seededSort, seededSortPrintings, collectBareWords, fnv1a, sortByField, sortPrintingDomain, reorderPrintingsByCardOrder } from "./search/ordering";
export { getTrailingBareNodes, getBareNodes } from "./search/oracle-hint";
export { SORT_FIELDS } from "./search/sort-fields";
export type { SortFieldEntry } from "./search/sort-fields";
export { index, printingIndex, TEST_DATA, TEST_PRINTING_DATA } from "./search/evaluator.test-fixtures";
export {
  isKnownColorValue,
  getColorAlternatives,
  isTriggerField,
  isFormatOrIsValue,
  getFormatOrIsAlternatives,
  getArtistAtagAlternative,
  COLOR_TRIGGER_FIELDS,
  FORMAT_IS_TRIGGER_FIELDS,
  ARTIST_TRIGGER_FIELDS,
  ATAG_TRIGGER_FIELDS,
  COLOR_EQUALS_RELAX_FIELDS,
  IDENTITY_EQUALS_RELAX_FIELDS,
  getOperatorRelaxAlternatives,
  isUnknownKeywordIsNotError,
  parseIsNotInnerLabel,
  buildIsNotKwTReplacement,
  getIsNotKeywordWrongFieldAlternatives,
} from "./wrong-field-utils";
export type {
  ColorAlternative,
  FormatOrIsAlternative,
  ArtistAtagAlternative,
  OperatorRelaxAlternative,
  IsNotKeywordWrongFieldContext,
  IsNotKwTWrongFieldAlternative,
} from "./wrong-field-utils";
export {
  getBareTermAlternatives,
  getBareTagPrefixAlternatives,
  getMultiWordAlternatives,
  getAdjacentBareWindows,
} from "./bare-term-upgrade-utils";
export type { BareTermUpgradeContext, BareTermAlternative } from "./bare-term-upgrade-utils";
export { buildStrayCommaCleanedQuery, buildStrayCommaCleanup } from "./stray-comma-cleanup";
export type { StrayCommaCleanupResult } from "./stray-comma-cleanup";
export { buildFieldOperatorGapCleanup } from "./field-operator-gap-cleanup";
export type { FieldOperatorGapCleanupResult } from "./field-operator-gap-cleanup";
export { getNonexistentFieldRewrite, collectNonexistentFieldRewrites } from "./nonexistent-field-registry";
export type { NonexistentFieldRegistryEntry, NonexistentFieldRewrite } from "./nonexistent-field-registry";
export { lexDeckList, buildListSpans, ListTokenType } from "./list-lexer";
export type { ListToken, ListHighlightSpan, ListHighlightRole, QuickFix, LineValidation, LineValidationResult, ListValidationResult, ParsedEntry, ValidationResult } from "./list-lexer";
export { validateDeckListWithEngine, validateLines } from "./list-validate-engine";
export { detectDeckFormat } from "./list-format";
export type { DeckFormat } from "./list-format";
export {
  serializeArena,
  serializeMoxfield,
  formatMoxfieldCardLine,
  moxfieldPreviewLine,
  type MoxfieldPreviewLineParams,
  serializeArchidekt,
  serializeMtggoldfish,
  serializeMelee,
  serializeTappedOut,
  serializeTcgplayer,
  serializeManapool,
  serializeMtgsalvation,
  parsedEntriesFromInstances,
} from "./list-serialize";
export { importDeckList } from "./list-import";
export type { ImportCandidate, ImportResult } from "./list-import";
export { diffDeckList } from "./list-diff";
export type { DiffResult } from "./list-diff";
export { enrichDiffForPreserve } from "./enrich-diff-for-preserve";
export type { PreserveOptions } from "./enrich-diff-for-preserve";
export {
  extractDisplayColumns,
  extractPrintingDisplayColumns,
  buildKeywordsForFace,
} from "./display-columns";
export { resolveArtistForPrintingRow } from "./artist-printing-resolve";
export {
  tokenizeTypeLine,
  manaCostToCompactQuery,
  colorBitmaskToQueryLetters,
  colorIdentityMaskToManaCostString,
  faceColorMasksUniform,
} from "./card-detail-chips";
export {
  positionInEqualityPercentileBand,
  displayEqualityPercentileLabel,
  sortedArrayPosition,
} from "./percentile-chip-display";
export {
  buildOracleToCanonicalFaceMap,
  buildPrintingLookup,
  buildCanonicalPrintingPerFace,
  buildMasksForList,
  buildMasksFromParsedEntries,
  buildMetadataIndex,
  buildMetadataIndexFromInstances,
  getMatchingCount,
  countListEntriesPerCard,
  hasPrintingLevelEntries,
  getUniqueTagsFromView,
} from "./list-mask-builder";
export type {
  BuildMasksOptions,
  BuildMasksResult,
  BuildMetadataIndexOptions,
  MetadataIndexResult,
} from "./list-mask-builder";
