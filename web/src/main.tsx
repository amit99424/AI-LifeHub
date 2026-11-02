import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { applyTheme } from './lib/auth';

applyTheme((localStorage.getItem('lifehub-theme') as 'light' | 'dark' | 'system') || 'system');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
