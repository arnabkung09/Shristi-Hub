import { useMemo, useState } from "react";
import {
  CheckCircle2, CircleDashed, EyeOff, Lock, MessageSquareHeart, Plus, Send,
  ThumbsDown, ThumbsUp, Vote, XCircle,
} from "lucide-react";
import { audienceLabel, fmtDate, relativeTime, targetsUser, uid, useHub } from "../store/hub";
import { Badge, Btn, Card, EmptyState, Field, Modal, Select, Tabs, inputCls } from "./ui";
import { GRADES, HOUSES, SUGGESTION_CATEGORIES } from "../lib/seed";
import { cn } from "../utils/cn";
import type { Audience, Poll, SuggestionCategory, SuggestionStatus } from "../lib/types";

const STATUS_META: Record<SuggestionStatus, { label: string; tone: "amber" | "blue" | "emerald" | "red"; icon: React.ReactNode }> = {
  pending: { label: "Pending Review", tone: "amber", icon: <CircleDashed className="h-3 w-3" /> },
  consideration: { label: "In Consideration", tone: "blue", icon: <ScanIcon /> },
  implemented: { label: "Implemented", tone: "emerald", icon: <CheckCircle2 className="h-3 w-3" /> },
  declined: { label: "Declined", tone: "red", icon: <XCircle className="h-3 w-3" /> },
};
function ScanIcon() { return <Vote className="h-3 w-3" />; }

/* ---------------- suggestion box ---------------- */

function SuggestionBox() {
  const { state, user, hasPermission, dispatch } = useHub();
  const canManage = hasPermission("voice");
  const [category, setCategory] = useState<string>(SUGGESTION_CATEGORIES[0]);
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [sent, setSent] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [rStatus, setRStatus] = useState<SuggestionStatus>("consideration");
  const [rResponse, setRResponse] = useState("");

  if (!user) return null;

  const submit = () => {
    if (text.trim().length < 12) return;
    dispatch({
      type: "ADD_SUGGESTION",
      suggestion: {
        id: uid(), category: category as SuggestionCategory, text: text.trim(),
        anonymous, authorId: anonymous ? undefined : user.id,
        authorLabel: anonymous ? "Anonymous" : `${user.name} · Grade ${user.grade}`,
        status: "pending", timestamp: Date.now(),
      },
    });
    setText(""); setSent(true);
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

        <div className="mt-4 space-y-4">
          <Field label="Category">
            <Select value={category} onChange={setCategory}>
              {SUGGESTION_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Your suggestion or concern">
            <textarea rows={5} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Be specific — what should change, and where?" />
          </Field>

          <button
            onClick={() => setAnonymous((v) => !v)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
              anonymous ? "border-violet-500/40 bg-violet-500/[0.08]" : "border-black/10 hover:bg-black/[0.02] dark:border-white/10 dark:hover:bg-white/[0.04]"
            )}
          >
            <span className={cn("grid h-9 w-9 place-items-center rounded-lg", anonymous ? "bg-violet-500/15 text-violet-500" : "bg-black/[0.05] text-slate-400 dark:bg-white/[0.06]")}>
              <EyeOff className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">Submit anonymously</span>
              <span className="block text-[11px] text-slate-400">
                {anonymous ? "Identity fully stripped — safe for sensitive concerns" : `Posting as ${user.name} · Grade ${user.grade}`}
              </span>
            </span>
            <span className={cn("relative h-6 w-11 rounded-full transition-colors", anonymous ? "bg-violet-500" : "bg-slate-300 dark:bg-slate-600")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", anonymous ? "left-[22px]" : "left-0.5")} />
            </span>
          </button>

          <Btn className="w-full" disabled={text.trim().length < 12} onClick={submit}>
            <Send className="h-4 w-4" /> {sent ? "Submitted — thank you!" : "Submit to council"}
          </Btn>
          {text.trim().length > 0 && text.trim().length < 12 && (
            <p className="text-center text-[11px] text-slate-400">A little more detail helps (min 12 characters)</p>
          )}
        </div>
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
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                {s.anonymous ? <><EyeOff className="h-3.5 w-3.5 text-violet-400" /> Anonymous — identity hidden</> : <span className="text-slate-500 dark:text-slate-300">{s.authorLabel}</span>}
              </p>

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
  const { user, dispatch } = useHub();
  const [selected, setSelected] = useState<number | null>(null);
  if (!user) return null;

  const closed = poll.expires < new Date().toISOString().slice(0, 10);
  const voted = poll.voters.includes(user.id);
  const locked = voted || closed;
  const total = poll.votes.reduce((a, b) => a + b, 0);
  const leader = Math.max(...poll.votes);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={closed ? "slate" : "emerald"}>{closed ? "Closed" : "Active"}</Badge>
        <Badge tone="slate">{audienceLabel(poll.audience)}</Badge>
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
          return (
            <div key={i} className="relative">
              {locked ? (
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

      <div className="mt-4 flex items-center justify-between border-t border-black/[0.05] pt-3.5 dark:border-white/[0.06]">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <Vote className="h-3.5 w-3.5" /> {total.toLocaleString()} votes cast · by {poll.creatorName}
        </span>
        {voted ? (
          <Badge tone="indigo"><Lock className="h-3 w-3" /> Vote submitted</Badge>
        ) : closed ? (
          <Badge tone="slate"><Lock className="h-3 w-3" /> Voting closed</Badge>
        ) : (
          <Btn className="min-h-[36px] text-xs" disabled={selected === null} onClick={() => {
            if (selected === null) return;
            dispatch({ type: "VOTE", pollId: poll.id, optionIndex: selected, userId: user.id });
          }}>
            Submit vote
          </Btn>
        )}
      </div>
    </Card>
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
        id: uid(), question: question.trim(), description: description.trim(),
        options: opts, votes: opts.map(() => 0), voters: [], expires, audience,
        creatorName: user.name, createdAt: Date.now(),
      },
      notification: {
        id: uid(), title: "New poll published", body: `"${question.trim()}" — cast your vote before ${fmtDate(expires)}.`,
        timestamp: Date.now(), urgent: false, senderName: user.name, senderRole: user.role,
        audience, actionTab: "voice", readBy: [], kind: "system",
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

          <p className="flex items-center gap-2 rounded-xl bg-accent/[0.08] px-3.5 py-2.5 text-xs font-medium text-accent">
            <Lock className="h-3.5 w-3.5" /> The preview records one vote per student locally. Production election security requires a connected backend.
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={[
            { id: "suggestions", label: "Suggestion Box", icon: <MessageSquareHeart className="h-4 w-4" /> },
            { id: "polls", label: "Polls & Elections", icon: <Vote className="h-4 w-4" /> },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>
      {tab === "suggestions" ? <SuggestionBox /> : <PollsTab />}
    </div>
  );
}
