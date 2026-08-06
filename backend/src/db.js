require("dotenv").config();

let connectProject;

try {
  ({ connectProject } = require("diamond-sql"));
} catch (_) {
  ({ connectProject } = require("./diamond-sql"));
}

const db = connectProject(process.env.SITE_ID, {
  apiKey: process.env.API_KEY,
  dbmsUrl: process.env.DBMS_URL,
  timeoutMs: process.env.DBMS_TIMEOUT_MS
});

module.exports = db;
