import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadSettings } from './settings/storage'
import { applyTheme } from './settings/theme'

const savedSettings = loadSettings()
if (savedSettings) {
  applyTheme(savedSettings.theme)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
