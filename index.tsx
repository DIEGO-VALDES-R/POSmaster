import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { DatabaseProvider } from './contexts/DatabaseContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <CurrencyProvider>
      <DatabaseProvider>
        <App />
      </DatabaseProvider>
    </CurrencyProvider>
  </React.StrictMode>
);
