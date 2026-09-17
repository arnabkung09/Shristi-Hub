import { useMemo, useRef, useState } from "react";
import { Bold, Italic, MessageSquarePlus, MessagesSquare, Send, Trash2, Underline, UserPlus, Users } from "lucide-react";
import { initials, relativeTime, uid, useHub } from "../store/hub";
import type { CouncilChatMessage } from "../lib/types";
import { Modal, HouseMark } from "./ui";
import { Reveal } from "./Effects";

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
  const { state, user, dispatch, announce } = useHub();
  const admin = user?.role === "admin";
  const isMember = !!user && (admin || state.councilHubMembers.includes(user.id));
  const [draft, setDraft] = useState("");
  const [memberPicker, setMemberPicker] = useState(false);
  const [query, setQuery] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messages = useMemo(
    () => [...state.councilMessages].sort((a, b) => b.timestamp - a.timestamp),
    [state.councilMessages],
  );
  if (!user) return null;

  const send = () => {
    try {
      if (!draft.trim()) throw new Error("Write a message first.");
      const message: CouncilChatMessage = {
        id: uid(), authorId: user.id, authorName: user.name, authorRole: user.role,
        authorTitle: user.councilTitle, body: draft.trim(), timestamp: Date.now(),
      };
      dispatch({ type: "POST_COUNCIL_MESSAGE", message });
      setDraft("");
      announce("Message posted to the Council Hub.");
    } catch (e) { announce(e instanceof Error ? e.message : "Unable to post.", "error"); }
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

  const memberCandidates = state.users.filter((candidate) =>
    `${candidate.name} ${candidate.email} ${candidate.gradeLabel ?? ""}`.toLowerCase().includes(query.toLowerCase().trim()));

  return (
    <div>
      <div className="directory-heading">
        <div>
          <h1>Council Hub <span className="outline-count">{state.councilHubMembers.length} members</span></h1>
          <p>A private chat space for council members and administrators. Use the formatting buttons for bold, underline, and italics.</p>
        </div>
        {admin && <button className="btn btn-primary mt-1" onClick={() => setMemberPicker(true)}><UserPlus />Manage members</button>}
      </div>

      {!isMember ? (
        <div className="empty-content"><MessagesSquare /><strong>Council Hub is members only</strong><p>The council president can add you from the member list.</p></div>
      ) : (
        <div className="house-columns">
          <Reveal>
            <section className="panel panel-pad">
              <div className="panel-heading"><div><h2><MessagesSquare />Council Chat</h2><p>Only council members and administrators can read and post here.</p></div><span className="small-note">{messages.length} messages</span></div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-3">
                <div className="mb-2 flex items-center gap-1.5">
                  <button type="button" className="icon-action !h-8 !w-8" title="Bold" aria-label="Bold" onClick={() => wrapSelection("**")}><Bold className="h-4 w-4" /></button>
                  <button type="button" className="icon-action !h-8 !w-8" title="Underline" aria-label="Underline" onClick={() => wrapSelection("__")}><Underline className="h-4 w-4" /></button>
                  <button type="button" className="icon-action !h-8 !w-8" title="Italic" aria-label="Italic" onClick={() => wrapSelection("*")}><Italic className="h-4 w-4" /></button>
                  <span className="ml-2 text-[9px] text-[var(--faint)]">**bold** · __underline__ · *italic*</span>
                </div>
                <textarea ref={composerRef} rows={3} maxLength={1500} className="control resize-y" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a council update..." />
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <span className="text-[9px] text-[var(--faint)]">{draft.length}/1500</span>
                  <button className="btn btn-primary" disabled={!draft.trim()} onClick={send}><Send />Post message</button>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {!messages.length && <div className="empty-content"><MessageSquarePlus /><strong>No council messages yet</strong><p>Start the conversation with your first update.</p></div>}
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
                      {(admin || message.authorId === user.id) && (
                        <button className="icon-action red" aria-label="Remove message" title="Remove message" onClick={() => dispatch({ type: "DELETE_COUNCIL_MESSAGE", messageId: message.id })}><Trash2 /></button>
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
              <div className="panel-heading"><h3><Users />Council Hub members</h3><span className="small-note">{state.councilHubMembers.length}</span></div>
              <div className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
                {state.councilHubMembers.map((memberId) => {
                  const member = state.users.find((candidate) => candidate.id === memberId);
                  if (!member) return null;
                  return (
                    <div key={memberId} className="integration-row !py-2.5">
                      <span className="member-inline"><span className="mini-avatar !h-8 !w-8 !rounded-full !text-[9px]">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : initials(member.name)}</span>
                        <span><strong className="!text-[10px]">{member.name}</strong><small>{member.councilTitle ?? member.role}{member.role === "teacher" ? " · Teacher" : ""}</small></span></span>
                      <span className="flex items-center gap-2">
                        <HouseMark house={member.house} className="h-5 w-5 text-[8px]" />
                        {admin && member.id !== user.id && (
                          <button className="icon-action red" title="Remove from Council Hub" aria-label={`Remove ${member.name} from Council Hub`} onClick={() => { try { dispatch({ type: "REMOVE_COUNCIL_HUB_MEMBER", userId: member.id }); announce(`${member.name} removed from the Council Hub.`); } catch (e) { announce(e instanceof Error ? e.message : "Unable to remove member.", "error"); } }}><Trash2 /></button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </aside>
          </Reveal>
        </div>
      )}

      <Modal open={memberPicker} onClose={() => setMemberPicker(false)} title="Add Council Hub member" icon={<Users />} subtitle="Any roster account can be added. Students, teachers, and council officers may all be granted access.">
        <div className="form-stack">
          <label className="form-field"><span>Search accounts</span><input className="control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email..." /></label>
          <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
            {memberCandidates.filter((candidate) => !state.councilHubMembers.includes(candidate.id)).map((candidate) => (
              <div key={candidate.id} className="integration-row !py-2.5">
                <span className="member-inline"><span className="mini-avatar !h-8 !w-8 !rounded-full !text-[9px]">{initials(candidate.name)}</span>
                  <span><strong className="!text-[10px]">{candidate.name}</strong><small>{candidate.councilTitle ?? candidate.role} · {candidate.gradeLabel ?? "Staff"}</small></span></span>
                <button className="btn btn-outline !min-h-[30px] !px-3 !text-[9px]" onClick={() => { try { dispatch({ type: "ADD_COUNCIL_HUB_MEMBER", userId: candidate.id }); announce(`${candidate.name} added to the Council Hub.`); } catch (e) { announce(e instanceof Error ? e.message : "Unable to add member.", "error"); } }}>Add</button>
              </div>
            ))}
            {!memberCandidates.some((candidate) => !state.councilHubMembers.includes(candidate.id)) && <p className="small-note">Every roster account is already a member.</p>}
          </div>
        </div>
        <div className="dialog-actions"><button className="btn btn-secondary" onClick={() => setMemberPicker(false)}>Done</button></div>
      </Modal>
    </div>
  );
}
