// SPDX-License-Identifier: Apache-2.0

/** Parse text with "..." (card-name) and `...` (set-code) for syntax-highlight-style rendering. */
export function parseStyledParts(text: string): { text: string; role?: 'card-name' | 'set-code' }[] {
  const result: { text: string; role?: 'card-name' | 'set-code' }[] = []
  let s = text
  while (s.length > 0) {
    const dq = s.indexOf('"')
    const bt = s.indexOf('`')
    if (dq < 0 && bt < 0) {
      result.push({ text: s })
      break
    }
    const next = dq < 0 ? bt : bt < 0 ? dq : Math.min(dq, bt)
    if (next > 0) {
      result.push({ text: s.slice(0, next) })
    }
    if (dq === next) {
      const end = s.indexOf('"', next + 1)
      if (end >= 0) {
        result.push({ text: s.slice(next + 1, end), role: 'card-name' })
        s = s.slice(end + 1)
      } else {
        result.push({ text: s.slice(next) })
        break
      }
    } else {
      const end = s.indexOf('`', next + 1)
      if (end >= 0) {
        result.push({ text: s.slice(next + 1, end), role: 'set-code' })
        s = s.slice(end + 1)
      } else {
        result.push({ text: s.slice(next) })
        break
      }
    }
  }
  return result
}

const CARD_NAME_CLASS = 'font-mono text-gray-900 dark:text-gray-100'
const SET_CODE_CLASS = 'font-mono text-blue-600 dark:text-blue-400'

export function StyledValidationText(props: { text: string; class?: string }) {
  const parts = parseStyledParts(props.text)
  return (
    <span class={props.class}>
      {parts.map((p) =>
        p.role === 'card-name' ? (
          <span class={CARD_NAME_CLASS}>{p.text}</span>
        ) : p.role === 'set-code' ? (
          <span class={SET_CODE_CLASS}>{p.text}</span>
        ) : (
          <>{p.text}</>
        )
      )}
    </span>
  )
}
