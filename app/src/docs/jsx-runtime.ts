// SPDX-License-Identifier: Apache-2.0
// MDX-compatible JSX runtime for Solid.js. Inspired by solid-jsx (github.com/high1/solid-jsx)
// but implemented locally — we do not use the solid-jsx package.

import { createComponent, mergeProps, type JSX, type ParentProps } from 'solid-js'
import { Dynamic } from 'solid-js/web'

function isFirstLetterCapital(s: string): boolean {
  const first = s.charAt(0)
  return first !== first.toLowerCase()
}

const svgRe =
  /^(t(ext$|s)|s[vwy]|g)|^set|tad|ker|p(at|s)|s(to|c$|ca|k)|r(ec|cl)|ew|us|f($|e|s)|cu|n[ei]|l[ty]|[GOP]/
const svgCache = Object.create(null) as Record<string, boolean>

function isSVGElement(element: string): boolean {
  return element in svgCache
    ? svgCache[element] ?? false
    : (svgCache[element] = svgRe.test(element) && !element.includes('-'))
}

const attributeCamelCasedRegExp =
  /e(r[HRWrv]|[Vawy])|Con|l(e[Tcs]|c)|s(eP|y)|a(t[rt]|u|v)|Of|Ex|f[XYa]|gt|hR|d[Pg]|t[TXYd]|[UZq]/
const attributesCache = Object.create(null) as Record<string, string>
const uppercaseRe = /[A-Z]/g

function normalizeKeySvg(key: string): string {
  return (
    attributesCache[key] ??
    (attributesCache[key] = attributeCamelCasedRegExp.test(key)
      ? key
      : key.replaceAll(uppercaseRe, (char) => `-${char.toLowerCase()}`))
  )
}

function jsxKeyToSolid(key: string, type = ''): string {
  return isSVGElement(type)
    ? key === 'xlinkHref' || key === 'xlink:href'
      ? 'href'
      : normalizeKeySvg(key)
    : key
}

const REPLACED_COMPAT_SET = new Set(['mjx'])
const compatRegExp = new RegExp(`(?:${[...REPLACED_COMPAT_SET].join('|')})-.+`, 'g')
const expressionCache = Object.create(null) as Record<string, string>

function replaceDashWithUnderscore<T>(expression: T): string | T {
  return typeof expression === 'string'
    ? expressionCache[expression] ??
        (expressionCache[expression] = expression.replaceAll(compatRegExp, (match: string) =>
          match.replaceAll('-', '_'),
        ))
    : expression
}

function getProperties(
  properties: Record<string, unknown> & { children?: JSX.Element },
  type?: string,
): ParentProps<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(properties)) {
    const val = properties[key]
    out[jsxKeyToSolid(key, type)] =
      typeof val === 'object' && val !== null && !Array.isArray(val)
        ? getProperties(val as Record<string, unknown>, type)
        : replaceDashWithUnderscore(val)
  }
  return out as ParentProps<Record<string, unknown>>
}

export const Fragment = (properties: ParentProps): JSX.Element => properties.children

export function jsx(
  type: string | ((props: ParentProps) => JSX.Element),
  properties: ParentProps,
): JSX.Element {
  if (typeof type === 'function') {
    return type.name === 'Fragment' ? Fragment(properties) : type(getProperties(properties))
  }
  return createComponent(
    Dynamic,
    mergeProps(isFirstLetterCapital(type) ? properties : getProperties(properties, type), {
      get component() {
        return replaceDashWithUnderscore(type)
      },
    }),
  )
}

export const jsxs = jsx
export const jsxDEV = jsx
