import { MongoClient } from 'mongodb';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const FALLBACK_FILE = path.join(os.tmpdir(), 'shristi-hub-mongodb-store.json');

function loadDiskFallback() {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const raw = fs.readFileSync(FALLBACK_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

function saveDiskFallback(store) {
  try {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(store), 'utf8');
  } catch {}
}

function getFallbackStore() {
  if (!globalThis._inMemoryMongoStore) {
    globalThis._inMemoryMongoStore = loadDiskFallback();
  }
  return globalThis._inMemoryMongoStore;
}

function getNestedValue(obj, keyPath) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (keyPath in obj) return obj[keyPath];
  return keyPath.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);
}

function matchesQuery(doc, query = {}) {
  if (!query || typeof query !== 'object') return true;
  for (const [key, condition] of Object.entries(query)) {
    const val = getNestedValue(doc, key);
    if (condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
      if ('$gte' in condition && !(val >= condition.$gte)) return false;
      if ('$gt' in condition && !(val > condition.$gt)) return false;
      if ('$lte' in condition && !(val <= condition.$lte)) return false;
      if ('$lt' in condition && !(val < condition.$lt)) return false;
      if ('$in' in condition && Array.isArray(condition.$in) && !condition.$in.includes(val)) return false;
      if ('$ne' in condition && val === condition.$ne) return false;
    } else if (val !== condition) {
      return false;
    }
  }
  return true;
}

function createFallbackDb(dbName = 'shristi_hub') {
  const store = getFallbackStore();
  if (!store[dbName]) store[dbName] = {};
  const dbCollections = store[dbName];

  const getColArray = (name) => {
    if (!Array.isArray(dbCollections[name])) {
      dbCollections[name] = [];
    }
    return dbCollections[name];
  };

  return {
    databaseName: dbName,
    isFallback: true,
    async command() {
      return { ok: 1 };
    },
    collection(name) {
      return {
        async findOne(query = {}) {
          const docs = getColArray(name);
          const found = docs.find((d) => matchesQuery(d, query));
          return found ? JSON.parse(JSON.stringify(found)) : null;
        },
        find(query = {}) {
          let results = getColArray(name)
            .filter((d) => matchesQuery(d, query))
            .map((d) => JSON.parse(JSON.stringify(d)));
          const cursor = {
            sort(sortSpec = {}) {
              const entries = Object.entries(sortSpec);
              if (entries.length > 0) {
                const [field, dir] = entries[0];
                results.sort((a, b) => {
                  const av = getNestedValue(a, field) ?? 0;
                  const bv = getNestedValue(b, field) ?? 0;
                  if (av === bv) return 0;
                  return (av > bv ? 1 : -1) * (dir < 0 ? -1 : 1);
                });
              }
              return cursor;
            },
            limit(n) {
              if (typeof n === 'number' && n >= 0) {
                results = results.slice(0, n);
              }
              return cursor;
            },
            async toArray() {
              return results;
            },
          };
          return cursor;
        },
        async insertOne(doc) {
          const docs = getColArray(name);
          const newDoc = {
            _id: doc._id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            ...JSON.parse(JSON.stringify(doc)),
          };
          docs.push(newDoc);
          saveDiskFallback(store);
          return { acknowledged: true, insertedId: newDoc._id };
        },
        async updateOne(filter = {}, update = {}, options = {}) {
          const docs = getColArray(name);
          const idx = docs.findIndex((d) => matchesQuery(d, filter));
          const setFields = update.$set ? JSON.parse(JSON.stringify(update.$set)) : {};
          if (idx >= 0) {
            docs[idx] = { ...docs[idx], ...setFields };
            saveDiskFallback(store);
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
          } else if (options.upsert) {
            const newDoc = {
              _id: filter._id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              ...filter,
              ...setFields,
            };
            docs.push(newDoc);
            saveDiskFallback(store);
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: newDoc._id };
          }
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        },
        async deleteOne(filter = {}) {
          const docs = getColArray(name);
          const idx = docs.findIndex((d) => matchesQuery(d, filter));
          if (idx >= 0) {
            docs.splice(idx, 1);
            saveDiskFallback(store);
            return { acknowledged: true, deletedCount: 1 };
          }
          return { acknowledged: true, deletedCount: 0 };
        },
        async deleteMany(filter = {}) {
          const docs = getColArray(name);
          const before = docs.length;
          dbCollections[name] = docs.filter((d) => !matchesQuery(d, filter));
          const removed = before - dbCollections[name].length;
          if (removed > 0) saveDiskFallback(store);
          return { acknowledged: true, deletedCount: removed };
        },
        async countDocuments(query = {}) {
          const docs = getColArray(name);
          return docs.filter((d) => matchesQuery(d, query)).length;
        },
      };
    },
  };
}

