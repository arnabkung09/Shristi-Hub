import webpush from 'web-push';
import { MongoClient } from 'mongodb';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    admin.initializeApp({
      credential: Object.keys(serviceAccount).length > 0 
        ? admin.credential.cert(serviceAccount)
        : admin.credential.applicationDefault()
    });
  } catch (error) {
    console.warn('Firebase Admin initialization failed. Check FIREBASE_SERVICE_ACCOUNT_KEY:', error.message);
    admin.initializeApp();
  }
}

// Configure Web Push with VAPID keys
webpush.setVapidDetails(
  'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

let client;
let clientPromise;

if (!process.env.DATABASE_URI) {
  console.warn('DATABASE_URI is missing');
} else {
  const uri = process.env.DATABASE_URI;
  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    client = new MongoClient(uri);
    clientPromise = client.connect();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    // You could also check if decodedToken.email matches your admin emails
    // if (!decodedToken.email || !PRIMARY_ADMIN_EMAILS.includes(decodedToken.email)) {
    //   return res.status(403).json({ error: 'Forbidden: Admin access required' });
    // }
  } catch (error) {
    console.error('Auth verification failed:', error);
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }

  const { title, body, data, urgent, actionTab, audience, targetDeviceId } = req.body;

  try {
    const dbClient = await clientPromise;
    const db = dbClient.db();
    const collection = db.collection('devices');

    // Build the query to find target devices
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
      // if 'all', query is empty (matches all)
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

    let successCount = 0;
    let failureCount = 0;

    const promises = devices.map(async (device) => {
      try {
        await webpush.sendNotification(device.subscription, payload);
        successCount++;
      } catch (error) {
        failureCount++;
        // If the subscription is no longer valid (e.g. 410 Gone or 404 Not Found), remove it
        if (error.statusCode === 404 || error.statusCode === 410) {
          console.log(`[Registry] Removing dead token for device: ${device.deviceId}`);
          await collection.deleteOne({ _id: device._id });
        } else {
          console.error('Error sending notification:', error);
        }
      }
    });

    await Promise.all(promises);

    return res.status(200).json({ success: true, successCount, failureCount });
  } catch (error) {
    console.error('Dispatch error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
