import base from './playwright.config';
// External Vite avoids the Windows webServer shutdown hang. Keep the normal
// 60s test budget; bound individual UI actions so hidden controls fail clearly.
export default { ...base, webServer: undefined, use: { ...base.use, actionTimeout: 8_000 } };
