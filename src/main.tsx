import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

if (Capacitor.isNativePlatform()) {
  // Android's back button walks back through the screens, and leaves the app from the first one.
  void NativeApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) history.back();
    else void NativeApp.minimizeApp();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
