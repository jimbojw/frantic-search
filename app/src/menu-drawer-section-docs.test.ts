// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { DOC_INDEX } from './docs/index'
import { ALL_SECTIONS } from './MenuDrawer'
import { MENU_DRAWER_MANA_COST_INTRO, MENU_DRAWER_SECTION_INTROS } from './menu-drawer-section-docs'

const docParamSet = new Set(DOC_INDEX.map((e) => e.docParam))

describe('menu-drawer-section-docs', () => {
  it('defines an intro for every MenuDrawer ALL_SECTIONS id and no extras', () => {
    for (const id of ALL_SECTIONS) {
      expect(MENU_DRAWER_SECTION_INTROS[id], `missing intro for ${id}`).toBeDefined()
    }
    expect(Object.keys(MENU_DRAWER_SECTION_INTROS).length).toBe(ALL_SECTIONS.length)
    for (const k of Object.keys(MENU_DRAWER_SECTION_INTROS)) {
      expect(ALL_SECTIONS.includes(k as (typeof ALL_SECTIONS)[number])).toBe(true)
    }
  })

  it('uses docParam values that exist in DOC_INDEX', () => {
    for (const row of Object.values(MENU_DRAWER_SECTION_INTROS)) {
      expect(docParamSet.has(row.docParam), `unknown docParam: ${row.docParam}`).toBe(true)
      expect(row.description.length).toBeGreaterThan(0)
    }
    expect(docParamSet.has(MENU_DRAWER_MANA_COST_INTRO.docParam)).toBe(true)
    expect(MENU_DRAWER_MANA_COST_INTRO.description.length).toBeGreaterThan(0)
  })
})
