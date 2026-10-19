import { getDb } from '../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dev = req.body || {};
    const deviceId = dev.id || dev.deviceId;
    if (!deviceId) {
      return res.status(400).json({ error: 'Missing device information' });
    }

    const db = await getDb();
    const collection = db.collection('connected_devices');

    if (req.method === 'DELETE' || dev.online === false) {
      await collection.deleteOne({ id: deviceId });
      return res.status(200).json({ success: true, removed: true });
    }

    const now = Date.now();
    await collection.updateOne(
      { id: deviceId },
      {
        $set: {
          id: deviceId,
          userId: dev.userId || dev.user || 'guest',
          name: dev.name || dev.userName || dev.model || 'Connected Device',
          email: dev.email || '',
          house: dev.house || null,
          grade: dev.grade !== undefined ? dev.grade : null,
          role: dev.role || 'student',
          kind: dev.kind || dev.deviceType || 'desktop',
          model: dev.model || dev.name || 'Desktop Workstation',
          browser: dev.browser || 'Browser',
          isStandalone: Boolean(dev.isStandalone),
          pushStatus: dev.pushStatus || 'not-enabled',
          isGuest: Boolean(dev.isGuest),
          connectedAt: dev.connectedAt || now,
          online: true,
          lastPing: now,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Retrieve active devices in last 90 seconds (accommodates 60s background tab heartbeat)
    const activeCutoff = now - 90000;
    const activeDevices = await collection
      .find({ lastPing: { $gte: activeCutoff } })
      .limit(100)
      .toArray();

    return res.status(200).json({
      success: true,
      devices: activeDevices.map((d) => ({
        id: d.id,
        userId: d.userId || d.user || 'guest',
        name: d.name || d.model || 'Connected Device',
        email: d.email || undefined,
        role: d.role || 'student',
        house: d.house || null,
        grade: d.grade !== undefined ? d.grade : null,
        kind: d.kind || d.deviceType || 'desktop',
        model: d.model || d.name || 'Desktop Workstation',
        browser: d.browser || 'Browser',
        isStandalone: Boolean(d.isStandalone),
        pushStatus: d.pushStatus || 'not-enabled',
        online: true,
        connectedAt: d.connectedAt || d.lastPing,
        lastPing: d.lastPing,
        isCurrent: false,
        isGuest: Boolean(d.isGuest),
      })),
    });
  } catch (error) {
    console.error('Device heartbeat error:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
}
