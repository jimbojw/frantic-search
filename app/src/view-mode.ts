// SPDX-License-Identifier: Apache-2.0

export type ViewMode = 'slim' | 'detail' | 'images' | 'full'

export const VIEW_MODES: ViewMode[] = ['slim', 'detail', 'images', 'full']

export const VIEW_MODE_LABELS: { mode: ViewMode; label: string }[] = [
  { mode: 'slim', label: 'Slim' },
  { mode: 'detail', label: 'Detail' },
  { mode: 'images', label: 'Images' },
  { mode: 'full', label: 'Full' },
]

export const BATCH_SIZES: Record<ViewMode, number> = {
  slim: 150,
  detail: 60,
  images: 60,
  full: 20,
}

export function isViewMode(value: string): value is ViewMode {
  return VIEW_MODES.includes(value as ViewMode)
}
