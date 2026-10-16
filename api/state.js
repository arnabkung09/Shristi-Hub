import { getDb, extractAuth } from './_db.js';

function sanitizeRoster(users) {
  if (!Array.isArray(users)) return [];
  return users.map((user) => ({
    ...user,
    password: '',
    passwordHash: user.passwordHash ? 'managed' : '',
  }));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const db = await getDb();
    const collection = db.collection('hub_state');

    // Health / Diagnostics endpoint
    if (req.method === 'GET' && (req.query.health === '1' || req.query.test === '1')) {
      await db.command({ ping: 1 });
      const doc = await collection.findOne({ _id: 'main' });
      return res.status(200).json({
        success: true,
        connected: true,
        database: db.databaseName,
        hasExistingState: Boolean(doc && doc.state),
        lastSynced: doc?.updatedAt || null,
        version: doc?.version || null,
        message: 'Integrated MongoDB database connection is active and healthy.',
      });
    }

    if (req.method === 'GET') {
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
      });
    }

    if (req.method === 'POST') {
      const auth = extractAuth(req);
      const body = req.body || {};

      // 1. Student / User Activity Sync (RSVPs, poll votes, ratings, suggestions)
      if (body.action === 'syncActivity') {
        const { studentId, studentName, studentHouse, studentGrade, activity } = body;
        if (!studentId || !activity) {
          return res.status(400).json({ error: 'Missing studentId or activity payload' });
        }

        const doc = await collection.findOne({ _id: 'main' });
        if (!doc || !doc.state) {
          return res.status(404).json({ error: 'Hub state document not initialized yet' });
        }

        const current = doc.state;

        // Sync RSVPs / Attendees
        let events = current.events || [];
        if (Array.isArray(activity.events)) {
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

        // Sync Poll Votes (prevent double voting)
        let polls = current.polls || [];
        if (Array.isArray(activity.polls)) {
          const incomingPolls = new Map(activity.polls.map((p) => [p.id, p]));
          polls = polls.map((poll) => {
            const candidate = incomingPolls.get(poll.id);
            if (!candidate || (poll.voters || []).includes(studentId)) return poll;
            if (Array.isArray(candidate.voters) && candidate.voters.includes(studentId) && Array.isArray(candidate.votes)) {
              return {
                ...poll,
                votes: candidate.votes,
                voters: [...(poll.voters || []), studentId],
                ballots: candidate.ballots || poll.ballots || [],
              };
            }
            return poll;
          });
        }

        // Sync Site Rating
        let siteRatings = current.siteRatings || [];
        if (activity.rating && typeof activity.rating.value === 'number') {
          const r = activity.rating;
          siteRatings = siteRatings.filter((item) => item.userId !== studentId);
          siteRatings.unshift({
            userId: studentId,
            userName: studentName || r.userName || 'Student',
            house: studentHouse || r.house || 'Red',
            value: Math.max(1, Math.min(5, Math.round(r.value))),
            comment: String(r.comment || '').slice(0, 300),
            timestamp: Date.now(),
          });
          siteRatings = siteRatings.slice(0, 500);
        }

        // Sync Suggestions
        let suggestions = current.suggestions || [];
        if (Array.isArray(activity.suggestions)) {
          const existingIds = new Set(suggestions.map((s) => s.id));
          const newSuggestions = activity.suggestions.filter((s) => !existingIds.has(s.id)).slice(0, 5);
          suggestions = [...newSuggestions, ...suggestions].slice(0, 300);
        }

        // Sync Notification Read Status
        let notifications = current.notifications || [];
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
        let tasks = current.tasks || [];
        if (activity.taskStatuses && typeof activity.taskStatuses === 'object') {
          tasks = tasks.map((t) => {
            if (t.assigneeId === studentId && activity.taskStatuses[t.id]) {
              return { ...t, status: activity.taskStatuses[t.id] };
            }
            return t;
          });
        }

        const updatedState = {
          ...current,
          events,
          polls,
          siteRatings,
          suggestions,
          notifications,
          tasks,
        };

        const now = new Date();
        const version = Date.now();

        await collection.updateOne(
          { _id: 'main' },
          {
            $set: {
              state: updatedState,
              updatedAt: now,
              updatedBy: studentName ? `${studentName} (${studentId})` : studentId,
              version,
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

      // 2. Full Site State Save (Administrators)
      if (!body.state || typeof body.state !== 'object') {
        return res.status(400).json({ error: 'State payload is missing or invalid' });
      }

      if (!auth.isAdmin && process.env.NODE_ENV === 'production' && !auth.isAuthorized) {
        return res.status(403).json({ error: 'Administrator access required to save site state.' });
      }

      const rawState = body.state;
      const sanitizedState = {
        ...rawState,
        session: null,
        users: sanitizeRoster(rawState.users),
      };

      const now = new Date();
      const version = Date.now();

      await collection.updateOne(
        { _id: 'main' },
        {
          $set: {
            state: sanitizedState,
            updatedAt: now,
            updatedBy: auth.user?.email || 'admin',
            version,
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
