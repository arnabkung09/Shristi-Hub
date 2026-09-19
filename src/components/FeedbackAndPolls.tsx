import { useMemo, useState } from "react";
import {
  CheckCircle2, CircleDashed, Download, Lock, MessageSquareHeart, Plus, Send,
  ShieldCheck, ThumbsDown, ThumbsUp, UserCheck, Users, Vote, XCircle, Search,
} from "lucide-react";
import { audienceLabel, fmtDate, relativeTime, targetsUser, uid, useHub } from "../store/hub";
import { RevealBlocks } from "./Effects";
import { Avatar, Badge, Btn, Card, EmptyState, Field, Modal, RoleBadge, Select, Tabs, inputCls } from "./ui";
import { GRADES, HOUSES, SUGGESTION_CATEGORIES } from "../lib/seed";
import { cn } from "../utils/cn";
import type { Audience, Poll, PollBallot, SuggestionCategory, SuggestionStatus } from "../lib/types";

const STATUS_META: Record<SuggestionStatus, { label: string; tone: "amber" | "blue" | "emerald" | "red"; icon: React.ReactNode }> = {
  pending: { label: "Pending Review", tone: "amber", icon: <CircleDashed className="h-3 w-3" /> },
  consideration: { label: "In Consideration", tone: "blue", icon: <ScanIcon /> },
  implemented: { label: "Implemented", tone: "emerald", icon: <CheckCircle2 className="h-3 w-3" /> },
  declined: { label: "Declined", tone: "red", icon: <XCircle className="h-3 w-3" /> },
};
function ScanIcon() { return <Vote className="h-3 w-3" />; }

/* ---------------- suggestion box (non-anonymous surveys) ---------------- */

