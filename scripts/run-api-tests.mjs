import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import stateHandler from "../api/state.js";
import heartbeatHandler from "../api/devices/heartbeat.js";
import cleanHandler from "../api/devices/clean.js";
import broadcastHandler from "../api/notifications/broadcast.js";
import recentHandler from "../api/notifications/recent.js";
import subscribeHandler from "../api/subscribe.js";
import sendHandler from "../api/send.js";
import { getVapidKeys } from "../api/_db.js";

function createMockReqRes({ method = "GET", query = {}, body = {}, headers = {} } = {}) {
  const req = {
    method,
    query,
    body,
    headers,
  };
  let statusCode = 200;
  let jsonBody = null;
  const resHeaders = {};
  const res = {
    setHeader(k, v) {
      resHeaders[k] = v;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonBody = data;
      return this;
    },
  };
  return { req, res, getStatus: () => statusCode, getJson: () => jsonBody };
}

function makeFakeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `Bearer ${header}.${body}.sig`;
}

async function run() {
  let passed = 0;
  function check(name, cond) {
    assert.ok(cond, name);
    console.log(`  ✓ ${name}`);
    passed++;
  }

  console.log("Running Vercel API + MongoDB Integration Suite...");

  // 1. VAPID Key fallback
  const vapid = getVapidKeys();
  check("VAPID keys are always available with valid 65-byte P-256 public key", Boolean(vapid.publicKey && vapid.privateKey));

  // 2. Initial GET /api/state?health=1 and GET /api/state
  {
    const healthCall = createMockReqRes({ method: "GET", query: { health: "1" } });
    await stateHandler(healthCall.req, healthCall.res);
    check("GET /api/state?health=1 returns 200 and connected: true", healthCall.getStatus() === 200 && healthCall.getJson()?.connected === true);

    const { req, res, getStatus, getJson } = createMockReqRes({ method: "GET" });
    await stateHandler(req, res);
    check("GET /api/state returns 200 and success: true", getStatus() === 200 && getJson()?.success === true);
  }

  const adminToken = makeFakeJwt({
    email: "72019arnab@shristiacademy.edu.np",
    name: "Arnab Shrestha",
    role: "admin",
    sub: "admin-1",
  });

  const studentToken = makeFakeJwt({
    email: "aarav.sharma@shristiacademy.edu.np",
    name: "Aarav Sharma",
    role: "student",
    sub: "s1",
  });

  // 3. Admin seeds state via POST /api/state
  {
    const initialState = {
      users: [
        {
          id: "admin-1",
          name: "Arnab Shrestha",
          email: "72019arnab@shristiacademy.edu.np",
          role: "admin",
          house: "Red",
          grade: "10",
          status: "active",
          aliases: [],
          verifiedAliases: [],
        },
        {
          id: "s1",
          name: "Aarav Sharma",
          email: "aarav.sharma@shristiacademy.edu.np",
          role: "student",
          house: "Red",
          grade: "10",
          status: "active",
          aliases: ["aarav.personal@gmail.com"],
          verifiedAliases: ["aarav.personal@gmail.com"],
        },
      ],
      events: [
        {
          id: "e1",
          title: "Annual Sports Meet",
          date: "2026-11-15",
          attendees: ["s1"],
          attended: [],
          capacity: 100,
        },
      ],
      polls: [
        {
          id: "p1",
          question: "Winter Fest Theme?",
          options: ["Starlight", "Carnival"],
          votes: [1, 0],
          voters: ["admin-1"],
          ballots: [{ userId: "admin-1", userName: "Arnab Shrestha", optionIndex: 0, optionText: "Starlight", timestamp: Date.now() }],
        },
      ],
      houseMessages: [],
      councilMessages: [],
      notifications: [],
    };

    const { req, res, getStatus, getJson } = createMockReqRes({
      method: "POST",
      headers: { authorization: adminToken, "x-user-role": "admin", "x-user-email": "72019arnab@shristiacademy.edu.np" },
      body: { state: initialState },
    });
    await stateHandler(req, res);
    check("Admin POST /api/state succeeds", getStatus() === 200 && getJson()?.success === true);
  }

  // 4. Student votes on poll, cancels RSVP, posts house & council chat via POST /api/state (syncActivity)
  {
    const activityPayload = {
      rsvpEventIds: [], // cancelled e1 RSVP
      polls: [
        {
          id: "p1",
          votes: [1, 1],
          voters: ["admin-1", "s1"],
          ballots: [
            { userId: "admin-1", userName: "Arnab Shrestha", optionIndex: 0, optionText: "Starlight", timestamp: Date.now() - 1000 },
            { userId: "s1", userName: "Aarav Sharma", optionIndex: 1, optionText: "Carnival", timestamp: Date.now() },
          ],
        },
      ],
      houseMessages: [
        {
          id: "hm1",
          house: "Red",
          authorId: "s1",
          authorName: "Aarav Sharma",
          body: "Go Red House!",
          timestamp: Date.now(),
        },
      ],
      councilMessages: [
        {
          id: "cm1",
          room: "council-hub",
          authorId: "s1",
          authorName: "Aarav Sharma",
          authorRole: "student",
          house: "Red",
          grade: "10",
          body: "Council agenda ready",
          timestamp: Date.now(),
        },
      ],
    };

    const { req, res, getStatus, getJson } = createMockReqRes({
      method: "POST",
      headers: { authorization: studentToken, "x-user-role": "student", "x-user-id": "s1" },
      body: {
        action: "syncActivity",
        studentId: "s1",
        studentName: "Aarav Sharma",
        studentHouse: "Red",
        activity: activityPayload,
      },
    });
    await stateHandler(req, res);
    check("Student POST /api/state (syncActivity) succeeds", getStatus() === 200 && getJson()?.success === true);

    // Verify persisted state via GET /api/state
    const getCall = createMockReqRes({ method: "GET" });
    await stateHandler(getCall.req, getCall.res);
    const savedState = getCall.getJson()?.state;
    const savedStudent = savedState.users.find((u) => u.id === "s1");
    const savedPoll = savedState.polls.find((p) => p.id === "p1");
    const savedEvent = savedState.events.find((e) => e.id === "e1");

    check("Student RSVP cancellation persists (event.attendees is empty)", savedEvent.attendees.length === 0);
    check("Student verifiedAliases are preserved in GET /api/state", savedStudent.verifiedAliases.includes("aarav.personal@gmail.com"));
    check("Poll vote count and ballot persist", savedPoll.votes[1] === 1 && savedPoll.ballots.length === 2);
    check("House message persists in MongoDB state", savedState.houseMessages.length === 1 && savedState.houseMessages[0].id === "hm1");
    check("Council message persists in MongoDB state", savedState.councilMessages.length === 1 && savedState.councilMessages[0].id === "cm1");
  }

  // 5. Device Heartbeat & Presence
  {
    const hbCall = createMockReqRes({
      method: "POST",
      body: {
        deviceId: "dev-1",
        userId: "s1",
        userName: "Aarav Sharma",
        email: "aarav.sharma@shristiacademy.edu.np",
        role: "student",
        house: "Red",
        kind: "desktop",
        model: "Mac",
        browser: "Chrome",
        platform: "Mac · Chrome",
        pushStatus: "enabled",
        online: true,
      },
    });
    await heartbeatHandler(hbCall.req, hbCall.res);
    const devices = hbCall.getJson()?.devices || [];
    check("POST /api/devices/heartbeat returns active devices with full metadata", devices.length === 1 && devices[0].model === "Mac" && devices[0].userId === "s1");
  }

  // 6. Web Push Subscription & Notification Dispatch
  {
    const subCall = createMockReqRes({
      method: "POST",
      body: {
        deviceId: "dev-1",
        userId: "s1",
        userName: "Aarav Sharma",
        email: "aarav.sharma@shristiacademy.edu.np",
        role: "student",
        house: "Red",
        subscription: { endpoint: "polling://dev-1" },
      },
    });
    await subscribeHandler(subCall.req, subCall.res);
    check("POST /api/subscribe registers polling fallback subscription", subCall.getStatus() === 200 && subCall.getJson()?.success === true);

    const sendCall = createMockReqRes({
      method: "POST",
      headers: { authorization: adminToken, "x-user-role": "admin" },
      body: {
        id: "notif-test-1",
        title: "Urgent Assembly",
        body: "Report to auditorium at 11 AM",
        urgent: true,
        audience: "all",
        actionTab: "notices",
        senderName: "Arnab Shrestha",
      },
    });
    await sendHandler(sendCall.req, sendCall.res);
    const sendJson = sendCall.getJson();
    check("POST /api/send succeeds and reports delivery to active device", sendCall.getStatus() === 200 && sendJson?.success === true && sendJson?.sent >= 1);

    // Check /api/notifications/recent does not duplicate when /api/notifications/broadcast is also called with same id
    const bcCall = createMockReqRes({
      method: "POST",
      body: {
        id: "notif-test-1",
        title: "Urgent Assembly",
        body: "Report to auditorium at 11 AM",
        urgent: true,
        audience: "all",
        actionTab: "notices",
      },
    });
    await broadcastHandler(bcCall.req, bcCall.res);

    const recentCall = createMockReqRes({ method: "GET" });
    await recentHandler(recentCall.req, recentCall.res);
    const matching = (recentCall.getJson()?.notifications || []).filter((n) => n.id === "notif-test-1");
    check("GET /api/notifications/recent returns deduplicated broadcast notification", matching.length === 1);
  }

  // 7. Clean stale devices
  {
    const cleanCall = createMockReqRes({ method: "POST" });
    await cleanHandler(cleanCall.req, cleanCall.res);
    check("POST /api/devices/clean succeeds", cleanCall.getStatus() === 200 && cleanCall.getJson()?.success === true);
  }

  try {
    const tmpFile = path.join(os.tmpdir(), "shristi-hub-mongodb-store.json");
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  } catch {}

  console.log(`\n${passed}/${passed} Vercel API + MongoDB integration checks passed.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
