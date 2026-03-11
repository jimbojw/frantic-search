// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext } from 'solid-js'
import type { Accessor } from 'solid-js'
import type {
  DeckFormat,
  InstanceState,
  LineValidation,
  ListValidationResult,
  QuickFix,
} from '@frantic-search/shared'
import type { EditorMode } from './types'

/** Spec 118: context captured when user taps Bug in deck editor toolbar */
export interface DeckReportContext {
  listContent: string
  format: string
  listName: string
  listId: string
  mode: 'display' | 'edit'
  validationErrors: LineValidation[]
  instanceCount?: number
}

export interface DeckEditorContextValue {
  mode: Accessor<EditorMode>
  instances: Accessor<InstanceState[]>
  draftText: Accessor<string | null>
  baselineText: Accessor<string | null>
  selectedFormat: Accessor<DeckFormat>
  serializedText: Accessor<string>
  validation: Accessor<ListValidationResult | null>
  validationErrors: Accessor<LineValidation[]>
  hasValidationErrors: Accessor<boolean>
  hasChanges: Accessor<boolean>
  editDiffSummary: Accessor<{ additions: number; removals: number } | null>
  editFormatLabel: Accessor<string>
  textareaValue: Accessor<string>
  highlightText: Accessor<string>
  highlightValidation: Accessor<ListValidationResult | null>
  workerStatus: Accessor<'loading' | 'ready' | 'error'>
  isValidating: Accessor<boolean>
  applyInProgress: Accessor<boolean>
  copied: Accessor<boolean>
  quickFixApplying: Accessor<{ lineIndex: number; fixIndex: number } | null>
  handleEdit: () => void
  handleCancel: () => void
  handleRevert: () => void
  handleApply: () => void
  handleCopy: () => void
  handleFormatSelect: (format: DeckFormat) => void
  handleInput: (e: Event) => void
  applyQuickFix: (err: LineValidation, fix: QuickFix, fixIndex: number) => void
  registerTextareaRef: (el: HTMLTextAreaElement | null) => void
  handleDeckReport: () => void
}

export const DeckEditorContext = createContext<DeckEditorContextValue | undefined>(undefined)

export function useDeckEditorContext(): DeckEditorContextValue {
  const ctx = useContext(DeckEditorContext)
  if (!ctx) {
    throw new Error('useDeckEditorContext must be used within DeckEditor')
  }
  return ctx
}
