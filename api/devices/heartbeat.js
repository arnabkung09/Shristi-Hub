import { getDb } from '../_db.js';

function deduplicateDevices(devices) {
  if (!Array.isArray(devices) || devices.length === 0) return [];
  const sorted = [...devices].sort((a, b) => Number(b.lastPing || b.lastSeen || 0) - Number(a.lastPing || a.lastSeen || 0));
  const seen = new Set();
  const out = [];
  for (const d of sorted) {
    if (!d || !d.id) continue;
    const idKey = `id:${d.id}`;
    if (seen.has(idKey)) continue;
    const uid = d.userId || d.user || 'guest';
    const identityKey = !d.isGuest && uid && uid !== 'guest'
      ? `user:${uid}:${d.kind || 'desktop'}`
      : !d.isGuest && d.email && d.email !== 'Anonymous'
        ? `email:${String(d.email).toLowerCase()}:${d.kind || 'desktop'}`
        : `guest:${d.kind || 'desktop'}:${d.model || 'Desktop'}:${d.browser || 'Browser'}`;
    if (seen.has(identityKey)) continue;
    seen.add(idKey);
    seen.add(identityKey);
    out.push(d);
  }
  return out;
}

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
    const userId = dev.userId || dev.user || 'guest';
    const isGuest = Boolean(dev.isGuest || userId === 'guest');
    const kind = dev.kind || dev.deviceType || 'desktop';
    const model = dev.model || dev.name || 'Desktop PC';
    const browser = dev.browser || 'Browser';

    // Clean up older duplicate rows from the same user or same guest browser profile
    try {
      if (!isGuest && userId !== 'guest') {
        await collection.deleteMany({ userId, kind, id: { $ne: deviceId } });
      } else {
        await collection.deleteMany({ isGuest: true, kind, model, browser, id: { $ne: deviceId } });
      }
    } catch {
      // Ignore cleanup errors on fallback stores
    }

    await collection.updateOne(
      { id: deviceId },
      {
        $set: {
          id: deviceId,
          userId,
          name: dev.name || dev.userName || model || 'Connected Device',
          email: dev.email || '',
          house: dev.house || null,
          grade: dev.grade !== undefined ? dev.grade : null,
          role: dev.role || 'student',
          kind,
          model,
          browser,
          isStandalone: Boolean(dev.isStandalone),
          pushStatus: dev.pushStatus || 'not-enabled',
          isGuest,
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
    const rawActiveDevices = await collection
      .find({ lastPing: { $gte: activeCutoff } })
      .limit(100)
      .toArray();

    const activeDevices = deduplicateDevices(rawActiveDevices);

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
        model: d.model || d.name || 'Desktop PC',
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
