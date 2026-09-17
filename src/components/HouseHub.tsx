import { useMemo, useState } from "react";
import { Crown, Medal, Megaphone, MessageSquare, Pin, Send, ShieldCheck, Trash2, Trophy, Users } from "lucide-react";
import { initials, relativeTime, uid, useHub } from "../store/hub";
import { houseFullName, houseLogo, houseStandings, rankLabel } from "../lib/admin";
import { HOUSES } from "../lib/seed";
import { Modal, HouseMark } from "./ui";
import { Reveal } from "./Effects";
import type { House, HouseMessage } from "../lib/types";

const HOUSE_THEME: Record<House, { bg: string; text: string; ring: string }> = {
  Blue: { bg: "linear-gradient(125deg,#1d3f8f,#16233f)", text: "#7fb0ff", ring: "#3b82f6" },
  Red: { bg: "linear-gradient(125deg,#8e2036,#331624)", text: "#ff9aae", ring: "#ef4444" },
  Green: { bg: "linear-gradient(125deg,#116446,#12291f)", text: "#6fe0b0", ring: "#22c55e" },
};

export default function HouseHub() {
  const { state, user, dispatch, announce, houseTotals } = useHub();
  const admin = user?.role === "admin";
  const [active, setActive] = useState<House>(user && !admin && user.house ? user.house : "Blue");
  const [composer, setComposer] = useState(false);
  const [captainPicker, setCaptainPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<HouseMessage | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"instruction" | "message">("instruction");
  const [captainId, setCaptainId] = useState("");
  const [error, setError] = useState("");

  const houses = admin ? HOUSES : ([user?.house ?? "Blue"] as House[]);
  const house = houses.includes(active) ? active : houses[0];
  const members = useMemo(() => state.users.filter((u) => u.house === house), [state.users, house]);
  const captainId_ = state.houseCaptains[house];
  const captain = state.users.find((u) => u.id === captainId_);
  const messages = state.houseMessages.filter((m) => m.house === house).sort((a, b) => b.timestamp - a.timestamp);
  const canPost = admin || captainId_ === user?.id;
  const label = houseFullName(state.houses, house);

  const standings = useMemo(() => houseStandings(houseTotals), [houseTotals]);
  const position = standings.find((s) => s.house === house) ?? { rank: 3, points: 0 };
  const leader = standings[0];
  const behind = leader.points - position.points;

  if (!user) return null;

  const post = () => {
    try {
      const message: HouseMessage = {
        id: uid(), house, title: title.trim(), body: body.trim(), kind,
        authorId: user.id, authorName: user.name,
        authorRole: admin ? "Administrator" : `${label} Captain`,
        timestamp: Date.now(),
      };
      dispatch({ type: "POST_HOUSE_MESSAGE", message });
      dispatch({
        type: "PUSH_NOTIFICATION",
        notification: { id: uid(), title: `${label}: ${message.title}`, body: message.body, timestamp: Date.now(), urgent: false, senderName: user.name, senderRole: user.role, audience: { kind: "house", house }, actionTab: "house", readBy: [], kind: "broadcast" },
      });
      announce(`Posted to the ${label} hub and notified its members.`);
      setComposer(false); setTitle(""); setBody(""); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to post."); }
  };

  return (
    <div>
      <div className="directory-heading">
        <div>
          <h1>House Hub <span className="outline-count">{admin ? "All houses" : label}</span></h1>
          <p>{admin ? "Administrators belong to every house hub. Appoint captains and post instructions to any house." : captainId_ === user.id ? "You are the house captain. Share instructions and messages with your house members." : "Instructions and messages from your house captain and the council administration."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {admin && <button className="btn btn-secondary" onClick={() => { setCaptainPicker(true); setCaptainId(captainId_ ?? ""); setError(""); }}><Crown />Set House Captain</button>}
          {canPost && <button className="btn btn-primary" onClick={() => { setComposer(true); setError(""); }}><Megaphone />Post to {houseFullName(state.houses, house).split(" ")[0]} House</button>}
        </div>
      </div>

      {houses.length > 1 && (
        <div className="compact-tabs mb-5" role="tablist" aria-label="House hubs">
          {houses.map((h) => {
            const logo = houseLogo(state.houses, h);
            const rank = standings.find((s) => s.house === h)?.rank ?? 3;
            return (
              <button key={h} role="tab" aria-selected={house === h} className={house === h ? "active" : ""} onClick={() => setActive(h)}>
                {logo ? <img src={logo} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="h-2 w-2 rounded-full" style={{ background: HOUSE_THEME[h].ring }} />}
                {houseFullName(state.houses, h)}
                <span className="ml-1 text-[8px] font-bold text-[var(--faint)]">#{rank}</span>
              </button>
            );
          })}
        </div>
      )}

      <Reveal>
        <section className="house-banner hover-lift" style={{ background: HOUSE_THEME[house].bg }}>
          <div className="flex items-center gap-4">
            <HouseMark house={house} className="h-16 w-16 !rounded-2xl text-xl ring-2 ring-white/20" />
            <div>
              <p className="eyebrow !text-white/60">{label} Hub</p>
              <h2 style={{ color: HOUSE_THEME[house].text }}>{label}</h2>
              <p className="house-banner-meta">{members.length} members / {houseTotals[house].toLocaleString()} championship points</p>
              <span className={`house-position mt-2 ${position.rank === 1 ? "first" : position.rank === 2 ? "second" : "third"}`}>
                {position.rank === 1 ? <Crown className="h-3.5 w-3.5" /> : <Medal className="h-3.5 w-3.5" />}
                {rankLabel(position.rank)} of 3{position.rank > 1 && behind > 0 ? ` · ${behind.toLocaleString()} pts behind` : position.rank === 1 ? " · leading the cup" : ""}
              </span>
            </div>
          </div>
          <div className="house-banner-cards">
            <div className="stream-control"><Crown className="!text-amber-300" /><div><strong>HOUSE CAPTAIN</strong><span>{captain ? captain.name : "Not appointed"}</span></div></div>
            <div className="stream-control"><Users /><div><strong>MEMBERS</strong><span>{members.length} students</span></div></div>
            <div className="stream-control"><Trophy /><div><strong>POSITION</strong><span>#{position.rank} · {houseTotals[house].toLocaleString()} pts</span></div></div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={100}>
        <section className="panel mt-5 overflow-hidden">
          <div className="panel-caption"><h2 className="eyebrow">Championship standings</h2><span className="small-note !text-[9px]">Live across all hubs</span></div>
          <div className="table-scroll">
            <table className="data-table !min-w-[480px]">
              <thead><tr><th>Position</th><th>House</th><th>Members</th><th className="actions-heading">Points</th></tr></thead>
              <tbody>
                {standings.map((s) => (
                  <tr key={s.house} className={s.house === house ? "bg-indigo-500/[0.06]" : ""}>
                    <td><span className={`house-position ${s.rank === 1 ? "first" : s.rank === 2 ? "second" : "third"}`}>#{s.rank}</span></td>
                    <td><span className="flex items-center gap-2 font-semibold"><HouseMark house={s.house} className="h-6 w-6 text-[9px]" />{houseFullName(state.houses, s.house)}</span></td>
                    <td className="text-[var(--muted)]">{state.users.filter((u) => u.house === s.house).length}</td>
                    <td className="actions-heading font-display font-extrabold tabular-nums">{s.points.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Reveal>

      <div className="house-columns mt-5">
        <Reveal>
          <section className="panel panel-pad">
            <div className="panel-heading"><div><h2><MessageSquare />House Notice Board</h2><p>Instructions and messages sent to {label} members.</p></div><span className="small-note">{messages.length} posts</span></div>
            {!messages.length ? (
              <div className="empty-content"><Megaphone /><strong>No posts yet</strong><p>{canPost ? "Share the first instruction with your house." : "Your captain has not posted anything yet."}</p></div>
            ) : (
              <div className="form-stack">
                {messages.map((message) => (
                  <article key={message.id} className="house-message" style={{ borderLeftColor: HOUSE_THEME[house].ring }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`status-label ${message.kind === "instruction" ? "" : "active"}`}>{message.kind === "instruction" ? <><Pin className="h-3 w-3" />Instruction</> : <><MessageSquare className="h-3 w-3" />Message</>}</span>
                      <span className="ml-auto text-[9px] text-[var(--faint)]">{relativeTime(message.timestamp)}</span>
                      {(admin || message.authorId === user.id) && <button className="icon-action red" aria-label={`Delete ${message.title}`} onClick={() => setConfirmDelete(message)}><Trash2 /></button>}
                    </div>
                    <h3 className="mt-2 font-display text-sm font-bold">{message.title}</h3>
                    <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--muted)]">{message.body}</p>
                    <p className="mt-3 flex items-center gap-2 border-t border-[var(--border)] pt-2.5 text-[9px] text-[var(--faint)]"><span className="mini-avatar !h-6 !w-6 !text-[8px]">{initials(message.authorName)}</span>{message.authorName} / {message.authorRole}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </Reveal>

        <Reveal delay={140}>
          <aside className="panel panel-pad">
            <div className="panel-heading"><h3><Users />House Members</h3><span className="small-note">{members.length}</span></div>
            <div className="max-h-[430px] overflow-y-auto pr-1">
              {members.map((member) => (
                <div key={member.id} className="integration-row !py-2.5">
                  <span className="member-inline"><span className="mini-avatar !h-8 !w-8 !text-[9px]">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : initials(member.name)}</span><span><strong className="!text-[10px]">{member.name}</strong><small>{member.gradeLabel}</small></span></span>
                  {member.id === captainId_ ? <span className="clearance !text-[8px]"><Crown className="h-3 w-3" />Captain</span> : member.role === "admin" ? <span className="clearance !text-[8px]"><ShieldCheck className="h-3 w-3" />Admin</span> : null}
                </div>
              ))}
            </div>
          </aside>
        </Reveal>
      </div>

      <Modal open={composer} onClose={() => setComposer(false)} title={`Post to ${label}`} icon={<Megaphone />} subtitle="Members of this house receive an in-app notification.">
        <form onSubmit={(e) => { e.preventDefault(); post(); }}>
          <div className="form-stack">
            <label className="form-field"><span>Post type</span><select className="control" value={kind} onChange={(e) => setKind(e.target.value as "instruction" | "message")}><option value="instruction">Instruction</option><option value="message">Message</option></select></label>
            <label className="form-field"><span>Title</span><input required maxLength={90} className="control" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sports Day march-past practice" /></label>
            <label className="form-field"><span>Details</span><textarea required rows={5} maxLength={1200} className="control resize-y" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What should your house members do, and when?" /></label>
            {error && <p role="alert" className="inline-message error">{error}</p>}
          </div>
          <div className="dialog-actions"><button type="button" className="btn btn-secondary" onClick={() => setComposer(false)}>Cancel</button><button type="submit" className="btn btn-primary"><Send />Post to house</button></div>
        </form>
      </Modal>

      <Modal open={captainPicker} onClose={() => setCaptainPicker(false)} title={`${label} Captain`} icon={<Crown />} subtitle="Captains can post instructions and messages to their own house.">
        <div className="form-stack">
          <label className="form-field"><span>Select a {label} student</span><select className="control" value={captainId} onChange={(e) => setCaptainId(e.target.value)}><option value="">No captain appointed</option>{members.filter((m) => m.role !== "admin").map((m) => <option key={m.id} value={m.id}>{m.name} / {m.gradeLabel}</option>)}</select></label>
          <p className="inline-message">Only students already in {label} can be appointed. Administrators keep posting rights in every house.</p>
          {error && <p role="alert" className="inline-message error">{error}</p>}
        </div>
        <div className="dialog-actions"><button className="btn btn-secondary" onClick={() => setCaptainPicker(false)}>Cancel</button><button className="btn btn-primary" onClick={() => {
          try { dispatch({ type: "SET_HOUSE_CAPTAIN", house, userId: captainId }); announce(captainId ? "House captain updated." : "House captain removed."); setCaptainPicker(false); setError(""); }
          catch (e) { setError(e instanceof Error ? e.message : "Unable to save."); }
        }}><Crown />Save captain</button></div>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Remove house post" icon={<Trash2 />}>
        <p className="inline-message">Remove <strong>{confirmDelete?.title}</strong> from the {label} notice board?</p>
        <div className="dialog-actions"><button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="btn btn-danger" onClick={() => { dispatch({ type: "DELETE_HOUSE_MESSAGE", messageId: confirmDelete!.id }); announce("House post removed."); setConfirmDelete(null); }}><Trash2 />Remove post</button></div>
      </Modal>
    </div>
  );
}
