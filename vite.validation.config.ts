import { mergeConfig } from 'vite';
import base from './vite.config';
// Test traces and snapshots are evidence; writing them must never reload the app.
export default mergeConfig(base, { server: { watch: { ignored: ['**/work/**', '**/outputs/**', '**/test-results/**'] } } });
