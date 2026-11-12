import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';
import { localSession } from './io/localSession';
import { RootErrorBoundary } from './ui/RootErrorBoundary';
import { editorStore } from './editor/store';

void localSession.start().catch(error => { console.error('GUI Maker local session startup failed', error); editorStore.getState().setBlocked(null); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void localSession.flush(); });
window.addEventListener('beforeunload', e => {
  if (localSession.status.getState().dirty) { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('pagehide', () => localSession.stop());
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });

createRoot(document.getElementById('root')!).render(<React.StrictMode><RootErrorBoundary><App/></RootErrorBoundary></React.StrictMode>);
