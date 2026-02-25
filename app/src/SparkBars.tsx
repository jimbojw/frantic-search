// SPDX-License-Identifier: Apache-2.0
import { Index } from 'solid-js'

export default function SparkBars(props: {
  counts: number[]
  colors: string | string[]
}) {
  const max = () => Math.max(...props.counts)
  const color = (i: number) => {
    const c = props.colors
    return typeof c === 'string' ? c : c[i]
  }
  const isGradient = (i: number) => color(i).startsWith('linear-gradient')

  return (
    <div class="flex flex-col min-w-0 flex-1" style={{ gap: '0.5px' }}>
      <Index each={props.counts}>
        {(count, i) => {
          const pct = () => max() > 0 ? (count() / max()) * 100 : 0
          return (
            <div
              style={{
                height: '1.5px',
                width: `${pct()}%`,
                "min-width": count() > 0 ? '1px' : undefined,
                ...(isGradient(i)
                  ? { background: color(i) }
                  : { "background-color": color(i) }),
              }}
            />
          )
        }}
      </Index>
    </div>
  )
}
