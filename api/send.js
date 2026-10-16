import webpush from 'web-push';
import { getDb, extractAuth } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Vercel 5-second execution timeout reached. The database connection or push service is hanging.')), 5000)
  );

  try {
    await Promise.race([
      (async () => {
        const auth = extractAuth(req);
        if (!auth.isAuthorized) {
          throw new Error('Unauthorized: No valid session token or admin secret provided');
        }

        const { title, body, data, urgent, actionTab, audience, targetDeviceId } = req.body;

        const db = await getDb();
        const collection = db.collection('devices');

        const query = {};
        if (targetDeviceId) {
          query.deviceId = targetDeviceId;
        } else if (audience) {
          if (audience.kind === 'user') {
            query.userId = audience.userId;
          } else if (audience.kind === 'role') {
            query.role = audience.role;
          } else if (audience.kind === 'house') {
            query.house = audience.house;
          } else if (audience.kind === 'grade') {
            query.grade = audience.grade;
          }
        }

        const devices = await collection.find(query).toArray();

        // Also record broadcast into MongoDB for polling devices
        const notificationId = `push-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        try {
          const broadcastsCollection = db.collection('broadcasts');
          await broadcastsCollection.insertOne({
            id: notificationId,
            title: title || 'Shristi Alert',
            body: body || '',
            urgent: Boolean(urgent),
            actionTab: actionTab || 'dashboard',
            audience: audience || { kind: 'all' },
            senderName: auth.user?.name || 'Administrator',
            targetDeviceId: targetDeviceId || null,
            timestamp: Date.now(),
            createdAt: new Date(),
          });
        } catch (bErr) {
          console.warn('Broadcast record notice:', bErr);
        }

        if (devices.length === 0) {
          return { success: true, successCount: 0, failureCount: 0, targetedDevices: 0, message: 'No registered push devices found for target.' };
        }

        const payload = JSON.stringify({
          title: title || 'Shristi Alert',
          body: body || '',
          url: data?.url || '/',
          urgent: !!urgent,
          actionTab: actionTab || 'dashboard',
          ...data
        });

        if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
          throw new Error('VAPID keys are missing from environment variables');
        }
        webpush.setVapidDetails(
          'mailto:admin@example.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );

        let successCount = 0;
        let failureCount = 0;

        const promises = devices.map(async (device) => {
          try {
            await webpush.sendNotification(device.subscription, payload);
            successCount++;
          } catch (error) {
            failureCount++;
            if (error.statusCode === 404 || error.statusCode === 410) {
              await collection.deleteOne({ _id: device._id });
            }
          }
        });

        await Promise.all(promises);

        return { success: true, successCount, failureCount, targetedDevices: devices.length };
      })(),
      timeoutPromise
    ]).then(result => res.status(200).json(result));

  } catch (error) {
    console.error('Dispatch error:', error);
    const status = error.message.startsWith('Unauthorized') ? 401 
                 : error.message.startsWith('Forbidden') ? 403 
                 : error.message.startsWith('404') ? 404 
                 : 500;
    return res.status(status).json({ error: error.message || String(error) });
  }
}
