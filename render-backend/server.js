import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';

// Initialize Express
const app = express();
app.use(express.json());

// Enable CORS for your frontend domains
app.use(cors({
  origin: ['https://shristi-hub.web.app', 'http://localhost:3000'],
  methods: ['GET', 'POST']
}));

// Initialize Firebase Admin securely from Render Environment Variables
// On Render, go to your Web Service -> Environment -> Add FIREBASE_SERVICE_ACCOUNT
// Paste the ENTIRE contents of your serviceAccountKey.json into the value field.
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
} catch (err) {
  console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT env var. Falling back to default credentials.");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: serviceAccount 
      ? admin.credential.cert(serviceAccount) 
      : admin.credential.applicationDefault()
  });
}

// In-memory device registry 
// Note: On Render's free tier, the server sleeps after 15 minutes of inactivity, 
// which resets this memory. For a real production app, move this map to a database.
const deviceRegistry = new Map();

// Root route for Render health checks
app.get('/', (req, res) => {
  res.json({ status: "ok", service: "Shristi FCM Backend API" });
});

/**
 * 1. Register a Device
 * The Vite frontend sends the FCM token and device metadata here.
 */
app.post('/api/devices/register', (req, res) => {
  const { token, deviceId, userId, browser, model, role } = req.body;
  
  if (!token || !deviceId) {
    return res.status(400).json({ error: "Missing token or deviceId" });
  }

  // Store or update the device in the registry
  deviceRegistry.set(deviceId, {
    token,
    userId: userId || 'anonymous',
    browser: browser || 'Unknown',
    model: model || 'Unknown Device',
    role: role || 'student',
    registeredAt: Date.now()
  });

  console.log(`[Registry] Device connected: ${deviceId} (${model})`);
  return res.json({ success: true, message: "Device registered successfully." });
});

/**
 * 2. Send Targeted Notification (Admin Only)
 * Finds the target user/device in the registry and dispatches an FCM HTTP v1 push.
 */
app.post('/api/admin/send-notification', async (req, res) => {
  const { targetUserId, targetDeviceId, title, body, data } = req.body;
  
  // Extremely basic auth guard. 
  // On Render, add an environment variable called ADMIN_SECRET
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
      return res.status(403).json({ error: "Unauthorized: Invalid Admin Secret" });
    }
  }

  // Find matching tokens in the registry
  const targetTokens = [];
  for (const [id, device] of deviceRegistry.entries()) {
    if ((targetDeviceId && id === targetDeviceId) || (targetUserId && device.userId === targetUserId)) {
      targetTokens.push(device.token);
    }
  }

  if (targetTokens.length === 0) {
    return res.status(404).json({ error: "No active devices found for target." });
  }

  try {
    const message = {
      notification: {
        title: title || "Shristi Alert",
        body: body || ""
      },
      data: data || {},
      tokens: targetTokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    // Clean up dead tokens automatically
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errCode = resp.error?.code;
        if (errCode === 'messaging/invalid-registration-token' || errCode === 'messaging/registration-token-not-registered') {
           const deadToken = targetTokens[idx];
           for (const [id, device] of deviceRegistry.entries()) {
              if (device.token === deadToken) {
                console.log(`[Registry] Removing dead token for device: ${id}`);
                deviceRegistry.delete(id);
              }
           }
        }
      }
    });

    return res.json({ 
      success: true, 
      successCount: response.successCount, 
      failureCount: response.failureCount 
    });
  } catch (error) {
    console.error("FCM dispatch error:", error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Render FCM backend running on port ${PORT}`);
});
