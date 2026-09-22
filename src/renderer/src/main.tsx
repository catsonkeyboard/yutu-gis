import './i18n'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'normalize.css/normalize.css'
import '@blueprintjs/core/lib/css/blueprint.css'
import '@blueprintjs/icons/lib/css/blueprint-icons.css'
import '@blueprintjs/select/lib/css/blueprint-select.css'
import '@blueprintjs/table/lib/css/table.css'
import './assets/main.css'
import 'maplibre-gl/dist/maplibre-gl.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
