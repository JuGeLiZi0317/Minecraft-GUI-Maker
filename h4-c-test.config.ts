import base from './playwright.manual.config';
const tag=process.env.H4C_RUN_TAG || `manual-${Date.now()}`;
export default {...base,use:{...base.use,baseURL:process.env.H4C_BASE_URL || 'http://127.0.0.1:4176'},outputDir:`outputs/H4-C/${tag}/artifacts`,reporter:[['list'],['json',{outputFile:`outputs/H4-C/${tag}/results.json`}]]};
