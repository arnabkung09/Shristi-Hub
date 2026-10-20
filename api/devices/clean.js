import { getDb } from '../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = await getDb();
    const collection = db.collection('connected_devices');

    const cutoff = Date.now() - 90000;
    const staleResult = await collection.deleteMany({
      lastPing: { $lt: cutoff },
    });

    // Also deduplicate any remaining devices sharing the same user or anonymous workstation profile
    const remaining = await collection.find({}).toArray();
    const sorted = [...remaining].sort(
      (a, b) => Number(b.lastPing || b.lastSeen || 0) - Number(a.lastPing || a.lastSeen || 0)
    );
    const seenIds = new Set();
    const seenUsers = new Set();
    const seenGuests = new Set();
    const duplicateIds = [];

    for (const d of sorted) {
      if (!d || !d.id) continue;
      if (seenIds.has(d.id)) {
        duplicateIds.push(d.id);
        continue;
      }
      seenIds.add(d.id);

      const userKey =
        d.userId && d.userId !== 'guest' && !d.isGuest
          ? `user:${String(d.userId).toLowerCase()}:${d.kind || 'desktop'}`
          : d.email && d.email !== 'guest' && !d.isGuest
          ? `email:${String(d.email).toLowerCase()}:${d.kind || 'desktop'}`
          : null;

      if (userKey) {
        if (seenUsers.has(userKey)) {
          duplicateIds.push(d.id);
          continue;
        }
        seenUsers.add(userKey);
      } else {
        const guestKey = `guest:${d.kind || 'desktop'}:${d.model || 'Unknown'}:${d.browser || 'Browser'}`;
        if (seenGuests.has(guestKey)) {
          duplicateIds.push(d.id);
          continue;
        }
        seenGuests.add(guestKey);
      }
    }

    let dedupedCount = 0;
    if (duplicateIds.length > 0) {
      const dupResult = await collection.deleteMany({ id: { $in: duplicateIds } });
      dedupedCount = dupResult.deletedCount || 0;
    }

    return res.status(200).json({
      success: true,
      removed: (staleResult.deletedCount || 0) + dedupedCount,
    });
  } catch (error) {
    console.error('Device clean error:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
}
