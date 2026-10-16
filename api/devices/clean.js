import { getDb } from '../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = await getDb();
    const collection = db.collection('connected_devices');

    const cutoff = Date.now() - 60000;
    const result = await collection.deleteMany({
      lastPing: { $lt: cutoff },
    });

    return res.status(200).json({
      success: true,
      removed: result.deletedCount || 0,
    });
  } catch (error) {
    console.error('Device clean error:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
}