export function resolveDatabaseUri() {
  return (
    process.env.DATABASE_URI ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGO_URL ||
    process.env.DATABASE_URL ||
    ''
  ).trim();
}

export function getMongoClient() {
  const uri = resolveDatabaseUri();
  if (!uri) {
    return null;
  }

  // Use global variable across ALL environments (especially Vercel serverless)
  // to avoid establishing a new TLS connection on every lambda invocation
  if (!globalThis._mongoClientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 60000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      serverSelectionTimeoutMS: 5000,
    });
    globalThis._mongoClientPromise = client.connect().catch((err) => {
      globalThis._mongoClientPromise = null;
      throw err;
    });
  }
  return globalThis._mongoClientPromise;
}

export async function getDb(dbName) {
  const clientPromise = getMongoClient();
  if (!clientPromise) {
    return createFallbackDb(dbName || 'shristi_hub');
  }
  try {
    const client = await clientPromise;
    return client.db(dbName);
  } catch (err) {
    console.warn('MongoDB connection fallback activated:', err.message);
    return createFallbackDb(dbName || 'shristi_hub');
  }
}

export function getVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY.trim(),
      privateKey: process.env.VAPID_PRIVATE_KEY.trim(),
    };
  }
  if (!globalThis._shristiDefaultVapidKeys) {
    const ecdh = crypto.createECDH('prime256v1');
    const privKey = crypto.createHash('sha256').update('shristi-student-council-vapid-key-v1').digest();
    ecdh.setPrivateKey(privKey);
    const pubKey = ecdh.getPublicKey(null, 'uncompressed');
    globalThis._shristiDefaultVapidKeys = {
      publicKey: pubKey.toString('base64url'),
      privateKey: privKey.toString('base64url'),
    };
  }
  return globalThis._shristiDefaultVapidKeys;
}

const PRIMARY_ADMIN_EMAILS = [
  '72019arnab@shristiacademy.edu.np',
  'arnabkung@gmail.com',
];

function decodeBase64Json(base64Url) {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(raw);
}

export function extractAuth(req) {
  const headers = req.headers || {};
  const authHeader = headers.authorization || headers.Authorization;
  let idToken = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    idToken = authHeader.split('Bearer ')[1];
  } else if (headers['x-admin-secret'] && process.env.ADMIN_SECRET && headers['x-admin-secret'] === process.env.ADMIN_SECRET) {
    return { isAuthorized: true, isAdmin: true, isCouncil: true, user: { role: 'admin', email: 'admin-secret', name: 'Administrator' } };
  } else if (process.env.NODE_ENV !== 'production') {
    const fallbackEmail = (headers['x-user-email'] || 'dev-preview').toLowerCase();
    const fallbackRole = headers['x-user-role'] || 'admin';
    return {
      isAuthorized: true,
      isAdmin: fallbackRole === 'admin' || PRIMARY_ADMIN_EMAILS.includes(fallbackEmail),
      isCouncil: fallbackRole === 'admin' || fallbackRole === 'council',
      user: { role: fallbackRole, email: fallbackEmail, id: headers['x-user-id'] || 'dev-preview' },
    };
  }

  let decodedToken = null;
  if (idToken && idToken.includes('.')) {
    try {
      const parts = idToken.split('.');
      if (parts.length >= 2 && parts[1]) {
        decodedToken = decodeBase64Json(parts[1]);
      }
    } catch (e) {
      console.warn('Token decode note:', e.message);
    }
  }

  const headerRole = headers['x-user-role'];
  const headerEmail = (headers['x-user-email'] || '').toLowerCase();
  const headerId = headers['x-user-id'];

  const email = (decodedToken?.email || headerEmail || '').toLowerCase();
  const role = decodedToken?.role || headerRole || '';
  const isAdmin =
    role === 'admin' ||
    PRIMARY_ADMIN_EMAILS.some((adm) => adm.toLowerCase() === email);
  const isCouncil = isAdmin || role === 'council';
  const isAuthorized = Boolean(idToken || email || headerId);

  return {
    isAuthorized,
    isAdmin,
    isCouncil,
    user: decodedToken ? { ...decodedToken, email, role: role || (isAdmin ? 'admin' : 'student'), id: decodedToken.sub || headerId } : { email, role, id: headerId },
  };
}
