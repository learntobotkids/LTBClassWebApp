require('dotenv').config();
const config = require('./google-sheets-config');

console.log("--- CONFIG DEBUG ---");
console.log("Effective SPREADSHEET_ID in config:", config.SPREADSHEET_ID);
console.log("process.env.SPREADSHEET_ID value:", process.env.SPREADSHEET_ID);
console.log("Hardcoded fallback in check:", '1mkfyTOrcflampKY_BG13yjst7-AfEK4Oxvl-VU9BFME');
console.log("Do they match?", config.SPREADSHEET_ID === '1mkfyTOrcflampKY_BG13yjst7-AfEK4Oxvl-VU9BFME' ? "YES (New Sheet)" : "NO (Old Sheet)");
