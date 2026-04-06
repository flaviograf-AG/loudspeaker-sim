import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@graf-asociados/design-system/dist/graf-design-system.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
