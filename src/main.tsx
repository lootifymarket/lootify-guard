import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/tokens.css'
import './styles/global.css'
import App from './App.tsx'
import { getSettings, showStreamerMode } from './api/settings.ts'
import { setWordsFor } from './i18n/index.ts'

// Settings are read without the vault, so the first screen is already in the
// user's language and the streamer blur is on before anything shows.
void getSettings().then((settings) => {
  showStreamerMode(settings.streamerMode)
  setWordsFor(settings.language)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App
        initialLanguage={settings.language}
        initialStreamer={settings.streamerMode}
        initialSidebarCollapsed={settings.sidebarCollapsed}
      />
    </StrictMode>,
  )
})
