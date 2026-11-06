import base from './playwright.manual.config';
// H4-A targeted checks only. Unique evidence directory keeps earlier runs intact.
const tag = `manual-${Date.now()}`;
export default { ...base, testMatch: '**/h4-topbar.spec.ts', use: { ...base.use, baseURL: 'http://127.0.0.1:4176' }, outputDir: `./outputs/H4-A/${tag}/artifacts`, reporter: [['list'], ['json', { outputFile: `./outputs/H4-A/${tag}/results.json` }]] };
