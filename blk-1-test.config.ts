import base from './playwright.manual.config';
const tag = process.env.BLK_RUN_TAG || `manual-${Date.now()}`;
export default { ...base, use: { ...base.use, baseURL: 'http://127.0.0.1:4176' }, outputDir: `outputs/BLK-1/${tag}/artifacts`, reporter: [['list'], ['json', { outputFile: `outputs/BLK-1/${tag}/results.json` }]] };
