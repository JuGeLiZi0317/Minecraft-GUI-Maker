import base from './playwright.manual.config';
const tag=process.env.H4B_RUN_TAG || `manual-${Date.now()}`;
export default {...base,use:{...base.use,baseURL:'http://127.0.0.1:4176'},outputDir:`outputs/H4-B/${tag}/artifacts`,reporter:[['list'],['json',{outputFile:`outputs/H4-B/${tag}/results.json`}]]};
