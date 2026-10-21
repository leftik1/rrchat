import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/index.css';
import { initTheme } from './utils/theme';

initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="rrchat Application Error">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
