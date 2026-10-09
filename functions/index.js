const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendPush = onCall({ region: "asia-south1" }, async (request) => {
  const data = request.data;
  
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to send notifications.");
  }

  const { tokens, title, body, urgent, actionTab } = data;

  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    throw new HttpsError("invalid-argument", "No target tokens provided.");
  }

  const message = {
    notification: {
      title: title || "Notification",
      body: body || ""
    },
    data: {
      urgent: String(!!urgent),
      actionTab: actionTab || "dashboard"
    },
    tokens: tokens
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      targetedDevices: tokens.length
    };
  } catch (error) {
    console.error("Error sending FCM:", error);
    throw new HttpsError("internal", "Failed to dispatch push notifications.");
  }
});
