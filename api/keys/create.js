// POST /api/keys/create  { hwid: string }
// Returns the active key for a HWID, or mints a fresh 24h key.
// One active key per HWID: reuses the unexpired one if it exists.
const crypto = require('crypto');
const { db, handleOptions } = require('../../_db');

const KEY_TTL_HOURS = parseInt(process.env.KEY_TTL_HOURS || '24', 10) || 24;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars

function genGroup(n) {
  const bytes = crypto.randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function genKey() {
  return `OBX-${genGroup(6)}-${genGroup(6)}`;
}

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const hwid = typeof req.body?.hwid === 'string' ? req.body.hwid.trim().slice(0, 128) : '';
    if (!hwid) return res.status(400).json({ error: 'HWID_REQUIRED' });

    const sql = db();

    const existing = await sql`
      SELECT key, expires_at FROM obx_keys
      WHERE hwid = ${hwid} AND revoked = false AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 1`;
    if (existing.length) {
      return res.json({ key: existing[0].key, expires_at: existing[0].expires_at, reused: true });
    }

    // Extremely unlikely collision loop, key column is UNIQUE as backstop.
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = genKey();
      try {
        const rows = await sql`
          INSERT INTO obx_keys(key, hwid, expires_at)
          VALUES(${key}, ${hwid}, NOW() + (${KEY_TTL_HOURS} || ' hours')::interval)
          RETURNING expires_at`;
        return res.json({ key, expires_at: rows[0].expires_at, reused: false });
      } catch (e) {
        if (!/duplicate|unique/i.test(e.message || '') || attempt === 2) throw e;
      }
    }
  } catch (e) {
    console.error('keys/create:', e.message);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
};
