import { getDb } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { deviceId, subscription, userId, name, email, role, grade, house } = req.body || {};

    if (!deviceId) {
      return res.status(400).json({ error: 'Missing deviceId.' });
    }

    const effectiveSubscription = subscription || {
      endpoint: `polling://${deviceId}`,
      pollingOnly: true,
    };

    const db = await getDb();
    const collection = db.collection('devices');

    await collection.updateOne(
      { deviceId },
      {
        $set: {
          deviceId,
          subscription: effectiveSubscription,
          userId: userId || 'anonymous',
          name: name || 'Anonymous',
          email: email || '',
          role: role || 'student',
          grade: grade !== undefined ? grade : null,
          house: house || null,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.status(200).json({ success: true, message: 'Device registered successfully.' });
  } catch (error) {
    console.error('Subscription error:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
}
