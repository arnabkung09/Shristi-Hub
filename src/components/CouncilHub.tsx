import { useMemo, useRef, useState } from "react";
import {
  Bold, CheckCircle2, Italic, LoaderCircle, Lock, LockKeyhole, MessageSquarePlus, MessagesSquare,
  RefreshCw, Send, ShieldCheck, Trash2, Underline, UserPlus, Users, Wifi, WifiOff,
} from "lucide-react";
import { initials, relativeTime, useHub } from "../store/hub";
import {
  COUNCIL_HUB_TAB,
  COUNCIL_MESSAGE_LIMIT,
  canManageCouncilHubMembers,
  canRemoveCouncilMessage,
  councilMemberSummary,
  councilMembers,
} from "../lib/council";
import { PRIMARY_ADMIN_ID } from "../lib/admin";
import type { Student } from "../lib/types";
import { HouseMark, Modal } from "./ui";
import { Reveal } from "./Effects";
import { CouncilHubMembersDialog } from "./admin/CouncilHubMembersPanel";
import { useCouncilChat } from "./useCouncilChat";
import {
  clearConfirmationCode, issueConfirmationCode, verifyConfirmationCode,
} from "../lib/verification";

/** Renders council chat markup as safe React nodes: **bold**, __underline__, *italic*. */
function renderBody(raw: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*)/g;
  const parts = raw.split(pattern).filter((part) => part !== "");
  parts.forEach((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      nodes.push(<strong key={index} className="font-extrabold">{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("__") && part.endsWith("__") && part.length > 4) {
      nodes.push(<u key={index} className="underline underline-offset-2">{part.slice(2, -2)}</u>);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      nodes.push(<em key={index}>{part.slice(1, -1)}</em>);
    } else {
      nodes.push(<span key={index}>{part}</span>);
    }
  });
  return nodes;
}

