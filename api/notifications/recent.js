import { getDb } from '../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = await getDb();
    const collection = db.collection('broadcasts');

    const since = Number(req.query?.since || 0);
    const query = since > 0 ? { timestamp: { $gte: since } } : {};

    const broadcasts = await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();

    const mapped = broadcasts.map((b) => ({
      id: b.id || String(b._id),
      title: b.title,
      body: b.body,
      urgent: Boolean(b.urgent),
      actionTab: b.actionTab || 'dashboard',
      audience: b.audience || { kind: 'all' },
      senderName: b.senderName || 'Council',
      targetDeviceId: b.targetDeviceId || null,
      timestamp: Number(b.timestamp) || Date.now(),
    }));

    return res.status(200).json({
      success: true,
      broadcasts: mapped,
      notifications: mapped,
    });
  } catch (error) {
    console.error('Recent notifications error:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
}
