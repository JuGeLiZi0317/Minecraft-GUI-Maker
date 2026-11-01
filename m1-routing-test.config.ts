import base from './playwright.manual.config';
export default { ...base, use: { ...base.use, baseURL: 'http://127.0.0.1:4174' } };
