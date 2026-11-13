import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/tokens.css'
import './styles/global.css'
import App from './App.tsx'
import { getSettings, showStreamerMode } from './api/settings.ts'

// Settings are read without the vault, so the blur is on before anything shows.
void getSettings().then((settings) => showStreamerMode(settings.streamerMode))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
