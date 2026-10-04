import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Rejestracja Service Workera dla PWA
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('✅ Service Worker PWA zarejestrowany pomyślnie:', reg.scope);
      })
      .catch((err) => {
        console.error('❌ Błąd rejestracji Service Workera:', err);
      });
  });
}