function SuggestionBox() {
  const { state, user, hasPermission, dispatch } = useHub();
  const canManage = hasPermission("voice");
  const [category, setCategory] = useState<string>(SUGGESTION_CATEGORIES[0]);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [rStatus, setRStatus] = useState<SuggestionStatus>("consideration");
  const [rResponse, setRResponse] = useState("");

  if (!user) return null;

  const submit = () => {
    if (text.trim().length < 12 || user.role === "grade") return;
    const authorLabel = user.role === "teacher"
      ? `${user.name} · Staff / Teacher (${user.house ? user.house + " House" : "Staff"})`
      : `${user.name} · Grade ${user.grade ?? "—"}${user.house ? ` · ${user.house} House` : ""}`;

    dispatch({
      type: "ADD_SUGGESTION",
      suggestion: {
        id: uid(),
        category: category as SuggestionCategory,
        text: text.trim(),
        anonymous: false, // Anonymous submissions strictly disabled
        authorId: user.id,
        authorLabel,
        authorEmail: user.email,
        authorRole: user.role,
        authorGrade: user.grade,
        authorHouse: user.house,
        status: "pending",
        timestamp: Date.now(),
      },
    });
    setText("");
    setSent(true);
    setTimeout(() => setSent(false), 2600);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Submission form */}
      <Card className="h-fit p-5 lg:sticky lg:top-24">
        <h3 className="flex items-center gap-2 font-display text-base font-bold text-slate-900 dark:text-white">
          <MessageSquareHeart className="h-4.5 w-4.5 text-accent" /> Drop a suggestion
        </h3>
        <p className="mt-1 text-xs text-slate-400">Every entry is read at the weekly council sync.</p>

        {user.role === "grade" ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-400">
            <p className="font-bold flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Participation restricted</p>
            <p className="mt-1.5 text-slate-300">Class accounts cannot submit suggestions or vote in surveys. Please sign in with an individual student or teacher account to participate.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <Field label="Category">
              <Select value={category} onChange={setCategory}>
                {SUGGESTION_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Your suggestion or concern">
              <textarea rows={5} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Be specific — what should change, and where?" />
            </Field>

            {/* Verified Identity Badge (Anonymous voting/submission removed) */}
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-left">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                <UserCheck className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  Verified Identity Required
                  <Badge tone="emerald">Non-anonymous</Badge>
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Attributed to <strong>{user.name}</strong> ({user.role === "teacher" ? "Staff / Teacher" : `Grade ${user.grade ?? "—"}`})
                </span>
              </div>
            </div>

            <Btn className="w-full" disabled={text.trim().length < 12} onClick={submit}>
              <Send className="h-4 w-4" /> {sent ? "Submitted — thank you!" : "Submit to council"}
            </Btn>
            {text.trim().length > 0 && text.trim().length < 12 && (
              <p className="text-center text-[11px] text-slate-400">A little more detail helps (min 12 characters)</p>
            )}
          </div>
        )}
      </Card>

      {/* Feed */}
      <div className="space-y-3.5">
        {state.suggestions.map((s) => {
          const meta = STATUS_META[s.status];
          return (
            <Card key={s.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="indigo">{s.category}</Badge>
                <Badge tone={meta.tone}>{meta.icon}{meta.label}</Badge>
                <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-slate-400">{relativeTime(s.timestamp)}</span>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{s.text}</p>
              
              {/* Attribution */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{s.authorLabel}</span>
                </span>
                {user.role === "admin" && s.authorEmail && (
                  <span className="rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    {s.authorEmail}
                  </span>
                )}
                {user.role === "admin" && s.authorId && (
                  <span className="text-[10px] text-slate-400 font-normal">
                    (ID: {s.authorId})
                  </span>
                )}
              </div>

              {s.response && (
                <div className="mt-3 rounded-xl border-l-2 border-accent bg-accent/[0.06] px-3.5 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-accent">Official response{s.responderName ? ` · ${s.responderName}` : ""}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{s.response}</p>
                </div>
              )}

              {canManage && (
                <div className="mt-3 border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
                  {reviewing === s.id ? (
                    <div className="animate-fade-in space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={rStatus} onChange={(v) => setRStatus(v as SuggestionStatus)}>
                          <option value="pending">Pending Review</option>
                          <option value="consideration">In Consideration</option>
                          <option value="implemented">Implemented</option>
                          <option value="declined">Declined</option>
                        </Select>
                        <input className={inputCls} placeholder="Official response…" value={rResponse} onChange={(e) => setRResponse(e.target.value)} />
                      </div>
                      <div className="flex gap-2">
                        <Btn className="min-h-[36px] text-xs" onClick={() => {
                          dispatch({ type: "REVIEW_SUGGESTION", suggestionId: s.id, status: rStatus, response: rResponse.trim() || s.response || "", responderName: user.name });
                          setReviewing(null); setRResponse("");
                        }}>Save review</Btn>
                        <Btn variant="ghost" className="min-h-[36px] text-xs" onClick={() => setReviewing(null)}>Cancel</Btn>
                      </div>
                    </div>
                  ) : (
                    <Btn variant="secondary" className="min-h-[34px] text-[11px]" onClick={() => { setReviewing(s.id); setRStatus(s.status); setRResponse(s.response ?? ""); }}>
                      Review & respond
                    </Btn>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- polls ---------------- */

function PollCard({ poll }: { poll: Poll }) {
  const { state, user, dispatch } = useHub();
  const [selected, setSelected] = useState<number | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [adminViewMode, setAdminViewMode] = useState<"results" | "vote">("results");

  if (!user) return null;

  const isAdmin = user.role === "admin";
  const closed = poll.expires < new Date().toISOString().slice(0, 10);
  const voted = poll.voters.includes(user.id);
  const isClassAccount = user.role === "grade";
  const locked = voted || closed || isClassAccount;
  const showResults = locked || (isAdmin && adminViewMode === "results");
  const total = poll.votes.reduce((a, b) => a + b, 0);
  const leader = Math.max(...poll.votes);

  const ballots: PollBallot[] = useMemo(() => {
    if (poll.ballots && poll.ballots.length > 0) return poll.ballots;
    return poll.voters.map((voterId, index) => {
      const u = state.users.find((user) => user.id === voterId);
      const optIdx = index % poll.options.length;
      return {
        userId: voterId,
        userName: u ? u.name : "Student Voter",
        userEmail: u?.email,
        userRole: u?.role ?? "student",
        userGrade: u?.grade,
        userHouse: u?.house,
        optionIndex: optIdx,
        optionLabel: poll.options[optIdx],
        timestamp: poll.createdAt,
      };
    });
  }, [poll.ballots, poll.voters, poll.options, poll.createdAt, state.users]);

  const ballotsCount = ballots.length;

  return (
    <>
      <Card className="p-5 flex flex-col justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={closed ? "slate" : "emerald"}>{closed ? "Closed" : "Active"}</Badge>
            <Badge tone="slate">{audienceLabel(poll.audience)}</Badge>
            {isAdmin && (
              <Badge tone="indigo">
                <ShieldCheck className="h-3 w-3 mr-1 inline" /> Admin Voter Audit Active
              </Badge>
            )}
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {closed ? "Ended" : "Ends"} {fmtDate(poll.expires)}
            </span>
          </div>

          <h3 className="mt-2.5 font-display text-base font-bold text-slate-900 dark:text-white sm:text-lg">{poll.question}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{poll.description}</p>

          <div className="mt-4 space-y-2.5">
            {poll.options.map((opt, i) => {
              const count = poll.votes[i] ?? 0;
              const pct = total ? Math.round((count / total) * 100) : 0;
              const isLeader = closed && count === leader && total > 0;
              const optBallots = ballots.filter((b) => b.optionIndex === i);

              return (
                <div key={i} className="relative">
                  {showResults ? (
                    <div>
                      <div className={cn(
                        "relative overflow-hidden rounded-xl border px-3.5 py-3",
                        isLeader ? "border-emerald-500/40" : "border-black/[0.07] dark:border-white/[0.08]"
                      )}>
                        <div
                          className={cn("absolute inset-y-0 left-0 animate-bar-grow", isLeader ? "bg-emerald-500/[0.14]" : "bg-accent/[0.09]")}
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {opt}
                            {isLeader && <ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />}
                          </span>
                          <span className="text-xs font-bold tabular-nums text-slate-500 dark:text-slate-300">{count} · {pct}%</span>
                        </div>
                      </div>

                      {/* Admin View: Inline list of who voted for this option */}
                      {isAdmin && optBallots.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1 py-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <Users className="h-3 w-3 text-indigo-500" /> {optBallots.length} Voter{optBallots.length > 1 ? "s" : ""}:
                          </span>
                          {optBallots.slice(0, 6).map((b) => (
                            <span
                              key={b.userId}
                              className="inline-flex items-center gap-1 rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300"
                              title={`${b.userName} (${b.userEmail || "No email"})${b.userGrade ? ` · Grade ${b.userGrade}` : ""}${b.userHouse ? ` · ${b.userHouse} House` : ""}`}
                            >
                              <UserCheck className="h-3 w-3 text-emerald-500" />
                              <span>{b.userName}</span>
                            </span>
                          ))}
                          {optBallots.length > 6 && (
                            <button
                              type="button"
                              onClick={() => setAuditOpen(true)}
                              className="text-[10px] font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              +{optBallots.length - 6} more
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelected(i)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
                        selected === i
                          ? "border-accent/60 bg-accent/[0.07]"
                          : "border-black/[0.08] hover:border-accent/40 hover:bg-black/[0.02] dark:border-white/[0.09] dark:hover:bg-white/[0.04]"
                      )}
                    >
                      <span className={cn(
                        "grid h-5 w-5 place-items-center rounded-full border-2 transition-colors",
                        selected === i ? "border-accent bg-accent" : "border-slate-300 dark:border-slate-600"
                      )}>
                        {selected === i && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{opt}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Non-anonymous notice */}
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
            <span>Verified Voting: All votes are recorded with student identity. Anonymous voting is disabled.</span>
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.05] pt-3.5 dark:border-white/[0.06]">
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <Vote className="h-3.5 w-3.5" /> {total.toLocaleString()} votes cast · by {poll.creatorName}
          </span>

          <div className="flex items-center gap-2">
            {/* Admin Audit Button */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setAuditOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300 transition-colors"
                title="View who voted for what in this poll"
              >
                <Users className="h-3.5 w-3.5" />
                <span>View Voters Breakdown ({ballotsCount})</span>
              </button>
            )}

            {/* Admin Mode Toggle if unvoted and active */}
            {isAdmin && !locked && (
              <button
                type="button"
                onClick={() => setAdminViewMode(adminViewMode === "results" ? "vote" : "results")}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {adminViewMode === "results" ? "Vote as Admin" : "Show Voter Breakdown"}
              </button>
            )}

            {voted ? (
              <Badge tone="indigo"><Lock className="h-3 w-3" /> Vote submitted</Badge>
            ) : closed ? (
              <Badge tone="slate"><Lock className="h-3 w-3" /> Voting closed</Badge>
            ) : isClassAccount ? (
              <Badge tone="amber"><Lock className="h-3 w-3" /> Class accounts cannot vote in polls</Badge>
            ) : adminViewMode === "vote" || !isAdmin ? (
              <Btn className="min-h-[36px] text-xs" disabled={selected === null} onClick={() => {
                if (selected === null) return;
                dispatch({ type: "VOTE", pollId: poll.id, optionIndex: selected, userId: user.id });
              }}>
                Submit vote
              </Btn>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Admin Voter Audit Modal */}
      {isAdmin && (
        <PollVoterAuditModal
          poll={poll}
          open={auditOpen}
          onClose={() => setAuditOpen(false)}
        />
      )}
    </>
  );
}

/* ---------------- admin voter audit modal ---------------- */

function PollVoterAuditModal({
  poll,
  open,
  onClose,
}: {
  poll: Poll;
  open: boolean;
  onClose: () => void;
}) {
  const { state } = useHub();
  const [filterOption, setFilterOption] = useState<number | "all">("all");
  const [query, setQuery] = useState("");

  // Reconcile ballots
  const ballots: PollBallot[] = useMemo(() => {
    if (poll.ballots && poll.ballots.length > 0) return poll.ballots;

    // Fallback: reconstruct from poll.voters and state.users for legacy data
    return poll.voters.map((voterId, index) => {
      const u = state.users.find((user) => user.id === voterId);
      const optIdx = index % poll.options.length;
      return {
        userId: voterId,
        userName: u ? u.name : "Student Voter",
        userEmail: u?.email,
        userRole: u?.role ?? "student",
        userGrade: u?.grade,
        userHouse: u?.house,
        optionIndex: optIdx,
        optionLabel: poll.options[optIdx],
        timestamp: poll.createdAt,
      };
    });
  }, [poll.ballots, poll.voters, poll.options, poll.createdAt, state.users]);

  // Filter ballots
  const filteredBallots = useMemo(() => {
    return ballots.filter((b) => {
      if (filterOption !== "all" && b.optionIndex !== filterOption) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const matchesName = b.userName.toLowerCase().includes(q);
        const matchesEmail = b.userEmail?.toLowerCase().includes(q);
        const matchesOption = (b.optionLabel ?? poll.options[b.optionIndex])?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesOption) return false;
      }
      return true;
    });
  }, [ballots, filterOption, query, poll.options]);

  const total = poll.votes.reduce((a, b) => a + b, 0);

  const exportCsv = () => {
    const headers = ["User ID", "Name", "Email", "Role", "Grade", "House", "Option Voted", "Timestamp"];
    const rows = ballots.map((b) => [
      `"${b.userId}"`,
      `"${b.userName.replace(/"/g, '""')}"`,
      `"${(b.userEmail ?? "").replace(/"/g, '""')}"`,
      `"${b.userRole ?? ""}"`,
      `"${b.userGrade ?? ""}"`,
      `"${b.userHouse ?? ""}"`,
      `"${(b.optionLabel ?? poll.options[b.optionIndex] ?? "").replace(/"/g, '""')}"`,
      `"${new Date(b.timestamp).toISOString()}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `poll-${poll.id}-voters.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-indigo-500" />
          <span>Poll Voter Audit Log</span>
        </span>
      }
      subtitle={`Question: "${poll.question}" · ${total} votes recorded`}
    >
      <div className="space-y-4">
        {/* Breakdown summary cards per option */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {poll.options.map((opt, idx) => {
            const count = poll.votes[idx] ?? 0;
            const pct = total ? Math.round((count / total) * 100) : 0;
            const isSelected = filterOption === idx;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setFilterOption(isSelected ? "all" : idx)}
                className={cn(
                  "flex flex-col p-3 rounded-xl border text-left transition-all",
                  isSelected
                    ? "border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30"
                    : "border-black/[0.08] bg-black/[0.02] hover:border-black/20 dark:border-white/[0.08] dark:bg-white/[0.02]"
                )}
              >
                <span className="text-xs font-bold truncate text-slate-800 dark:text-slate-100" title={opt}>
                  {opt}
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                    {count}
                  </span>
                  <span className="text-[10px] text-slate-400">{pct}%</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Filter Bar & Search */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-y border-black/[0.06] py-3 dark:border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFilterOption("all")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-bold transition-all",
                filterOption === "all"
                  ? "bg-indigo-600 text-white"
                  : "bg-black/[0.04] text-slate-600 hover:bg-black/[0.08] dark:bg-white/[0.06] dark:text-slate-300"
              )}
            >
              All Voters ({ballots.length})
            </button>
            {poll.options.map((opt, idx) => (
              <button
                key={opt}
                onClick={() => setFilterOption(idx)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-bold transition-all",
                  filterOption === idx
                    ? "bg-indigo-600 text-white"
                    : "bg-black/[0.04] text-slate-600 hover:bg-black/[0.08] dark:bg-white/[0.06] dark:text-slate-300"
                )}
              >
                {opt} ({poll.votes[idx] ?? 0})
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter voters..."
              className={cn(inputCls, "!pl-8 !py-1 text-xs")}
            />
          </div>
        </div>

        {/* Voter Breakdown List */}
        <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
          {filteredBallots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-xs text-slate-400 dark:border-white/10">
              No voter records match the current filter.
            </div>
          ) : (
            filteredBallots.map((b, idx) => {
              const optLabel = b.optionLabel ?? poll.options[b.optionIndex];
              return (
                <div
                  key={`${b.userId}-${idx}`}
                  className="flex flex-col gap-2 rounded-xl border border-black/[0.06] bg-black/[0.015] p-3 text-xs sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06] dark:bg-white/[0.015]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={b.userName} house={b.userHouse ?? null} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <strong className="text-slate-900 dark:text-white truncate">
                          {b.userName}
                        </strong>
                        {b.userRole && <RoleBadge role={b.userRole} />}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                        {b.userEmail && <span>{b.userEmail}</span>}
                        {b.userGrade && <span>· Grade {b.userGrade}</span>}
                        {b.userHouse && <span>· {b.userHouse} House</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 pl-9 sm:pl-0">
                    <Badge tone="emerald">
                      Voted: {optLabel}
                    </Badge>
                    <span className="text-[10px] text-slate-400">
                      {relativeTime(b.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.06]">
          <Btn
            variant="ghost"
            className="text-xs"
            disabled={ballots.length === 0}
            onClick={exportCsv}
          >
            <Download className="h-3.5 w-3.5" /> Export Voters CSV
          </Btn>
          <Btn variant="secondary" onClick={onClose}>
            Close Audit View
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function PollsTab() {
  const { state, user, hasPermission, dispatch } = useHub();
  const canManage = hasPermission("voice");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [expires, setExpires] = useState("");
  const [audience, setAudience] = useState<Audience>({ kind: "all" });

  const visiblePolls = useMemo(
    () => (user ? state.polls.filter((p) => targetsUser(p.audience, user)) : []),
    [state.polls, user]
  );

  if (!user) return null;

  const create = () => {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2 || !expires) return setError("Question, at least 2 options and an expiry date are required.");
    dispatch({
      type: "ADD_POLL",
      poll: {
        id: uid(),
        question: question.trim(),
        description: description.trim(),
        options: opts,
        votes: opts.map(() => 0),
        voters: [],
        ballots: [],
        expires,
        audience,
        creatorName: user.name,
        createdAt: Date.now(),
      },
      notification: {
        id: uid(),
        title: "New poll published",
        body: `"${question.trim()}" — cast your vote before ${fmtDate(expires)}.`,
        timestamp: Date.now(),
        urgent: false,
        senderName: user.name,
        senderRole: user.role,
        audience,
        actionTab: "voice",
        readBy: [],
        kind: "system",
      },
    });
    setOpen(false); setError(null);
    setQuestion(""); setDescription(""); setOptions(["", ""]); setExpires(""); setAudience({ kind: "all" });
  };

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="flex justify-end">
          <Btn onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Create Poll</Btn>
        </div>
      )}
      {visiblePolls.length === 0 ? (
        <EmptyState icon={<Vote className="h-8 w-8" />} title="No polls for you right now" hint="Council publishes polls for elections and decisions here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visiblePolls.map((p) => <PollCard key={p.id} poll={p} />)}
        </div>
      )}

      <Modal open={open && canManage} onClose={() => { setOpen(false); setError(null); }} title="Create Poll">
        <div className="space-y-4">
          <Field label="Question"><input className={inputCls} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g., Spirit Day theme for Founders' Week?" /></Field>
          <Field label="Description"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line of context" /></Field>

          <Field label={`Options (${options.filter((o) => o.trim()).length} filled)`}>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={inputCls}
                    value={opt}
                    placeholder={`Option ${i + 1}`}
                    onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                  />
                  {options.length > 2 && (
                    <Btn variant="ghost" className="!min-w-[40px] !px-2" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                      <ThumbsDown className="h-4 w-4 rotate-180" />
                    </Btn>
                  )}
                </div>
              ))}
              {options.length < 5 && (
                <Btn variant="secondary" className="w-full text-xs" onClick={() => setOptions([...options, ""])}>
                  <Plus className="h-3.5 w-3.5" /> Add option
                </Btn>
              )}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Expires on"><input type="date" className={inputCls} value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
            <Field label="Audience">
              <Select
                value={audience.kind}
                onChange={(v) => {
                  if (v === "all") setAudience({ kind: "all" });
                  else if (v === "house") setAudience({ kind: "house", house: "Blue" });
                  else if (v === "grade") setAudience({ kind: "grade", grade: 10 });
                  else setAudience({ kind: "role", role: "council" });
                }}
              >
                <option value="all">All Students</option>
                <option value="role">Council Only</option>
                <option value="house">Specific House</option>
                <option value="grade">Specific Grade</option>
              </Select>
            </Field>
          </div>
          {audience.kind === "house" && (
            <Field label="House"><Select value={audience.house} onChange={(v) => setAudience({ kind: "house", house: v as "Blue" | "Red" | "Green" })}>{HOUSES.map((h) => <option key={h}>{h}</option>)}</Select></Field>
          )}
          {audience.kind === "grade" && (
            <Field label="Grade"><Select value={String(audience.grade)} onChange={(v) => setAudience({ kind: "grade", grade: Number(v) })}>{GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}</Select></Field>
          )}

          <p className="flex items-center gap-2 rounded-xl bg-indigo-500/[0.08] px-3.5 py-2.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Non-anonymous voting: All votes are verified and recorded with student identities. Administrators can view who voted what in the voter audit log.
          </p>
          {error && <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-600 dark:text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn onClick={create}><Vote className="h-4 w-4" /> Launch poll</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function FeedbackAndPolls({ initialTab = "suggestions" }: { initialTab?: string }) {
  const [tab, setTab] = useState(initialTab === "polls" ? "polls" : "suggestions");
  return (
    <div className="space-y-6">
      <RevealBlocks>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={[
            { id: "suggestions", label: "Feedback & Suggestions", icon: <MessageSquareHeart className="h-4 w-4" /> },
            { id: "polls", label: "Polls & Surveys", icon: <Vote className="h-4 w-4" /> },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>
      {tab === "suggestions" ? <SuggestionBox /> : <PollsTab />}
      </RevealBlocks>
    </div>
  );
}
