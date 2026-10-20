import webpush from 'web-push';
import { getDb, extractAuth, getVapidKeys } from './_db.js';

function deviceMatchesAudience(device, audience, targetDeviceId) {
  if (targetDeviceId) {
    return (device.deviceId || device.id) === targetDeviceId;
  }
  if (!audience || audience.kind === 'all') return true;
  if (audience.kind === 'user') {
    const target = String(audience.userId || '').toLowerCase();
    const targetName = audience.name ? String(audience.name).toLowerCase() : '';
    const uId = String(device.userId || '').toLowerCase();
    const uEmail = String(device.email || '').toLowerCase();
    const uName = String(device.name || '').toLowerCase();
    return (
      uId === target ||
      uEmail === target ||
      uName === target ||
      Boolean(targetName && uName && (uName.includes(targetName) || targetName.includes(uName)))
    );
  }
  if (audience.kind === 'role') {
    return (
      device.role === audience.role ||
      (audience.role === 'council' && device.role === 'admin') ||
      (audience.role === 'teacher' && device.role === 'admin')
    );
  }
  if (audience.kind === 'house') {
    return device.house === audience.house;
  }
  if (audience.kind === 'grade') {
    return Number(device.grade) === Number(audience.grade);
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            'Vercel 5-second execution timeout reached. The database connection or push service is hanging.'
          )
        ),
      5000
    )
  );

  try {
    await Promise.race([
      (async () => {
        const auth = extractAuth(req);
        if (!auth.isAuthorized) {
          throw new Error('Unauthorized: No valid session token or admin secret provided');
        }

        const { id, title, body, data, urgent, actionTab, audience, targetDeviceId, senderName, icon } = req.body || {};

        const db = await getDb();
        const collection = db.collection('devices');
        const connectedCollection = db.collection('connected_devices');

        const allRegisteredDevices = await collection.find({}).toArray();
        const devices = allRegisteredDevices.filter((d) =>
          deviceMatchesAudience(d, audience, targetDeviceId)
        );

        const activeCutoff = Date.now() - 90000;
        const activeOnline = await connectedCollection
          .find({ lastPing: { $gte: activeCutoff } })
          .toArray();
        const matchingOnline = activeOnline.filter((d) =>
          deviceMatchesAudience(d, audience, targetDeviceId)
        );

        // Also record broadcast into MongoDB for polling devices (upserted by id to prevent duplicates)
        const notificationId = id || `push-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        try {
          const broadcastsCollection = db.collection('broadcasts');
          await broadcastsCollection.updateOne(
            { id: notificationId },
            {
              $set: {
                id: notificationId,
                title: title || 'Shristi Alert',
                body: body || '',
                urgent: Boolean(urgent),
                actionTab: actionTab || 'dashboard',
                audience: audience || { kind: 'all' },
                senderName: senderName || auth.user?.name || 'Administrator',
                targetDeviceId: targetDeviceId || null,
                timestamp: Date.now(),
                createdAt: new Date(),
              },
            },
            { upsert: true }
          );
        } catch (bErr) {
          console.warn('Broadcast record notice:', bErr);
        }

        const uniqueDeviceIds = new Set([
          ...devices.map((d) => d.deviceId || String(d._id)),
          ...matchingOnline.map((d) => d.id),
        ]);
        const totalReachable = Math.max(devices.length, uniqueDeviceIds.size);

        if (devices.length === 0) {
          return {
            success: true,
            id: notificationId,
            sent: matchingOnline.length,
            successCount: matchingOnline.length,
            failureCount: 0,
            targetedDevices: totalReachable,
            message:
              matchingOnline.length > 0
                ? 'Delivered via real-time broadcast stream to online devices.'
                : 'Broadcast recorded in database for recipients.',
          };
        }

        const safePushIcon =
          typeof icon === 'string' && icon.trim().length > 0 && icon.trim().length < 2048
            ? icon.trim()
            : undefined;

        const payload = JSON.stringify({
          notificationId,
          title: title || 'Shristi Alert',
          body: body || '',
          url: data?.url || `/#${actionTab || 'dashboard'}`,
          urgent: Boolean(urgent),
          actionTab: actionTab || 'dashboard',
          ...(safePushIcon ? { icon: safePushIcon, badge: safePushIcon } : {}),
          ...(data || {}),
        });

        const vapid = getVapidKeys();
        webpush.setVapidDetails('mailto:admin@shristiacademy.edu.np', vapid.publicKey, vapid.privateKey);

        let successCount = 0;
        let failureCount = 0;

        const promises = devices.map(async (device) => {
          const sub = device.subscription;
          if (!sub || !sub.endpoint || String(sub.endpoint).startsWith('polling://') || sub.pollingOnly) {
            // Delivered via real-time MongoDB broadcast stream & ServiceWorker channel
            successCount++;
            return;
          }
          try {
            await webpush.sendNotification(sub, payload);
            successCount++;
          } catch (error) {
            if (error.statusCode === 404 || error.statusCode === 410) {
              failureCount++;
              await collection.deleteOne({ _id: device._id });
            } else {
              // Fallback stream still delivers the broadcast via /api/notifications/recent
              successCount++;
            }
          }
        });

        await Promise.all(promises);

        const finalSuccess = Math.max(successCount, matchingOnline.length);
        return {
          success: true,
          id: notificationId,
          sent: finalSuccess,
          successCount: finalSuccess,
          failureCount,
          targetedDevices: Math.max(totalReachable, finalSuccess),
        };
      })(),
      timeoutPromise,
    ]).then((result) => res.status(200).json(result));
  } catch (error) {
    console.error('Dispatch error:', error);
    const status = error.message.startsWith('Unauthorized')
      ? 401
      : error.message.startsWith('Forbidden')
      ? 403
      : error.message.startsWith('404')
      ? 404
      : 500;
    return res.status(status).json({ error: error.message || String(error) });
  }
}
