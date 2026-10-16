import { MongoClient } from 'mongodb';

let clientPromise;

export function getMongoClient() {
  if (!process.env.DATABASE_URI) {
    throw new Error('DATABASE_URI environment variable is missing');
  }

  // Use global variable across ALL environments (especially Vercel serverless)
  // to avoid establishing a new TLS connection on every lambda invocation
  if (!globalThis._mongoClientPromise) {
    const client = new MongoClient(process.env.DATABASE_URI, {
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 60000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      serverSelectionTimeoutMS: 5000,
    });
    globalThis._mongoClientPromise = client.connect();
  }
  return globalThis._mongoClientPromise;
}

export async function getDb(dbName) {
  const client = await getMongoClient();
  return client.db(dbName);
}

const PRIMARY_ADMIN_EMAILS = [
  '72019arnab@shristiacademy.edu.np',
  'arnabkung@gmail.com',
];

export function extractAuth(req) {
  const authHeader = req.headers.authorization;
  let idToken = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    idToken = authHeader.split('Bearer ')[1];
  } else if (req.headers['x-admin-secret'] && process.env.ADMIN_SECRET && req.headers['x-admin-secret'] === process.env.ADMIN_SECRET) {
    return { isAuthorized: true, isAdmin: true, user: { role: 'admin', email: 'admin-secret' } };
  } else if (process.env.NODE_ENV !== 'production') {
    return { isAuthorized: true, isAdmin: true, user: { role: 'admin', email: 'dev-preview' } };
  }

  if (!idToken) {
    return { isAuthorized: false, isAdmin: false, user: null };
  }

  let decodedToken = null;
  if (idToken.includes('.')) {
    try {
      const parts = idToken.split('.');
      if (parts.length >= 2 && parts[1]) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        decodedToken = JSON.parse(jsonPayload);
      }
    } catch (e) {
      console.warn('Token decode note:', e.message);
    }
  }

  const email = (decodedToken?.email || '').toLowerCase();
  const role = decodedToken?.role || '';
  const isAdmin =
    role === 'admin' ||
    PRIMARY_ADMIN_EMAILS.some((adm) => adm.toLowerCase() === email);

  return {
    isAuthorized: true,
    isAdmin,
    user: decodedToken || { email, role },
  };
}
