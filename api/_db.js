// Shared Neon PostgreSQL client (serverless-safe: HTTP-based, no pooling needed).
const { neon } = require('@neondatabase/serverless');

let sql = null;

function db() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

// The key page may call the API cross-origin (e.g. from the download site
// to the app domain), and no cookies are involved, so permissive CORS is fine.
function handleOptions(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { db, handleOptions };
