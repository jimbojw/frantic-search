// SPDX-License-Identifier: Apache-2.0

/** Vite-inlined affiliate IDs (set in CI from GitHub Secrets → VITE_*). Empty in local dev when unset. */
export function tcgplayerImpactId(): string {
  return (import.meta.env.VITE_TCGPLAYER_IMPACT_ID as string | undefined)?.trim() ?? ''
}

export function tcgplayerAdId(): string {
  return (import.meta.env.VITE_TCGPLAYER_AD_ID as string | undefined)?.trim() ?? ''
}

/** Third path segment for partner.tcgplayer.com/c/{impact}/{ad}/{segment}?… */
export function tcgplayerPartnerSegment(): string {
  return (import.meta.env.VITE_TCGPLAYER_PARTNER_SEGMENT as string | undefined)?.trim() ?? ''
}

export function manaPoolRef(): string {
  return (import.meta.env.VITE_MANA_POOL_REF as string | undefined)?.trim() ?? ''
}

/**
 * Optional full URL for TCGPlayer Mass Entry docs (Deck Editor). When unset, deck editor falls back
 * to a generic partner link via {@link buildTcgplayerPartnerUrl} with this URL as `u`.
 */
export function tcgplayerMassEntryDestinationUrl(): string {
  return (import.meta.env.VITE_TCGPLAYER_MASS_ENTRY_URL as string | undefined)?.trim() ?? ''
}

export function tcgplayerPartnerConfigured(): boolean {
  return (
    tcgplayerImpactId().length > 0 &&
    tcgplayerAdId().length > 0 &&
    tcgplayerPartnerSegment().length > 0
  )
}
