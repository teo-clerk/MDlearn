import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { loadLang } from './i18n'
import './styles/app.css'

const client = new QueryClient({
  defaultOptions: { queries: { retry: (n, e) => n < 1 && !(e as { status?: number }).status, refetchOnWindowFocus: false } },
})
// The interface language is loaded before the first render (English needs nothing). Text is translated when it
// renders, never at module load (test/i18n.test.ts checks), so the app can be imported up front.
void loadLang().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={client}><App /></QueryClientProvider>
    </StrictMode>,
  )
})
