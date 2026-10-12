// POST /api/keys/validate  { key: string, hwid?: string }
// The executor calls this on attach/execute. Locks loose keys to HWID on
// first use; rejects expired, revoked, unknown, or HWID-mismatched keys.
const { db, handleOptions } = require('../../_db');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const key = typeof req.body?.key === 'string' ? req.body.key.trim().toUpperCase().slice(0, 64) : '';
    const hwid = typeof req.body?.hwid === 'string' ? req.body.hwid.trim().slice(0, 128) : '';
    if (!key) return res.status(400).json({ valid: false, reason: 'KEY_REQUIRED' });

    const sql = db();
    const rows = await sql`
      SELECT key, hwid, expires_at, revoked FROM obx_keys WHERE key = ${key} LIMIT 1`;
    if (!rows.length) return res.json({ valid: false, reason: 'NOT_FOUND' });

    const row = rows[0];
    if (row.revoked) return res.json({ valid: false, reason: 'REVOKED' });
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return res.json({ valid: false, reason: 'EXPIRED' });
    }
    if (hwid) {
      if (row.hwid && row.hwid !== hwid) {
        return res.json({ valid: false, reason: 'HWID_MISMATCH' });
      }
      if (!row.hwid) {
        await sql`UPDATE obx_keys SET hwid = ${hwid} WHERE key = ${key}`;
      }
    }
    return res.json({ valid: true, expires_at: row.expires_at });
  } catch (e) {
    console.error('keys/validate:', e.message);
    return res.status(500).json({ valid: false, reason: 'SERVER_ERROR' });
  }
};
