import test from "node:test";
import assert from "node:assert/strict";
import { buildSeedState } from "../src/lib/seed";
import { reducer, uid } from "../src/store/hub";
import type { Suggestion, Poll } from "../src/lib/types";

test("Non-Anonymous Voting & Admin Poll Audit System", async (t) => {
  await t.test("seed state contains non-anonymous suggestions and ballots", () => {
    const state = buildSeedState();

    // Verify all seeded suggestions are non-anonymous and have author identity
    for (const s of state.suggestions) {
      assert.equal(s.anonymous, false, `Suggestion ${s.id} must not be anonymous`);
      assert.ok(s.authorLabel, `Suggestion ${s.id} must have authorLabel`);
      assert.notEqual(s.authorLabel, "Anonymous", `Suggestion ${s.id} authorLabel should not be 'Anonymous'`);
    }

    // Verify seeded polls have ballots with voter identity and selected options
    const seededPoll = state.polls.find((p) => p.id === "pl-1");
    assert.ok(seededPoll, "Poll pl-1 must exist");
    assert.ok(seededPoll.ballots && seededPoll.ballots.length > 0, "Poll pl-1 must have seeded ballots");

    // Check each ballot contains identity and option selection
    for (const b of seededPoll.ballots!) {
      assert.ok(b.userId, "Ballot must have userId");
      assert.ok(b.userName, "Ballot must have userName");
      assert.ok(typeof b.optionIndex === "number", "Ballot must have optionIndex");
      assert.ok(b.optionLabel, "Ballot must have optionLabel");
    }
  });

  await t.test("VOTE action records voter identity and selected option in poll.ballots", () => {
    let state = buildSeedState();

    // Select a student from state.users that hasn't voted in pl-1 yet
    const seededPoll = state.polls.find((p) => p.id === "pl-1")!;
    const studentVoter = state.users.find((u) => u.role === "student" && !seededPoll.voters.includes(u.id))!;
    assert.ok(studentVoter, "Unvoted student voter exists");

    const pollId = "pl-1";
    const initialPoll = state.polls.find((p) => p.id === pollId)!;
    const initialVotes0 = initialPoll.votes[0];
    const initialBallotCount = initialPoll.ballots?.length ?? 0;

    // Dispatch VOTE action
    state = reducer(state, {
      type: "VOTE",
      pollId,
      optionIndex: 0,
      userId: studentVoter.id,
    });

    const updatedPoll = state.polls.find((p) => p.id === pollId)!;
    assert.equal(updatedPoll.votes[0], initialVotes0 + 1, "Vote count for option 0 incremented");
    assert.ok(updatedPoll.voters.includes(studentVoter.id), "Voter id included in poll.voters");

    // Check poll.ballots for voter identity
    const ballot = updatedPoll.ballots?.find((b) => b.userId === studentVoter.id);
    assert.ok(ballot, "Ballot must be created for voter");
    assert.equal(ballot.userName, studentVoter.name, "Ballot records user name");
    assert.equal(ballot.userEmail, studentVoter.email, "Ballot records user email");
    assert.equal(ballot.userRole, studentVoter.role, "Ballot records user role");
    assert.equal(ballot.userGrade, studentVoter.grade, "Ballot records user grade");
    assert.equal(ballot.userHouse, studentVoter.house, "Ballot records user house");
    assert.equal(ballot.optionIndex, 0, "Ballot records option index");
    assert.equal(ballot.optionLabel, updatedPoll.options[0], "Ballot records option label");
    assert.equal(updatedPoll.ballots?.length, initialBallotCount + 1, "Ballot count increased by 1");
  });

  await t.test("Administrator can inspect who voted for what across options", () => {
    let state = buildSeedState();
    const pollId = "pl-1";
    const seededPoll = state.polls.find((p) => p.id === pollId)!;

    // Find three unvoted students
    const availableStudents = state.users.filter((u) => u.role === "student" && !seededPoll.voters.includes(u.id));
    assert.ok(availableStudents.length >= 3, "At least 3 unvoted students available");

    const s1 = availableStudents[0];
    const s2 = availableStudents[1];
    const s3 = availableStudents[2];

    const voters = [
      { user: s1, option: 0 },
      { user: s2, option: 1 },
      { user: s3, option: 2 },
    ];

    for (const v of voters) {
      state = reducer(state, {
        type: "VOTE",
        pollId,
        optionIndex: v.option,
        userId: v.user.id,
      });
    }

    const auditedPoll = state.polls.find((p) => p.id === pollId)!;
    const ballots = auditedPoll.ballots!;

    // Audit query: find all voters who voted for option 1
    const option1Voters = ballots.filter((b) => b.optionIndex === 1);
    assert.ok(option1Voters.some((b) => b.userId === s2.id), `${s2.name} is logged as voting for option 1`);
    assert.equal(option1Voters.find((b) => b.userId === s2.id)?.userName, s2.name);

    // Audit query: find all voters who voted for option 2
    const option2Voters = ballots.filter((b) => b.optionIndex === 2);
    assert.ok(option2Voters.some((b) => b.userId === s3.id), `${s3.name} is logged as voting for option 2`);
    assert.equal(option2Voters.find((b) => b.userId === s3.id)?.userName, s3.name);

    // Audit query: verify no ballot is anonymous
    for (const b of ballots) {
      assert.ok(b.userId, "Every ballot must identify user");
      assert.ok(b.userName, "Every ballot must specify voter name");
      assert.notEqual(b.userName, "Anonymous", "No ballot should have Anonymous name");
    }
  });

  await t.test("VOTE action prevents duplicate voting by the same user", () => {
    let state = buildSeedState();
    const pollId = "pl-1";
    const seededPoll = state.polls.find((p) => p.id === pollId)!;
    const student = state.users.find((u) => u.role === "student" && !seededPoll.voters.includes(u.id))!;

    state = reducer(state, {
      type: "VOTE",
      pollId,
      optionIndex: 0,
      userId: student.id,
    });

    const voteCountAfterFirst = state.polls.find((p) => p.id === pollId)!.votes[0];
    const ballotCountAfterFirst = state.polls.find((p) => p.id === pollId)!.ballots!.length;

    // Try voting again
    state = reducer(state, {
      type: "VOTE",
      pollId,
      optionIndex: 1,
      userId: student.id,
    });

    const pollAfterSecond = state.polls.find((p) => p.id === pollId)!;
    assert.equal(pollAfterSecond.votes[0], voteCountAfterFirst, "Votes should not increment on duplicate vote");
    assert.equal(pollAfterSecond.ballots!.length, ballotCountAfterFirst, "Ballots should not duplicate on repeat vote");
  });

  await t.test("ADD_SUGGESTION forces anonymous: false and captures verified author profile", () => {
    let state = buildSeedState();
    const student = state.users.find((u) => u.role === "student")!;

    const suggestionPayload: Suggestion = {
      id: uid(),
      category: "Canteen",
      text: "Introduce fresh fruit bowls and smoothies in the break canteen.",
      anonymous: true, // Attempting to submit anonymously
      authorId: student.id,
      authorLabel: "Anonymous",
      authorEmail: student.email,
      authorRole: student.role,
      authorGrade: student.grade,
      authorHouse: student.house,
      status: "pending",
      timestamp: Date.now(),
    };

    state = reducer(state, {
      type: "ADD_SUGGESTION",
      suggestion: suggestionPayload,
    });

    const created = state.suggestions.find((s) => s.id === suggestionPayload.id)!;
    assert.ok(created, "Suggestion was created");
    assert.equal(created.anonymous, false, "Reducer strictly overrides anonymous to false");
    assert.equal(created.authorId, student.id, "Author ID is preserved");
    assert.equal(created.authorEmail, student.email, "Author email is preserved");
    assert.equal(created.authorRole, student.role, "Author role is preserved");
    assert.equal(created.authorGrade, student.grade, "Author grade is preserved");
    assert.equal(created.authorHouse, student.house, "Author house is preserved");
    assert.ok(created.authorLabel.includes(student.name), "Author label includes verified student name");
  });

  await t.test("Class accounts (role: grade) cannot vote", () => {
    let state = buildSeedState();
    const classUser = state.users.find((u) => u.role === "grade")!;
    assert.ok(classUser, "Class account exists in users");

    const pollId = "pl-1";
    const initialVotes = [...state.polls.find((p) => p.id === pollId)!.votes];

    // Attempt vote with class account
    state = reducer(state, {
      type: "VOTE",
      pollId,
      optionIndex: 0,
      userId: classUser.id,
    });

    const currentVotes = state.polls.find((p) => p.id === pollId)!.votes;
    assert.deepEqual(currentVotes, initialVotes, "Class account vote was ignored");
  });

  await t.test("DELETE_STUDENT removes voter's ballots cleanly", () => {
    let state = buildSeedState();
    const admin = state.users.find((u) => u.role === "admin")!;
    const pollId = "pl-1";
    const student = state.users.find((u) => u.role === "student" && !state.polls.find((p) => p.id === pollId)!.voters.includes(u.id))!;

    // Cast a vote
    state = reducer(state, {
      type: "VOTE",
      pollId,
      optionIndex: 0,
      userId: student.id,
    });

    assert.ok(state.polls.find((p) => p.id === pollId)!.ballots?.some((b) => b.userId === student.id), "Ballot exists for student");

    // Admin logs in and removes student
    state = { ...state, session: { userId: admin.id, token: "token", expiresAt: Date.now() + 100000 } };
    state = reducer(state, {
      type: "DELETE_STUDENT",
      userId: student.id,
    });

    const pollAfterDelete = state.polls.find((p) => p.id === pollId)!;
    assert.equal(pollAfterDelete.voters.includes(student.id), false, "Voter removed from poll.voters");
    assert.equal(pollAfterDelete.ballots?.some((b) => b.userId === student.id), false, "Ballot removed from poll.ballots");
  });
});
