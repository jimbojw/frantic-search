/* SPDX-License-Identifier: Apache-2.0 */
/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import { injectEtchedNoiseTiles } from './noise-tile'
import App from './App.tsx'

injectEtchedNoiseTiles()

const root = document.getElementById('root')

render(() => <App />, root!)
