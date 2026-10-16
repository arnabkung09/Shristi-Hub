import { getDb } from '../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dev = req.body;
    if (!dev || !dev.id) {
      return res.status(400).json({ error: 'Missing device information' });
    }

    const db = await getDb();
    const collection = db.collection('connected_devices');

    await collection.updateOne(
      { id: dev.id },
      {
        $set: {
          ...dev,
          lastPing: Date.now(),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Retrieve active devices in last 45 seconds
    const activeCutoff = Date.now() - 45000;
    const activeDevices = await collection
      .find({ lastPing: { $gte: activeCutoff } })
      .limit(60)
      .toArray();

    return res.status(200).json({
      success: true,
      devices: activeDevices.map((d) => ({
        id: d.id,
        name: d.name,
        user: d.user,
        role: d.role,
        house: d.house,
        grade: d.grade,
        deviceType: d.deviceType,
        ip: d.ip,
        online: true,
        lastPing: d.lastPing,
        isCurrent: false,
      })),
    });
  } catch (error) {
    console.error('Device heartbeat error:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
}
