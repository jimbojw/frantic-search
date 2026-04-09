// SPDX-License-Identifier: Apache-2.0
import {
  manaPoolRef,
  tcgplayerAdId,
  tcgplayerImpactId,
  tcgplayerPartnerSegment,
} from './affiliate-config'

export function buildTcgplayerProductPageUrl(productId: number): string | null {
  if (!Number.isFinite(productId) || productId <= 0) return null
  return `https://www.tcgplayer.com/product/${Math.floor(productId)}?page=1`
}

export function buildTcgplayerPartnerUrlWithConfig(
  u: string,
  subId1: string,
  cfg: { impact: string; ad: string; segment: string },
): string | null {
  const { impact, ad, segment } = cfg
  if (!impact || !ad || !segment || !u) return null
  const params = new URLSearchParams()
  params.set('subId1', subId1)
  params.set('u', u)
  return `https://partner.tcgplayer.com/c/${impact}/${ad}/${segment}?${params.toString()}`
}

export function buildTcgplayerPartnerUrl(u: string, subId1: string): string | null {
  return buildTcgplayerPartnerUrlWithConfig(u, subId1, {
    impact: tcgplayerImpactId(),
    ad: tcgplayerAdId(),
    segment: tcgplayerPartnerSegment(),
  })
}

/** Slug for Mana Pool card paths; collapses ` // ` like EDHREC-style slugs. */
export function slugifyCardNameForManapool(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*\/\/\s*/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function appendManaPoolRefToUrl(url: string, ref: string | undefined): string {
  const r = ref?.trim()
  if (!r) return url
  const joiner = url.includes('?') ? '&' : '?'
  return `${url}${joiner}ref=${encodeURIComponent(r)}`
}

export function buildManapoolCardOrSearchUrlWithRef(
  params: {
    cardNameForSearch: string
    setCode?: string
    collectorNumber?: string
    cardNameForSlug?: string
  },
  ref: string | undefined,
): string {
  const { cardNameForSearch, setCode, collectorNumber, cardNameForSlug } = params
  const slug = slugifyCardNameForManapool(cardNameForSlug ?? cardNameForSearch)
  const set = setCode?.trim().toLowerCase()
  const cn = collectorNumber?.trim()

  let url: string
  if (set && cn && slug.length > 0) {
    const cnSeg = encodeURIComponent(cn).replace(/%2F/gi, '/')
    url = `https://manapool.com/card/${set}/${cnSeg}/${slug}`
  } else {
    url = `https://manapool.com/search?q=${encodeURIComponent(cardNameForSearch)}`
  }
  return appendManaPoolRefToUrl(url, ref)
}

export function buildManapoolCardOrSearchUrl(params: {
  cardNameForSearch: string
  setCode?: string
  collectorNumber?: string
  cardNameForSlug?: string
}): string {
  return buildManapoolCardOrSearchUrlWithRef(params, manaPoolRef())
}
