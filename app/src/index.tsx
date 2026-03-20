/* SPDX-License-Identifier: Apache-2.0 */
/* @refresh reload */
import './analytics'
import { render } from 'solid-js/web'
import './index.css'
import { injectEtchedNoiseTiles } from './noise-tile'
import AppShell from './AppShell.tsx'

injectEtchedNoiseTiles()

const root = document.getElementById('root')

render(() => <AppShell />, root!)
