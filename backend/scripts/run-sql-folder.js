require("dotenv").config();

const fs = require("fs");
const path = require("path");
const db = require("../services/db");

const folderName = process.argv[2];
const trackingTable = process.argv[3];

if (!folderName || !trackingTable) {
  console.error("Usage: node scripts/run-sql-folder.js <folder> <tracking_table>");
  process.exit(1);
}

function splitSql(content) {
  return content
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureTrackingTable() {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS ${trackingTable} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

async function hasRun(name) {
  const rows = await db.query(`SELECT id FROM ${trackingTable} WHERE name = ? LIMIT 1`, [name]);
  return rows.length > 0;
}

async function markRun(name) {
  await db.execute(`INSERT INTO ${trackingTable} (name) VALUES (?)`, [name]);
}

async function run() {
  const sqlDir = path.join(__dirname, "..", folderName);
  const files = fs
    .readdirSync(sqlDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  await ensureTrackingTable();

  for (const file of files) {
    if (await hasRun(file)) {
      console.log(`skip ${folderName}/${file}`);
      continue;
    }

    const fullPath = path.join(sqlDir, file);
    const statements = splitSql(fs.readFileSync(fullPath, "utf8"));

    for (const statement of statements) {
      await db.execute(statement);
    }

    await markRun(file);
    console.log(`ran ${folderName}/${file}`);
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