export default function CouncilHub() {
  const { state, user, dispatch, announce, notify } = useHub();
  const chat = useCouncilChat();
  const [membersOpen, setMembersOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeModal, setCodeModal] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const canManage = canManageCouncilHubMembers(user);
  const members = useMemo(() => councilMembers(state), [state]);
  const messages = chat.messages;
  if (!user) return null;

  const unverifiedAlias = user.aliases?.find((a) => !(user.verifiedAliases ?? []).includes(a));

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeModal) return;
    const ok = verifyConfirmationCode(user.id, codeModal, codeInput);
    if (!ok) {
      setCodeError("Invalid 6-digit confirmation code. Please check your school email and try again.");
      return;
    }
    dispatch({ type: "VERIFY_STUDENT_EMAIL", userId: user.id, email: codeModal });
    clearConfirmationCode(user.id, codeModal);
    announce(`Verified ${codeModal} successfully! You can now sign into the Council Hub with this account.`);
    setCodeModal(null);
    setCodeInput("");
  };

  const send = async () => {
    if (busy) return;
    try {
      setBusy(true);
      await chat.send(draft);
      setDraft("");
      announce(chat.transport === "cloud"
        ? "Message posted to the Council Hub."
        : "Message posted to this device's Council Hub thread.");
    } catch (e) {
      announce(e instanceof Error ? e.message : "Unable to post.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeMessage = async (messageId: string) => {
    try {
      await chat.remove(messageId);
      announce("Council message removed.");
    } catch (e) {
      announce(e instanceof Error ? e.message : "Unable to remove message.", "error");
    }
  };

  const requestAccess = () => {
    notify({
      title: "Council Hub access requested",
      body: `${user.name} (${user.gradeLabel ?? "Staff"}) asked to join the Council Hub. Add the account from Admin Panel / Council Hub if access is approved.`,
      urgent: false,
      senderName: user.name,
      senderRole: user.role,
      audience: { kind: "role", role: "admin" },
      actionTab: COUNCIL_HUB_TAB,
    });
    setRequested(true);
    announce("Your access request was sent to the council administrators.");
  };

  const wrapSelection = (marker: string) => {
    const area = composerRef.current;
    if (!area) return;
    const { selectionStart, selectionEnd, value } = area;
    const selected = value.slice(selectionStart, selectionEnd);
    const next = `${value.slice(0, selectionStart)}${marker}${selected}${marker}${value.slice(selectionEnd)}`;
    setDraft(next);
    requestAnimationFrame(() => {
      area.focus();
      const cursor = selectionStart + marker.length + selected.length + marker.length;
      area.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div>
      <div className="directory-heading">
        <div>
          <h1>Council Hub <span className="outline-count">{councilMemberSummary(state)}</span></h1>
          <p>A private chat space for the student council. Access is granted one account at a time by an administrator — a council title or house never opens this hub on its own.</p>
        </div>
        {canManage && <button className="btn btn-primary mt-1" onClick={() => setMembersOpen(true)}><UserPlus />Manage members</button>}
      </div>

      {unverifiedAlias && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-xs">
          <div>
            <p className="font-bold text-amber-400 flex items-center gap-1.5">
              <Lock className="h-4 w-4" /> Added Login Email Pending Verification
            </p>
            <p className="mt-1 text-slate-300">
              Your account has an added login email <strong>{unverifiedAlias}</strong>. To verify this email for normal Council Hub sign-in, enter the 6-digit confirmation code sent to your official school account (<strong>{user.email}</strong>).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-outline !min-h-[32px] !text-xs"
              onClick={() => {
                const code = issueConfirmationCode(user.id, unverifiedAlias, user.email);
                announce(`6-digit confirmation code [ ${code} ] sent to ${user.email}.`);
              }}
            >
              Send Code
            </button>
            <button
              className="btn btn-primary !min-h-[32px] !text-xs"
              onClick={() => {
                setCodeModal(unverifiedAlias);
                setCodeError("");
                setCodeInput("");
              }}
            >
              Enter 6-Digit Code
            </button>
          </div>
        </div>
      )}

      {!chat.member ? (
        <Reveal>
          <div className="empty-content">
            <LockKeyhole />
            <strong>Council Hub is members only</strong>
            <p>{canManage
              ? `${user.name} is not on the Council Hub member list, so the conversation stays hidden. Add the accounts that should take part below.`
              : `${user.name} is not on the Council Hub member list yet. Ask a council administrator to add your account.`}</p>
            {canManage
              ? <button className="btn btn-primary" onClick={() => setMembersOpen(true)}><Users />Add members to the Council Hub</button>
              : <button className="btn btn-secondary" disabled={requested} onClick={requestAccess}><ShieldCheck />{requested ? "Access request sent" : "Request access"}</button>}
          </div>
          {canManage && (
            <section className="panel panel-pad mt-5">
              <div className="panel-heading"><div><h2><Users />Current Council Hub members</h2><p>Only these accounts can read and post in the hub.</p></div><button className="btn btn-secondary" onClick={() => setMembersOpen(true)}><UserPlus />Add or remove members</button></div>
              <MemberList members={members} />
            </section>
          )}
        </Reveal>
      ) : (
        <div className="house-columns">
          <Reveal>
            <section className="panel panel-pad">
              <div className="panel-heading">
                <div><h2><MessagesSquare />Council Chat</h2><p>Only accounts on the Council Hub member list can read and post here.</p></div>
                <span className="small-note">{messages.length} messages</span>
              </div>

              {chat.error && (
                <p role="alert" className="inline-message error mb-4 flex flex-wrap items-center justify-between gap-3">
                  <span>{chat.error}</span>
                  <button className="btn btn-outline !min-h-[30px] !px-3 !text-[9px]" onClick={chat.retry}><RefreshCw />Try again</button>
                </p>
              )}

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-3">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <button type="button" className="icon-action !h-8 !w-8" title="Bold" aria-label="Bold" onClick={() => wrapSelection("**")}><Bold className="h-4 w-4" /></button>
                  <button type="button" className="icon-action !h-8 !w-8" title="Underline" aria-label="Underline" onClick={() => wrapSelection("__")}><Underline className="h-4 w-4" /></button>
                  <button type="button" className="icon-action !h-8 !w-8" title="Italic" aria-label="Italic" onClick={() => wrapSelection("*")}><Italic className="h-4 w-4" /></button>
                  <span className="ml-2 text-[9px] text-[var(--faint)]">**bold** · __underline__ · *italic*</span>
                  <span className="ml-auto inline-flex items-center gap-1.5 text-[9px] text-[var(--faint)]">
                    {chat.transport === "cloud"
                      ? <><Wifi className="h-3 w-3 text-[var(--green)]" />Live · synced with Firestore</>
                      : <><WifiOff className="h-3 w-3 text-amber-400" />Saved on this device · sign in with Google to sync</>}
                  </span>
                </div>
                <textarea
                  ref={composerRef}
                  rows={3}
                  maxLength={COUNCIL_MESSAGE_LIMIT}
                  className="control resize-y"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void send(); } }}
                  placeholder="Write a council update..."
                />
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <span className="text-[9px] text-[var(--faint)]">{draft.length}/{COUNCIL_MESSAGE_LIMIT} · Ctrl/⌘ + Enter to post</span>
                  <button className="btn btn-primary" disabled={!draft.trim() || busy} onClick={() => void send()}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />}{busy ? "Posting..." : "Post message"}</button>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {chat.loading && <div className="empty-content"><LoaderCircle className="animate-spin" /><strong>Connecting to the council room</strong><p>Loading the live conversation.</p></div>}
                {!chat.loading && !messages.length && <div className="empty-content"><MessageSquarePlus /><strong>No council messages yet</strong><p>Start the conversation with your first update.</p></div>}
                {messages.map((message) => (
                  <article key={message.id} className="rounded-xl border border-indigo-500/20 bg-[var(--surface-inset)] p-4">
                    <div className="flex items-center gap-2.5">
                      <span className="mini-avatar !h-8 !w-8 !rounded-full !text-[10px]">{initials(message.authorName)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold">{message.authorName}
                          {message.authorRole === "admin" && <span className="ml-1.5 rounded bg-violet-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-violet-400">Admin</span>}
                          {message.authorRole === "teacher" && <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-400">Teacher</span>}
                          {message.authorRole === "council" && <span className="ml-1.5 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-indigo-300">Council</span>}
                        </p>
                        <p className="text-[9px] text-[var(--faint)]">{message.authorTitle ?? message.authorRole} · {relativeTime(message.timestamp)}</p>
                      </div>
                      {canRemoveCouncilMessage(user, message) && (
                        <button className="icon-action red" aria-label="Remove message" title="Remove message" onClick={() => void removeMessage(message.id)}><Trash2 /></button>
                      )}
                    </div>
                    <p className="mt-2.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                      {message.removed ? <em className="text-[var(--faint)]">This message was removed.</em> : renderBody(message.body)}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </Reveal>

          <Reveal delay={120}>
            <aside className="panel panel-pad">
              <div className="panel-heading"><h3><Users />Council Hub members</h3><span className="small-note">{members.length}</span></div>
              <p className="small-note mb-3">Only these accounts can open this hub. An administrator controls the list.</p>
              <MemberList
                members={members}
                canManage={canManage}
                onRemove={(member) => {
                  try {
                    dispatch({ type: "REMOVE_COUNCIL_HUB_MEMBER", userId: member.id });
                    announce(`${member.name} removed from the Council Hub.`);
                  } catch (e) {
                    announce(e instanceof Error ? e.message : "Unable to remove member.", "error");
                  }
                }}
              />
              {canManage && <button className="btn btn-secondary mt-4 w-full" onClick={() => setMembersOpen(true)}><UserPlus />Add or remove students</button>}
            </aside>
          </Reveal>
        </div>
      )}

      <CouncilHubMembersDialog open={membersOpen} onClose={() => setMembersOpen(false)} />

      {codeModal && (
        <Modal
          open
          onClose={() => setCodeModal(null)}
          title="Verify Added Login Email"
          subtitle={`Confirmation code sent to ${user.email}`}
          icon={<Lock />}
        >
          <form onSubmit={handleVerifyCode} className="form-stack">
            <p className="inline-message">
              A 6-digit confirmation code was sent to your official school account: <strong>{user.email}</strong>. Enter it below to verify <strong>{codeModal}</strong> for Council Hub sign-in.
            </p>
            <label className="form-field">
              <span>Enter 6-digit confirmation code</span>
              <input
                required
                maxLength={6}
                autoFocus
                className="control !py-3 text-center font-mono text-xl tracking-[0.4em] font-bold"
                placeholder="······"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
            {codeError && <p role="alert" className="inline-message error">{codeError}</p>}
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setCodeModal(null)}>
                Cancel
              </button>
              <button type="submit" disabled={codeInput.length !== 6} className="btn btn-primary">
                <CheckCircle2 className="h-4 w-4" /> Verify Email
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function MemberList({ members, canManage = false, onRemove }: {
  members: Student[];
  canManage?: boolean;
  onRemove?: (member: Student) => void;
}) {
  const { user } = useHub();
  return (
    <div className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
      {members.map((member) => (
        <div key={member.id} className="integration-row !py-2.5">
          <span className="member-inline">
            <span className="mini-avatar !h-8 !w-8 !rounded-full !text-[9px]">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : initials(member.name)}</span>
            <span>
              <strong className="!text-[10px]">{member.name}</strong>
              <small>{member.councilTitle ?? member.role}{member.role === "teacher" ? " · Teacher" : ""}</small>
            </span>
          </span>
          <span className="flex items-center gap-2">
            <HouseMark house={member.house} className="h-5 w-5 text-[8px]" />
            {member.id === PRIMARY_ADMIN_ID && <span className="clearance !text-[8px]"><ShieldCheck className="h-3 w-3" />Protected</span>}
            {member.id === user?.id && member.id !== PRIMARY_ADMIN_ID && <span className="clearance !text-[8px]">You</span>}
            {canManage && onRemove && member.id !== PRIMARY_ADMIN_ID && member.id !== user?.id && (
              <button className="icon-action red" title="Remove from the Council Hub" aria-label={`Remove ${member.name} from the Council Hub`} onClick={() => onRemove(member)}><Trash2 /></button>
            )}
          </span>
        </div>
      ))}
      {!members.length && <p className="small-note">No accounts have been added yet.</p>}
    </div>
  );
}
