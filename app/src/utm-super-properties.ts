// SPDX-License-Identifier: Apache-2.0

/** Standard UTM query keys mirrored as PostHog super properties with `$` prefix (GitHub #188, Spec 085). */
const UTM_QUERY_KEYS = [
  'utm_campaign',
  'utm_source',
  'utm_medium',
  'utm_content',
  'utm_term',
] as const

/**
 * Maps landing `utm_*` query params to PostHog super property names (`$utm_*`).
 * `search` is typically `window.location.search` (may be `""` or start with `?`).
 */
export function utmSuperPropertiesFromSearch(search: string): Record<string, string> {
  const qs = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(qs)
  const out: Record<string, string> = {}
  for (const key of UTM_QUERY_KEYS) {
    const value = params.get(key)
    if (value) out[`$${key}`] = value
  }
  return out
}
