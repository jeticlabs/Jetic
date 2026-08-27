import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './src/App.tsx';
import './src/styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
