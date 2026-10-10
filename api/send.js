import webpush from 'web-push';
import { MongoClient } from 'mongodb';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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

function getAdminAuth() {
  if (getApps().length === 0) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is missing');
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    initializeApp({
      credential: cert(serviceAccount)
    });
  }
  return getAuth();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      const auth = getAdminAuth();
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (authError) {
      return res.status(403).json({ error: `Forbidden: Auth failed - ${authError.message}` });
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
      return res.status(404).json({ error: 'No active devices found for target.' });
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

    return res.status(200).json({ success: true, successCount, failureCount });
  } catch (error) {
    console.error('Dispatch error:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
}
