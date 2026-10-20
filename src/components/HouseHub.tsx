import { useMemo, useState } from "react";
import {
  Award, Crown, LockKeyhole, Megaphone, MessageSquarePlus, MessagesSquare,
  Pin, Search, Send, Shield, Trash2, Trophy, UserPlus, Users, Wifi,
} from "lucide-react";
import { initials, relativeTime, uid, useHub, formatTemplate, DEFAULT_NOTIFICATION_TEMPLATES } from "../store/hub";
import { HOUSES } from "../lib/seed";
import { houseFullName, houseShortName, houseStandings, rankLabel } from "../lib/admin";
import { belongsToHouse, isExtraHouseMember } from "../lib/accounts";
import type { House, HouseMessage, Audience } from "../lib/types";
import { sendFirebaseNotification } from "../lib/firebase-client";
import { HouseMark } from "./ui";
import { Reveal } from "./Effects";
import HouseMembersDialog from "./HouseMembersDialog";

export default function HouseHub() {
  const { state, user, dispatch, houseTotals, announce } = useHub();
  const admin = user?.role === "admin";
  const accessibleHouses: House[] = useMemo(() => {
    if (!user) return [];
    if (admin) return [...HOUSES];
    return HOUSES.filter((h) => belongsToHouse(user, h, state.houseMemberships));
  }, [user, admin, state.houseMemberships]);

  const [selectedHouse, setSelectedHouse] = useState<House>(
    user?.house ?? accessibleHouses[0] ?? "Blue"
  );
  const [kind, setKind] = useState<"message" | "instruction">("message");
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [feedFilter, setFeedFilter] = useState<"all" | "instruction" | "message">("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [membersOpen, setMembersOpen] = useState(false);

  if (!user) return null;

  const activeHouse: House | null = accessibleHouses.includes(selectedHouse)
    ? selectedHouse
    : (accessibleHouses[0] ?? null);
  const house: House = activeHouse ?? "Blue";

  const standings = houseStandings(houseTotals);
  const rank = standings.find((s) => s.house === house)?.rank ?? 1;
  const points = houseTotals[house] ?? 0;

  const captainId = state.houseCaptains[house];
  const captain = state.users.find((u) => u.id === captainId);
  const isHouseCaptain = Boolean(captainId && captainId === user.id);
  const canPostInstruction =
    admin ||
    isHouseCaptain ||
    ((user.role === "council" || user.role === "teacher") && belongsToHouse(user, house, state.houseMemberships));

  const members = useMemo(
    () =>
      state.users
        .filter((u) => belongsToHouse(u, house, state.houseMemberships))
        .sort((a, b) => {
          const aCap = a.id === captainId ? 0 : 1;
          const bCap = b.id === captainId ? 0 : 1;
          if (aCap !== bCap) return aCap - bCap;
          const aRole = a.role === "admin" ? 0 : a.role === "council" ? 1 : a.role === "teacher" ? 2 : 3;
          const bRole = b.role === "admin" ? 0 : b.role === "council" ? 1 : b.role === "teacher" ? 2 : 3;
          if (aRole !== bRole) return aRole - bRole;
          return a.name.localeCompare(b.name);
        }),
    [state.users, house, state.houseMemberships, captainId]
  );

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      `${m.name} ${m.email} ${m.gradeLabel ?? ""} ${m.councilTitle ?? ""} ${m.role}`.toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  const houseMessages = useMemo(() => {
    return (state.houseMessages || [])
      .filter((m) => m.house === house)
      .filter((m) => (feedFilter === "all" ? true : m.kind === feedFilter))
      .sort((a, b) => {
        if (a.kind === "instruction" && b.kind !== "instruction" && feedFilter === "all") return -1;
        if (b.kind === "instruction" && a.kind !== "instruction" && feedFilter === "all") return 1;
        return b.timestamp - a.timestamp;
      });
  }, [state.houseMessages, house, feedFilter]);

  const recentPoints = useMemo(
    () => state.pointsLedger.filter((p) => p.house === house).slice(0, 4),
    [state.pointsLedger, house]
  );

  if (!activeHouse) {
    return (
      <Reveal>
        <div className="empty-content">
          <LockKeyhole />
          <strong>No house assigned</strong>
          <p>
            {user.name} does not belong to a school house yet. Ask an administrator to assign this account to Blue,
            Red, or Green House in Admin Panel / House Hub.
          </p>
        </div>
      </Reveal>
    );
  }

  const send = () => {
    const bodyText = draft.trim();
    if (!bodyText) {
      announce("Write a message before posting.", "error");
      return;
    }
    const effectiveKind = canPostInstruction ? kind : "message";
    const resolvedTitle =
      effectiveKind === "instruction"
        ? title.trim() || `${houseShortName(state.houses, house)} House Official Instruction`
        : title.trim() || (bodyText.length > 56 ? `${bodyText.slice(0, 56)}…` : bodyText);

    const authorRoleLabel = isHouseCaptain
      ? `${houseShortName(state.houses, house)} House Captain`
      : user.councilTitle
      ? `${user.councilTitle}${user.department ? ` · ${user.department}` : ""}`
      : user.role === "admin"
      ? "Council Administrator"
      : user.role === "teacher"
      ? "House Teacher / Advisor"
      : `Grade ${user.grade ?? "—"} Member`;

    const msg: HouseMessage = {
      id: uid(),
      house,
      title: resolvedTitle,
      body: bodyText,
      kind: effectiveKind,
      authorId: user.id,
      authorName: user.name,
      authorRole: authorRoleLabel,
      timestamp: Date.now(),
    };

    try {
      dispatch({ type: "POST_HOUSE_MESSAGE", message: msg });

      // Notify members of this house
      const tmpl = state.notificationTemplates?.house_message || DEFAULT_NOTIFICATION_TEMPLATES.house_message;
      const houseName = houseFullName(state.houses, house);
      const notifTitle =
        effectiveKind === "instruction"
          ? `📌 ${houseName}: ${resolvedTitle}`
          : formatTemplate(tmpl.title, { house: houseName, author: user.name, message: bodyText });
      const notifBody = formatTemplate(tmpl.body, { house: houseName, author: user.name, message: bodyText });
      const houseAudience: Audience = { kind: "house", house };

      dispatch({
        type: "PUSH_NOTIFICATION",
        notification: {
          id: uid(),
          title: notifTitle,
          body: notifBody,
          timestamp: Date.now(),
          urgent: effectiveKind === "instruction",
          senderName: user.name,
          senderRole: user.role,
          audience: houseAudience,
          actionTab: "house-hub",
          readBy: [user.id],
          kind: "system",
        },
      });

      void sendFirebaseNotification({
        title: notifTitle,
        body: notifBody,
        urgent: effectiveKind === "instruction",
        audience: houseAudience,
        actionTab: "house-hub",
        senderName: user.name,
      }).catch(() => undefined);

      setTitle("");
      setDraft("");
      announce(
        effectiveKind === "instruction"
          ? `Official instruction posted to ${houseName} and members notified.`
          : `Message posted to ${houseName} Hub.`
      );
    } catch (e) {
      announce(e instanceof Error ? e.message : "Unable to post message.", "error");
    }
  };

  const removeMessage = (messageId: string) => {
    try {
      dispatch({ type: "DELETE_HOUSE_MESSAGE", messageId });
      announce("House post removed.");
    } catch (e) {
      announce(e instanceof Error ? e.message : "Unable to remove post.", "error");
    }
  };

  const handleAssignCaptain = (userId: string) => {
    try {
      dispatch({ type: "SET_HOUSE_CAPTAIN", house, userId });
      const chosen = state.users.find((u) => u.id === userId);
      announce(
        chosen
          ? `${chosen.name} appointed as ${houseFullName(state.houses, house)} Captain.`
          : `${houseFullName(state.houses, house)} Captain cleared.`
      );
    } catch (e) {
      announce(e instanceof Error ? e.message : "Unable to update house captain.", "error");
    }
  };

  const primaryHouseCandidates = state.users.filter((u) => u.house === house && u.role !== "grade");

  return (
    <div>
      {accessibleHouses.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="pill-tabs">
            {accessibleHouses.map((h) => (
              <button
                key={h}
                className={house === h ? "active" : ""}
                onClick={() => setSelectedHouse(h)}
              >
                <HouseMark house={h} className="h-4 w-4 text-[8px]" />
                {houseFullName(state.houses, h)}
              </button>
            ))}
          </div>
          {admin && (
            <button className="btn btn-primary" onClick={() => setMembersOpen(true)}>
              <UserPlus /> Manage {houseShortName(state.houses, house)} Hub Members
            </button>
          )}
        </div>
      )}

      <Reveal>
        <section className={`house-banner ${house.toLowerCase()}`}>
          <div className="flex items-center gap-4">
            <HouseMark house={house} className="h-16 w-16 text-xl shadow-lg" />
            <div>
              <span className="eyebrow">
                {rankLabel(rank)} · {members.length} {members.length === 1 ? "Member" : "Members"}
              </span>
              <h1 className="mt-1 font-display text-3xl font-bold">{houseFullName(state.houses, house)} Hub</h1>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {captain
                  ? `House Captain: ${captain.name} (${captain.gradeLabel ?? "Council"})`
                  : "Official house instructions, team coordination, and house member chat."}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="house-points-box">
              <strong>{points.toLocaleString()}</strong>
              <span>Total Points</span>
            </div>
            {admin && accessibleHouses.length <= 1 && (
              <button className="btn btn-secondary !min-h-8 !text-xs" onClick={() => setMembersOpen(true)}>
                <UserPlus /> Manage Members
              </button>
            )}
          </div>
        </section>
      </Reveal>

      <div className="house-columns">
        <Reveal delay={80}>
          <section className="panel panel-pad">
            <div className="panel-heading">
              <div>
                <h2>
                  <MessagesSquare /> {houseShortName(state.houses, house)} House Feed &amp; Chat
                </h2>
                <p>
                  Official instructions from house leadership are pinned at the top. All {houseFullName(state.houses, house)} members can participate.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-500">
                <Wifi className="h-3 w-3" /> Synced with MongoDB
              </span>
            </div>

            {/* Composer */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-inset)] p-4">
              {canPostInstruction && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="compact-tabs">
                    <button
                      type="button"
                      className={kind === "message" ? "active" : ""}
                      onClick={() => setKind("message")}
                    >
                      <MessagesSquare className="h-3.5 w-3.5" /> House Chat Message
                    </button>
                    <button
                      type="button"
                      className={kind === "instruction" ? "active" : ""}
                      onClick={() => setKind("instruction")}
                    >
                      <Megaphone className="h-3.5 w-3.5" /> Official House Instruction
                    </button>
                  </div>
                  <span className="text-[10px] text-[var(--faint)]">
                    {kind === "instruction" ? "Pinned for all house members" : "Standard house discussion post"}
                  </span>
                </div>
              )}

              {(kind === "instruction" || title.trim().length > 0) && (
                <input
                  className="control mb-2.5"
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`Headline for ${houseShortName(state.houses, house)} House instruction (e.g., Friday Relay Practice)...`}
                />
              )}

              <textarea
                rows={3}
                maxLength={800}
                className="control resize-y"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={
                  kind === "instruction"
                    ? `Write an official instruction or rally briefing for ${houseFullName(state.houses, house)}...`
                    : `Share an update, cheer, or question with ${houseFullName(state.houses, house)}...`
                }
              />

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] text-[var(--faint)]">
                  {draft.length}/800 · Posting as <strong>{user.name}</strong> · Ctrl/⌘ + Enter to send
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!draft.trim()}
                  onClick={send}
                >
                  <Send /> {kind === "instruction" && canPostInstruction ? "Publish Instruction" : "Post to House Hub"}
                </button>
              </div>
            </div>

            {/* Feed Filter Tabs */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
              <div className="compact-tabs">
                <button
                  type="button"
                  className={feedFilter === "all" ? "active" : ""}
                  onClick={() => setFeedFilter("all")}
                >
                  All Posts ({(state.houseMessages || []).filter((m) => m.house === house).length})
                </button>
                <button
                  type="button"
                  className={feedFilter === "instruction" ? "active" : ""}
                  onClick={() => setFeedFilter("instruction")}
                >
                  <Pin className="h-3 w-3" /> Instructions (
                  {(state.houseMessages || []).filter((m) => m.house === house && m.kind === "instruction").length})
                </button>
                <button
                  type="button"
                  className={feedFilter === "message" ? "active" : ""}
                  onClick={() => setFeedFilter("message")}
                >
                  House Chat (
                  {(state.houseMessages || []).filter((m) => m.house === house && m.kind === "message").length})
                </button>
              </div>
              <span className="small-note">{houseMessages.length} shown</span>
            </div>

            {/* Messages List */}
            <div className="mt-4 space-y-3">
              {!houseMessages.length && (
                <div className="empty-content">
                  <MessageSquarePlus />
                  <strong>No posts in this view yet</strong>
                  <p>Start the {houseFullName(state.houses, house)} conversation above.</p>
                </div>
              )}

              {houseMessages.map((m) => {
                const author = state.users.find((u) => u.id === m.authorId);
                const isInstruction = m.kind === "instruction";
                const canDelete = admin || m.authorId === user.id;

                return (
                  <article
                    key={m.id}
                    className={`rounded-2xl border p-4 transition-all ${
                      isInstruction
                        ? "border-amber-500/35 bg-amber-500/[0.06]"
                        : "border-[var(--border)] bg-[var(--surface-inset)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="mini-avatar !h-9 !w-9 !rounded-full !text-[10px]">
                          {author?.avatarUrl ? (
                            <img src={author.avatarUrl} alt={m.authorName} />
                          ) : (
                            initials(m.authorName)
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <strong className="text-xs font-bold">{m.authorName}</strong>
                            {isInstruction && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
                                <Pin className="h-2.5 w-2.5" /> Official Instruction
                              </span>
                            )}
                            {m.authorId === captainId && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[9px] font-bold uppercase text-indigo-300">
                                <Crown className="h-2.5 w-2.5" /> Captain
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[var(--faint)]">
                            {m.authorRole} · {relativeTime(m.timestamp)}
                          </p>
                        </div>
                      </div>

                      {canDelete && (
                        <button
                          type="button"
                          className="icon-action red"
                          aria-label="Delete message"
                          title="Delete message"
                          onClick={() => removeMessage(m.id)}
                        >
                          <Trash2 />
                        </button>
                      )}
                    </div>

                    {isInstruction && m.title && (
                      <h4 className="mt-3 font-display text-sm font-bold text-slate-900 dark:text-white">
                        {m.title}
                      </h4>
                    )}
                    <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                      {m.body}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        </Reveal>

        {/* Sidebar: Leadership, Recent Points, and House Roster */}
        <Reveal delay={140}>
          <div className="space-y-5">
            {/* House Captain & Leadership Card */}
            <aside className="panel panel-pad">
              <div className="panel-heading">
                <h3>
                  <Crown className="!text-amber-400" /> House Leadership
                </h3>
                <span className="small-note">{houseShortName(state.houses, house)}</span>
              </div>

              {captain ? (
                <div className="integration-row !py-3">
                  <span className="member-inline">
                    <span className="mini-avatar !h-10 !w-10 !rounded-full !text-xs">
                      {captain.avatarUrl ? (
                        <img src={captain.avatarUrl} alt={captain.name} />
                      ) : (
                        initials(captain.name)
                      )}
                    </span>
                    <span>
                      <strong className="text-xs">{captain.name}</strong>
                      <small>
                        {houseShortName(state.houses, house)} House Captain · {captain.gradeLabel ?? "Council"}
                        {captain.councilTitle ? ` · ${captain.councilTitle}` : ""}
                      </small>
                    </span>
                  </span>
                  <span className="clearance !text-[9px]">
                    <Award className="h-3 w-3" /> Captain
                  </span>
                </div>
              ) : (
                <p className="small-note">No house captain has been appointed yet.</p>
              )}

              {admin && (
                <label className="form-field mt-3">
                  <span>Appoint or change {houseShortName(state.houses, house)} House Captain</span>
                  <select
                    className="control !text-xs"
                    value={captainId ?? ""}
                    onChange={(e) => handleAssignCaptain(e.target.value)}
                  >
                    <option value="">— Select student from {houseFullName(state.houses, house)} —</option>
                    {primaryHouseCandidates.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.gradeLabel ?? "Staff"}{s.councilTitle ? ` · ${s.councilTitle}` : ""})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {recentPoints.length > 0 && (
                <div className="mt-4 border-t border-[var(--border)] pt-3">
                  <p className="eyebrow mb-2 flex items-center gap-1.5">
                    <Trophy className="h-3.5 w-3.5 text-amber-400" /> Recent {houseShortName(state.houses, house)} Point Awards
                  </p>
                  <div className="space-y-1.5">
                    {recentPoints.map((pt) => (
                      <div key={pt.id} className="integration-row !py-2 text-xs">
                        <span>
                          <strong className="!text-[11px]">{pt.reason}</strong>
                          <small>{pt.category} · {pt.position ?? "Award"}</small>
                        </span>
                        <span className="font-display text-xs font-extrabold text-emerald-500">
                          +{pt.delta} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            {/* House Roster Card */}
            <aside className="panel panel-pad">
              <div className="panel-heading">
                <h3>
                  <Users /> House Members
                </h3>
                <span className="small-note">{members.length}</span>
              </div>

              <div className="search-control mb-3">
                <Search />
                <input
                  className="control !text-xs"
                  placeholder={`Search ${houseShortName(state.houses, house)} members...`}
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>

              <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {filteredMembers.map((m) => (
                  <div key={m.id} className="integration-row !py-2.5">
                    <span className="member-inline">
                      <span className="mini-avatar !h-8 !w-8 !rounded-full !text-[9px]">
                        {m.avatarUrl ? <img src={m.avatarUrl} alt={m.name} /> : initials(m.name)}
                      </span>
                      <span>
                        <strong className="!text-[10px]">{m.name}</strong>
                        <small>
                          {m.role === "teacher" ? "Teacher" : `Grade ${m.grade}`}
                          {m.councilTitle ? ` · ${m.councilTitle}` : ""}
                          {isExtraHouseMember(m, house, state.houseMemberships) ? " · Added member" : ""}
                        </small>
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {m.id === captainId && (
                        <span className="clearance !text-[8px]">
                          <Crown className="h-3 w-3 text-amber-400" /> Captain
                        </span>
                      )}
                      {m.id !== captainId && (m.role === "council" || m.role === "admin") && (
                        <span className="clearance !text-[8px]">
                          <Shield className="h-3 w-3" /> {m.role}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {admin && (
                <button className="btn btn-secondary mt-4 w-full" onClick={() => setMembersOpen(true)}>
                  <UserPlus /> Add or remove house hub members
                </button>
              )}
            </aside>
          </div>
        </Reveal>
      </div>

      {membersOpen && <HouseMembersDialog house={house} onClose={() => setMembersOpen(false)} />}
    </div>
  );
}
