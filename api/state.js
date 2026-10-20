import { getDb, extractAuth } from './_db.js';

function sanitizeRoster(users) {
  if (!Array.isArray(users)) return [];
  return users.map((user) => ({
    ...user,
    password: '',
    passwordHash: user.passwordHash ? 'managed' : '',
    aliases: Array.isArray(user.aliases) ? user.aliases : [],
    verifiedAliases: Array.isArray(user.verifiedAliases) ? user.verifiedAliases : [],
  }));
}

export default async function handler(req, res) {
  try {
    const db = await getDb();
    const collection = db.collection('hub_state');
    const query = req.query || {};

    // Health / Diagnostics endpoint
    if (req.method === 'GET' && (query.health === '1' || query.test === '1')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      await db.command({ ping: 1 });
      const doc = await collection.findOne({ _id: 'main' });
      return res.status(200).json({
        success: true,
        connected: true,
        database: db.databaseName || 'shristi_hub',
        hasExistingState: Boolean(doc && doc.state),
        lastSynced: doc?.updatedAt || null,
        version: doc?.version || null,
        message: 'Integrated MongoDB database connection is active and healthy.',
      });
    }

    // Ultra-fast dedicated Branding & Identity endpoint (<1KB payload, resolves in ~5ms)
    if (req.method === 'GET' && query.section === 'branding') {
      if (query.fresh === '1') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, s-maxage=2, stale-while-revalidate=120');
      }

      const doc = await collection.findOne(
        { _id: 'main' },
        { projection: { 'state.branding': 1, 'state.houses': 1, 'state.legal': 1, updatedAt: 1, version: 1, lastModified: 1 } }
      );

      if (!doc || !doc.state) {
        return res.status(200).json({
          success: true,
          exists: false,
          branding: null,
          houses: null,
          legal: null,
        });
      }

      return res.status(200).json({
        success: true,
        exists: true,
        branding: doc.state.branding || null,
        houses: doc.state.houses || null,
        legal: doc.state.legal || null,
        updatedAt: doc.updatedAt,
        version: doc.version,
        lastModified: doc.lastModified || doc.version || doc.state?.lastModified,
      });
    }

    if (req.method === 'GET') {
      // Vercel Edge CDN cache: ~20ms response time globally with background revalidation
      if (query.fresh === '1') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, s-maxage=2, stale-while-revalidate=120');
      }

      const doc = await collection.findOne({ _id: 'main' });
      if (!doc || !doc.state) {
        return res.status(200).json({
          success: true,
          exists: false,
          state: null,
          message: 'No remote state saved in MongoDB yet.',
        });
      }

      return res.status(200).json({
        success: true,
        exists: true,
        state: doc.state,
        updatedAt: doc.updatedAt,
        updatedBy: doc.updatedBy,
        version: doc.version,
        lastModified: doc.lastModified || doc.version || doc.state?.lastModified,
      });
    }

    if (req.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const auth = extractAuth(req);
      const body = req.body || {};

      // 1. Student / User Activity Sync (RSVPs, poll votes, ratings, suggestions, messages, tasks)
      if (body.action === 'syncActivity') {
        const { studentId, studentName, studentHouse, activity } = body;
        if (!studentId || !activity) {
          return res.status(400).json({ error: 'Missing studentId or activity payload' });
        }

        const doc = await collection.findOne({ _id: 'main' });
        const current = doc?.state || {
          departments: body.departments || [],
          events: [],
          polls: [],
          siteRatings: [],
          suggestions: [],
          notifications: [],
          tasks: [],
          houseMessages: [],
          councilMessages: [],
          users: [],
        };

        // Sync RSVPs / Attendees (supports both rsvpEventIds and events array)
        let events = Array.isArray(current.events) ? [...current.events] : [];
        if (Array.isArray(activity.rsvpEventIds)) {
          const rsvpSet = new Set(activity.rsvpEventIds);
          events = events.map((event) => {
            const attendees = new Set(Array.isArray(event.attendees) ? event.attendees : []);
            const attended = new Set(Array.isArray(event.attended) ? event.attended : []);
            if (rsvpSet.has(event.id)) {
              if (attendees.size < (event.capacity || 999)) {
                attendees.add(studentId);
              }
            } else {
              attendees.delete(studentId);
              attended.delete(studentId);
            }
            return { ...event, attendees: Array.from(attendees), attended: Array.from(attended) };
          });
        } else if (Array.isArray(activity.events)) {
          const incomingEvents = new Map(activity.events.map((e) => [e.id, e]));
          events = events.map((event) => {
            const candidate = incomingEvents.get(event.id);
            if (!candidate) return event;
            const attendees = new Set(Array.isArray(event.attendees) ? event.attendees : []);
            if (Array.isArray(candidate.attendees) && candidate.attendees.includes(studentId)) {
              if (attendees.size < (event.capacity || 999)) {
                attendees.add(studentId);
              }
            } else {
              attendees.delete(studentId);
            }
            return { ...event, attendees: Array.from(attendees) };
          });
        }

        // Sync Poll Votes (prevent double voting and safely merge concurrent votes/ballots)
        let polls = Array.isArray(current.polls) ? [...current.polls] : [];
        if (Array.isArray(activity.polls)) {
          const incomingPolls = new Map(activity.polls.map((p) => [p.id, p]));
          polls = polls.map((poll) => {
            const candidate = incomingPolls.get(poll.id);
            if (!candidate || (poll.voters || []).includes(studentId)) return poll;
            if (Array.isArray(candidate.voters) && candidate.voters.includes(studentId)) {
              const existingBallots = Array.isArray(poll.ballots) ? poll.ballots.filter((b) => b && b.userId !== studentId) : [];
              const ownBallot = Array.isArray(candidate.ballots)
                ? candidate.ballots.find((b) => b && b.userId === studentId)
                : null;
              const nextBallots = ownBallot ? [...existingBallots, ownBallot] : (candidate.ballots || existingBallots);
              let nextVotes = Array.isArray(poll.votes) ? [...poll.votes] : [];
              if (ownBallot && typeof ownBallot.optionIndex === 'number' && ownBallot.optionIndex >= 0 && ownBallot.optionIndex < nextVotes.length) {
                nextVotes[ownBallot.optionIndex] = (Number(nextVotes[ownBallot.optionIndex]) || 0) + 1;
              } else if (Array.isArray(candidate.votes)) {
                nextVotes = candidate.votes;
              }
              return {
                ...poll,
                votes: nextVotes,
                voters: Array.from(new Set([...(poll.voters || []), studentId])),
                ballots: nextBallots,
              };
            }
            return poll;
          });
        }

        // Sync Site Rating
        let siteRatings = Array.isArray(current.siteRatings) ? [...current.siteRatings] : [];
        if (activity.rating && typeof activity.rating.value === 'number') {
          const r = activity.rating;
          siteRatings = siteRatings.filter((item) => item.userId !== studentId);
          siteRatings.unshift({
            userId: studentId,
            userName: studentName || r.userName || 'Student',
            house: studentHouse || r.house || 'Red',
            value: Math.max(1, Math.min(5, Math.round(r.value))),
            comment: String(r.comment || '').slice(0, 300),
            timestamp: r.timestamp || Date.now(),
          });
          siteRatings = siteRatings.slice(0, 500);
        }

        // Sync Suggestions
        let suggestions = Array.isArray(current.suggestions) ? [...current.suggestions] : [];
        if (Array.isArray(activity.suggestions)) {
          const existingIds = new Set(suggestions.map((s) => s.id));
          const newSuggestions = activity.suggestions.filter((s) => s && s.id && !existingIds.has(s.id)).slice(0, 10);
          if (newSuggestions.length > 0) {
            suggestions = [...newSuggestions, ...suggestions].slice(0, 300);
          }
        }

        // Sync Notification Read Status
        let notifications = Array.isArray(current.notifications) ? [...current.notifications] : [];
        if (Array.isArray(activity.readNotificationIds)) {
          const readSet = new Set(activity.readNotificationIds);
          notifications = notifications.map((n) => {
            if (!readSet.has(n.id)) return n;
            const readBy = new Set(Array.isArray(n.readBy) ? n.readBy : []);
            readBy.add(studentId);
            return { ...n, readBy: Array.from(readBy) };
          });
        }

        // Sync Task Statuses (if assigned)
        let tasks = Array.isArray(current.tasks) ? [...current.tasks] : [];
        if (activity.taskStatuses && typeof activity.taskStatuses === 'object') {
          tasks = tasks.map((t) => {
            if (t.assigneeId === studentId && activity.taskStatuses[t.id]) {
              const nextStatus = activity.taskStatuses[t.id];
              return {
                ...t,
                status: nextStatus,
                completedAt: nextStatus === 'done' ? (t.completedAt || Date.now()) : undefined,
              };
            }
            return t;
          });
        }

        // Sync House Messages
        let houseMessages = Array.isArray(current.houseMessages) ? [...current.houseMessages] : [];
        if (Array.isArray(activity.houseMessages)) {
          const existingIds = new Set(houseMessages.map((m) => m.id));
          const newMessages = activity.houseMessages.filter((m) => m && m.id && !existingIds.has(m.id));
          if (newMessages.length > 0) {
            houseMessages = [...newMessages, ...houseMessages]
              .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
              .slice(0, 500);
          }
        }

        // Sync Council Messages (including soft-removals by author)
        let councilMessages = Array.isArray(current.councilMessages) ? [...current.councilMessages] : [];
        if (Array.isArray(activity.councilMessages)) {
          const incomingById = new Map(
            activity.councilMessages.filter((m) => m && m.id).map((m) => [m.id, m])
          );
          councilMessages = councilMessages.map((existing) => {
            const incoming = incomingById.get(existing.id);
            if (incoming && existing.authorId === studentId && incoming.removed) {
              return { ...existing, removed: true, body: '' };
            }
            return existing;
          });
          const existingIds = new Set(councilMessages.map((m) => m.id));
          const newMessages = activity.councilMessages.filter((m) => m && m.id && !existingIds.has(m.id));
          if (newMessages.length > 0) {
            councilMessages = [...councilMessages, ...newMessages]
              .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0))
              .slice(-500);
          }
        }

        // Update user lastActive, active status, and avatarUrl if changed
        const nowTs = Date.now();
        const validAvatar =
          typeof activity.avatarUrl === 'string' &&
          (activity.avatarUrl === '' ||
            (/^(https:\/\/|data:image\/(jpeg|jpg|png|webp|gif|svg\+xml);base64,)/.test(activity.avatarUrl) &&
              activity.avatarUrl.length <= 350000))
            ? activity.avatarUrl
            : undefined;
        const users = Array.isArray(current.users)
          ? current.users.map((u) =>
              u.id === studentId
                ? {
                    ...u,
                    status: 'active',
                    lastActive: nowTs,
                    ...(validAvatar !== undefined ? { avatarUrl: validAvatar || undefined } : {}),
                  }
                : u
            )
          : [];

        const updatedState = {
          ...current,
          users,
          events,
          polls,
          siteRatings,
          suggestions,
          notifications,
          tasks,
          houseMessages,
          councilMessages,
          lastModified: nowTs,
        };

        const now = new Date();
        const version = nowTs;

        await collection.updateOne(
          { _id: 'main' },
          {
            $set: {
              state: updatedState,
              updatedAt: now,
              updatedBy: studentName ? `${studentName} (${studentId})` : studentId,
              version,
              lastModified: version,
            },
          },
          { upsert: true }
        );

        return res.status(200).json({
          success: true,
          message: 'User activity synchronized to MongoDB successfully.',
          version,
          updatedAt: now,
        });
      }

      // 2. Full Site State Save (Administrators & Council)
      if (!body.state || typeof body.state !== 'object') {
        return res.status(400).json({ error: 'State payload is missing or invalid' });
      }

      if (!auth.isAdmin && !auth.isCouncil && process.env.NODE_ENV === 'production' && !auth.isAuthorized) {
        return res.status(403).json({ error: 'Administrator access required to save site state.' });
      }

      const rawState = body.state;
      const now = new Date();
      const version = Date.now();
      const sanitizedState = {
        ...rawState,
        lastModified: version,
        session: null,
        users: sanitizeRoster(rawState.users),
      };

      await collection.updateOne(
        { _id: 'main' },
        {
          $set: {
            state: sanitizedState,
            updatedAt: now,
            updatedBy: auth.user?.email || 'admin',
            version,
            lastModified: version,
          },
        },
        { upsert: true }
      );

      // Save version to history collection (capped at 30 recent snapshots)
      try {
        const historyCollection = db.collection('hub_state_history');
        await historyCollection.insertOne({
          version,
          savedAt: now,
          savedBy: auth.user?.email || 'admin',
          summary: {
            usersCount: sanitizedState.users?.length || 0,
            tasksCount: sanitizedState.tasks?.length || 0,
            eventsCount: sanitizedState.events?.length || 0,
            pollsCount: sanitizedState.polls?.length || 0,
            branding: sanitizedState.branding?.schoolName || 'Default',
          },
        });
        const historyCount = await historyCollection.countDocuments();
        if (historyCount > 30) {
          const oldest = await historyCollection.find().sort({ version: 1 }).limit(historyCount - 30).toArray();
          const oldestIds = oldest.map((d) => d._id);
          await historyCollection.deleteMany({ _id: { $in: oldestIds } });
        }
      } catch (histErr) {
        console.warn('History snapshot notice:', histErr);
      }

      return res.status(200).json({
        success: true,
        message: 'All site data successfully saved to MongoDB database.',
        version,
        updatedAt: now,
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('State sync error:', error);
    return res.status(500).json({
      error: error.message || 'Database error occurred',
    });
  }
}
