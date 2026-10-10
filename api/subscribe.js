import { MongoClient } from 'mongodb';

let client;
let clientPromise;

if (!process.env.DATABASE_URI) {
  // Graceful fallback for build step if needed
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

  const { subscription, deviceId, userId, browser, model, role, house, grade } = req.body;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Missing or invalid subscription' });
  }

  try {
    const dbClient = await clientPromise;
    if (!dbClient) {
      return res.status(500).json({ error: 'DATABASE_URI is missing or MongoDB failed to initialize' });
    }
    const db = dbClient.db();
    
    const collection = db.collection('devices');
    
    // Upsert the device registration
    await collection.updateOne(
      { deviceId },
      {
        $set: {
          subscription,
          userId: userId || 'anonymous',
          browser: browser || 'Unknown',
          model: model || 'Unknown Device',
          role: role || 'student',
          house: house || null,
          grade: grade || null,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          registeredAt: new Date()
        }
      },
      { upsert: true }
    );

    return res.status(200).json({ success: true, message: 'Device registered successfully.' });
  } catch (error) {
    console.error('Subscription error:', error);
    return res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
}
