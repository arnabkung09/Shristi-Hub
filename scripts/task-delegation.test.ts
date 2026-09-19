import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSeedState } from "../src/lib/seed";
import { tasksForDepartment, taskDepartment } from "../src/lib/admin";
import { reducer } from "../src/store/hub";
import type { CouncilTask, HubState } from "../src/lib/types";

describe("Task Delegation & Department Log Workflow", () => {
  it("initializes with seed tasks properly mapped to departments", () => {
    const state = buildSeedState();
    assert.ok(state.tasks.length > 0, "Tasks should exist in seed state");
    assert.ok(state.departments.length > 0, "Departments should exist");

    for (const task of state.tasks) {
      const dept = taskDepartment(task, state.users, state.departments);
      assert.ok(dept, `Every task must resolve to a department, got: ${dept}`);
    }
  });

  it("assigns a department when creating a new task through reducer", () => {
    let state = buildSeedState();
    const admin = state.users.find((u) => u.role === "admin");
    assert.ok(admin);
    state.session = { userId: admin.id, role: admin.role, expiresAt: Date.now() + 3600000 };

    const culturalDept = state.departments.find((d) => d === "Cultural") || state.departments[0];
    const newTask: CouncilTask = {
      id: "task-delegate-101",
      title: "Stage Setup for Drama Night",
      details: "Set up spotlights and backstage microphones.",
      due: "2026-09-25",
      priority: "High",
      assigneeId: "",
      status: "todo",
      createdBy: admin.name,
      createdAt: Date.now(),
      department: culturalDept,
    };

    // Dispatch ADD_TASK
    state = reducer(state, { type: "ADD_TASK", task: newTask });
    const resolvedDept = taskDepartment(newTask, state.users, state.departments);
    assert.equal(resolvedDept, culturalDept);

    const culturalTasks = tasksForDepartment(culturalDept, state.tasks, state.users, state.departments);
    assert.ok(culturalTasks.some((t) => t.id === "task-delegate-101"));
  });

  it("automatically logs into Done by Department when moved/dragged to done", () => {
    let state = buildSeedState();
    const admin = state.users.find((u) => u.role === "admin");
    assert.ok(admin);
    state.session = { userId: admin.id, role: admin.role, expiresAt: Date.now() + 3600000 };

    const sportsDept = state.departments.find((d) => d === "Sports") || state.departments[0];
    const task: CouncilTask = {
      id: "task-sports-102",
      title: "Order New Basketballs",
      details: "Procure 10 size-7 balls for upcoming tournament.",
      due: "2026-09-22",
      priority: "Medium",
      assigneeId: "",
      status: "todo",
      createdBy: "Sports Captain",
      createdAt: Date.now(),
      department: sportsDept,
    };

    state = reducer(state, { type: "ADD_TASK", task });
    let sportsDone = tasksForDepartment(sportsDept, state.tasks, state.users, state.departments).filter(
      (t) => t.status === "done"
    );
    assert.ok(!sportsDone.some((t) => t.id === "task-sports-102"), "Should not be done yet");

    // Move task to done (dragged to Completed column)
    state = reducer(state, { type: "MOVE_TASK", taskId: "task-sports-102", status: "done" });

    sportsDone = tasksForDepartment(sportsDept, state.tasks, state.users, state.departments).filter(
      (t) => t.status === "done"
    );
    assert.ok(sportsDone.some((t) => t.id === "task-sports-102"), "Must appear in Done by Department log");
    const found = sportsDone.find((t) => t.id === "task-sports-102");
    assert.ok(found?.completedAt, "Should automatically have completedAt timestamp set");
  });

  it("allows editing tasks in the department log via EDIT_TASK", () => {
    let state = buildSeedState();
    const admin = state.users.find((u) => u.role === "admin");
    assert.ok(admin);
    state.session = { userId: admin.id, role: admin.role, expiresAt: Date.now() + 3600000 };

    const task: CouncilTask = {
      id: "task-edit-103",
      title: "Draft Initial Guidelines",
      details: "First draft",
      due: "2026-09-20",
      priority: "Low",
      assigneeId: "",
      status: "done",
      createdBy: "Admin",
      createdAt: Date.now(),
      department: "General",
    };
    state = reducer(state, { type: "ADD_TASK", task });

    // Edit task in the log via EDIT_TASK
    const updatedTitle = "Draft Updated and Finalized Guidelines";
    const updatedDetails = "All revisions approved by faculty adviser";
    const newDept = state.departments.find((d) => d !== "General") || "General";

    state = reducer(state, {
      type: "EDIT_TASK",
      task: {
        id: "task-edit-103",
        title: updatedTitle,
        details: updatedDetails,
        department: newDept,
        priority: "Urgent",
      },
    });

    const edited = state.tasks.find((t) => t.id === "task-edit-103");
    assert.equal(edited?.title, updatedTitle);
    assert.equal(edited?.details, updatedDetails);
    assert.equal(edited?.department, newDept);
    assert.equal(edited?.priority, "Urgent");

    // Verifying it moved to the new department's done log
    const newDeptDone = tasksForDepartment(newDept, state.tasks, state.users, state.departments).filter(
      (t) => t.status === "done"
    );
    assert.ok(newDeptDone.some((t) => t.id === "task-edit-103"));
  });

  it("allows removing tasks from the department log via DELETE_TASK", () => {
    let state = buildSeedState();
    const admin = state.users.find((u) => u.role === "admin");
    assert.ok(admin);
    state.session = { userId: admin.id, role: admin.role, expiresAt: Date.now() + 3600000 };

    const task: CouncilTask = {
      id: "task-delete-104",
      title: "Temporary Milestone to be removed",
      details: "Test details",
      due: "2026-09-21",
      priority: "Low",
      assigneeId: "",
      status: "done",
      createdBy: "Admin",
      createdAt: Date.now(),
      department: "General",
    };
    state = reducer(state, { type: "ADD_TASK", task });
    assert.ok(state.tasks.some((t) => t.id === "task-delete-104"));

    // Remove task via DELETE_TASK
    state = reducer(state, { type: "DELETE_TASK", taskId: "task-delete-104" });

    // Verify it's gone from state.tasks and department log
    assert.ok(!state.tasks.some((t) => t.id === "task-delete-104"));
    const generalDone = tasksForDepartment("General", state.tasks, state.users, state.departments).filter(
      (t) => t.status === "done"
    );
    assert.ok(!generalDone.some((t) => t.id === "task-delete-104"));
  });

  it("reopens a completed task when moved back to in-progress or todo", () => {
    let state = buildSeedState();
    const admin = state.users.find((u) => u.role === "admin");
    assert.ok(admin);
    state.session = { userId: admin.id, role: admin.role, expiresAt: Date.now() + 3600000 };

    const task: CouncilTask = {
      id: "task-reopen-105",
      title: "Completed Task To Reopen",
      details: "Need more edits",
      due: "2026-09-22",
      priority: "Medium",
      assigneeId: "",
      status: "done",
      createdBy: "Admin",
      createdAt: Date.now(),
      department: "General",
    };
    state = reducer(state, { type: "ADD_TASK", task });

    // Reopen task by moving back to progress
    state = reducer(state, { type: "MOVE_TASK", taskId: "task-reopen-105", status: "progress" });
    const reopened = state.tasks.find((t) => t.id === "task-reopen-105");
    assert.equal(reopened?.status, "progress");

    // No longer in completed
    const generalDone = tasksForDepartment("General", state.tasks, state.users, state.departments).filter(
      (t) => t.status === "done"
    );
    assert.ok(!generalDone.some((t) => t.id === "task-reopen-105"));
  });

  it("enforces permission guards on task operations", () => {
    let state = buildSeedState();
    // Student account without clearances
    const student = state.users.find((u) => u.role === "student");
    assert.ok(student);
    state.session = { userId: student.id, role: student.role, expiresAt: Date.now() + 3600000 };

    assert.throws(
      () =>
        reducer(state, {
          type: "ADD_TASK",
          task: {
            id: "unauthorized-task",
            title: "Student Task",
            details: "",
            due: "2026-09-22",
            priority: "Low",
            assigneeId: "",
            status: "todo",
            createdBy: student.name,
            createdAt: Date.now(),
          },
        }),
      /does not have permission/
    );

    // Council officer with "tasks" permission
    const student2 = state.users.find((u) => u.role === "student")!;
    const officer = { ...student2, id: "test-council-officer", role: "council" as const };
    state.users.push(officer);
    state.permissions[officer.id] = ["tasks"];
    state.session = { userId: officer.id, role: officer.role, expiresAt: Date.now() + 3600000 };

    // Should succeed for officer with "tasks" permission
    state = reducer(state, {
      type: "ADD_TASK",
      task: {
        id: "authorized-officer-task",
        title: "Officer Task",
        details: "Authorized",
        due: "2026-09-23",
        priority: "Medium",
        assigneeId: officer.id,
        status: "todo",
        createdBy: officer.name,
        createdAt: Date.now(),
        department: "General",
      },
    });
    assert.ok(state.tasks.some((t) => t.id === "authorized-officer-task"));
  });
});
