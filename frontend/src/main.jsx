import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'

import AppShell from './AppShell.jsx'
import App from './App.jsx'
import KnowledgeGraphView from './components/KnowledgeGraphView.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import DocumentsView from './components/DocumentsView.jsx'
import {
  BacktestPage,
  ContributePage,
  CorrelationPage,
  DossierPage,
  MethodologyPage,
  PPFGPage,
  RadarPage,
  SettingsPage,
} from './pages/ModulePages.jsx'

// Register Rig Edge Service Worker for complete offline operation
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Rig Edge Service Worker registered: ', reg.scope))
      .catch((err) => console.warn('Service Worker registration skipped: ', err));
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<App />} />
          <Route path="radar" element={<RadarPage />} />
          <Route path="ppfg" element={<PPFGPage />} />
          <Route path="correlation" element={<CorrelationPage />} />
          <Route path="dossier" element={<DossierPage />} />
          <Route path="backtest" element={<BacktestPage />} />
          <Route path="graph" element={<KnowledgeGraphView />} />
          <Route path="documents" element={<DocumentsView />} />
          <Route path="assistant" element={<ChatPanel />} />
          <Route path="contribute" element={<ContributePage />} />
          <Route path="methodology" element={<MethodologyPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
