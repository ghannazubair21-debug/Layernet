import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const storedTheme = localStorage.getItem('layernet-settings')
let theme = 'system'
if (storedTheme) {
  try {
    theme = JSON.parse(storedTheme).theme ?? 'system'
  } catch {
    // ignore invalid stored settings
  }
}
document.documentElement.dataset.theme = theme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
