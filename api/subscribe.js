import { MongoClient } from 'mongodb';

let clientPromise;
function getMongoClient() {
  if (!clientPromise) {
    if (!process.env.DATABASE_URI) {
      throw new Error('DATABASE_URI environment variable is missing');
    }
    const client = new MongoClient(process.env.DATABASE_URI);
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

  try {
    const { deviceId, subscription, userId, name, role, grade, house } = req.body;

    if (!deviceId || !subscription) {
      return res.status(400).json({ error: 'Missing deviceId or subscription data.' });
    }

    const dbClient = await getMongoClient();
    const db = dbClient.db();
    const collection = db.collection('devices');

    await collection.updateOne(
      { deviceId },
      { 
        $set: {
          deviceId,
          subscription,
          userId: userId || 'anonymous',
          name: name || 'Anonymous',
          role: role || 'student',
          grade: grade || null,
          house: house || null,
          updatedAt: new Date()
        } 
      },
      { upsert: true }
    );

    return res.status(200).json({ success: true, message: 'Device registered successfully.' });
  } catch (error) {
    console.error('Subscription error:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
}
