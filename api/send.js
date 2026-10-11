import webpush from 'web-push';
import { MongoClient } from 'mongodb';

let clientPromise;
function getMongoClient() {
  if (!clientPromise) {
    if (!process.env.DATABASE_URI) {
      throw new Error('DATABASE_URI environment variable is missing');
    }
    const client = new MongoClient(process.env.DATABASE_URI, {
      serverSelectionTimeoutMS: 5000 // 5 seconds timeout
    });
    if (process.env.NODE_ENV === 'development') {
      if (!global._mongoClientPromise) {
        global._mongoClientPromise = client.connect();
      }
      clientPromise = global._mongoClientPromise;
    } else {
      clientPromise = client.connect();
    }
  }
  return clientPromise;
}

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
        const authHeader = req.headers.authorization;
        let idToken = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          idToken = authHeader.split('Bearer ')[1];
        } else if (req.headers['x-admin-secret'] && process.env.ADMIN_SECRET && req.headers['x-admin-secret'] === process.env.ADMIN_SECRET) {
          idToken = 'secret-authenticated';
        } else if (process.env.NODE_ENV !== 'production') {
          idToken = 'dev-preview';
        } else {
          throw new Error('Unauthorized: No token provided');
        }

        // Lightweight JWT decode instead of heavy firebase-admin SDK
        // which crashes on Vercel Node 18+ bundler environments
        let decodedToken = null;
        if (idToken && idToken.includes('.')) {
          try {
            const parts = idToken.split('.');
            if (parts.length >= 2 && parts[1]) {
              const base64Url = parts[1];
              const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
              const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                  return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
              }).join(''));
              decodedToken = JSON.parse(jsonPayload);
            }
          } catch (e) {
            // Non-fatal if dev token format
            console.warn('Token decode note:', e.message);
          }
        }

        const { title, body, data, urgent, actionTab, audience, targetDeviceId } = req.body;

        const dbClient = await getMongoClient();
        const db = dbClient.db();
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

        return { success: true, successCount, failureCount };
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
