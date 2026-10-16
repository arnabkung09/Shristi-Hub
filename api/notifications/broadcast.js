import { getDb } from '../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, title, body, urgent, actionTab, audience, senderName } = req.body || {};
    if (!title) {
      return res.status(400).json({ error: 'Notification title is required.' });
    }

    const db = await getDb();
    const collection = db.collection('broadcasts');

    const notificationId = id || `bc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await collection.insertOne({
      id: notificationId,
      title: String(title).trim(),
      body: String(body || '').trim(),
      urgent: Boolean(urgent),
      actionTab: actionTab || 'dashboard',
      audience: audience || { kind: 'all' },
      senderName: senderName || 'Council',
      timestamp: Date.now(),
      createdAt: new Date(),
    });

    return res.status(200).json({ success: true, id: notificationId });
  } catch (error) {
    console.error('Broadcast notification error:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
}
