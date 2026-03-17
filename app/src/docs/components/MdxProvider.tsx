// SPDX-License-Identifier: Apache-2.0
import { createComponent, createContext, useContext, type Component, type JSX, type ParentProps } from 'solid-js'

type MDXComponent = Component<any> | JSX.Element
const MDXContext = createContext<Record<string, MDXComponent>>(Object.create(null))

export function MDXProvider(
  props: ParentProps<{ components?: Record<string, MDXComponent> }>,
): JSX.Element {
  const context = useContext(MDXContext)
  return createComponent(MDXContext.Provider, {
    get value() {
      return { ...context, ...props.components }
    },
    get children() {
      return props.children
    },
  })
}

export function useMDXComponents(
  components?: Record<string, MDXComponent>,
): Record<string, MDXComponent> {
  const context = useContext(MDXContext)
  return { ...context, ...components }
}
