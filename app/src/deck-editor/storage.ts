// SPDX-License-Identifier: Apache-2.0
import type { DeckFormat } from '@frantic-search/shared'
import { ALL_FORMATS } from './serialization'

export function draftKey(listId: string): string {
  return `frantic-search-draft:${listId}`
}

export function baselineKey(listId: string): string {
  return `frantic-search-draft-baseline:${listId}`
}

export const FORMAT_KEY = 'frantic-search-deck-format'

export const PRESERVE_TAGS_KEY = 'frantic-deck-editor-preserve-tags'
export const PRESERVE_COLLECTION_STATUS_KEY = 'frantic-deck-editor-preserve-collection-status'
export const PRESERVE_VARIANTS_KEY = 'frantic-deck-editor-preserve-variants'

export function readDraftFromStorage(listId: string): string | null {
  try {
    const raw = localStorage.getItem(draftKey(listId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { text?: string }
    return typeof parsed.text === 'string' ? parsed.text : null
  } catch {
    return null
  }
}

export function writeDraftToStorage(listId: string, text: string): void {
  try {
    localStorage.setItem(
      draftKey(listId),
      JSON.stringify({ text, timestamp: Date.now() })
    )
  } catch {
    // localStorage may be full or blocked
  }
}

export function clearDraftFromStorage(listId: string): void {
  try {
    localStorage.removeItem(draftKey(listId))
    localStorage.removeItem(baselineKey(listId))
  } catch {
    // ignore
  }
}

export function readBaselineFromStorage(listId: string): string | null {
  try {
    return localStorage.getItem(baselineKey(listId))
  } catch {
    return null
  }
}

export function writeBaselineToStorage(listId: string, text: string): void {
  try {
    localStorage.setItem(baselineKey(listId), text)
  } catch {
    // ignore
  }
}

export function readFormatFromStorage(): DeckFormat {
  try {
    const v = localStorage.getItem(FORMAT_KEY)
    if (v && ALL_FORMATS.some((f) => f.id === v)) return v as DeckFormat
  } catch {
    // ignore
  }
  return 'arena'
}

export function writeFormatToStorage(format: DeckFormat): void {
  try {
    localStorage.setItem(FORMAT_KEY, format)
  } catch {
    // ignore
  }
}

function readPreserveBoolean(key: string): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return true
    return v === 'true'
  } catch {
    return true
  }
}

function writePreserveBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // ignore
  }
}

export function readPreserveTags(): boolean {
  return readPreserveBoolean(PRESERVE_TAGS_KEY)
}

export function writePreserveTags(value: boolean): void {
  writePreserveBoolean(PRESERVE_TAGS_KEY, value)
}

export function readPreserveCollectionStatus(): boolean {
  return readPreserveBoolean(PRESERVE_COLLECTION_STATUS_KEY)
}

export function writePreserveCollectionStatus(value: boolean): void {
  writePreserveBoolean(PRESERVE_COLLECTION_STATUS_KEY, value)
}

export function readPreserveVariants(): boolean {
  return readPreserveBoolean(PRESERVE_VARIANTS_KEY)
}

export function writePreserveVariants(value: boolean): void {
  writePreserveBoolean(PRESERVE_VARIANTS_KEY, value)
}
