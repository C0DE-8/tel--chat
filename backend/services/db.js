const { connectProject } = require("./diamond-sql");

let db;

function getDb() {
  if (!db) {
    db = connectProject(process.env.SITE_ID, {
      apiKey: process.env.API_KEY,
      dbmsUrl: process.env.DBMS_URL,
      timeoutMs: process.env.DBMS_TIMEOUT_MS,
    });
  }

  return db;
}

module.exports = {
  execute(sql, params) {
    return getDb().execute(sql, params);
  },

  query(sql, params) {
    return getDb().query(sql, params);
  },

  status() {
    return getDb().status();
  },
};
