import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { localSession } from './io/localSession';

void localSession.start();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void localSession.flush(); });
window.addEventListener('beforeunload', e => {
  if (localSession.status.getState().dirty) { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('pagehide', () => localSession.stop());
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
