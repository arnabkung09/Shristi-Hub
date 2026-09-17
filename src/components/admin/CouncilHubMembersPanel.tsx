import { useMemo, useState } from "react";
import { CheckCheck, MessagesSquare, Search, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { initials, useHub } from "../../store/hub";
import {
  COUNCIL_HUB_TAB,
  canManageCouncilHubMembers,
  councilCandidates,
  councilMembers,
} from "../../lib/council";
import { PRIMARY_ADMIN_ID } from "../../lib/admin";
import { HouseMark, Modal } from "../ui";
import type { Student } from "../../lib/types";

const ROLE_LABEL: Record<Student["role"], string> = {
  admin: "Administrator",
  council: "Council",
  teacher: "Teacher",
  student: "Student",
};

/**
 * Council Hub access control. Membership is explicit: an account can read or post in
 * the hub only after an administrator adds it here, and the same list is enforced by
 * the Firestore rules for cloud sessions.
 */
export function useCouncilHubMembers() {
  const { state, user, dispatch, announce, notify } = useHub();
  const [query, setQuery] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<Student | null>(null);
  const canManage = canManageCouncilHubMembers(user);
  const members = useMemo(() => councilMembers(state), [state]);
  const candidates = useMemo(() => councilCandidates(state, query), [state, query]);

  const add = (member: Student) => {
    if (!canManage) { announce("Only an administrator can change Council Hub access.", "error"); return; }
    try {
      dispatch({ type: "ADD_COUNCIL_HUB_MEMBER", userId: member.id });
      notify({
        title: "You were added to the Council Hub",
        body: `${user?.name ?? "A council administrator"} added your account to the Council Hub. Open it from the navigation to chat with the student council.`,
        urgent: false,
        senderName: user?.name ?? "Council administration",
        senderRole: user?.role ?? "admin",
        audience: { kind: "user", userId: member.id, name: member.name },
        actionTab: COUNCIL_HUB_TAB,
      });
      announce(`${member.name} can now read and post in the Council Hub.`);
    } catch (error) {
      announce(error instanceof Error ? error.message : "Unable to add this account.", "error");
    }
  };

  const remove = (member: Student) => {
    if (!canManage) { announce("Only an administrator can change Council Hub access.", "error"); return; }
    try {
      dispatch({ type: "REMOVE_COUNCIL_HUB_MEMBER", userId: member.id });
      notify({
        title: "You were removed from the Council Hub",
        body: "A council administrator removed your account from the Council Hub. Ask the administration if you need access again.",
        urgent: false,
        senderName: user?.name ?? "Council administration",
        senderRole: user?.role ?? "admin",
        audience: { kind: "user", userId: member.id, name: member.name },
        actionTab: "dashboard",
      });
      announce(`${member.name} was removed from the Council Hub. Their roster account is unchanged.`);
      setPendingRemoval(null);
    } catch (error) {
      announce(error instanceof Error ? error.message : "Unable to remove this account.", "error");
      setPendingRemoval(null);
    }
  };

  return {
    state, user, canManage, members, candidates, query, setQuery,
    add, remove, pendingRemoval, setPendingRemoval,
  };
}

/** Shared add/remove board used by the Admin Panel section and the hub dialog. */
function CouncilHubMemberBoard() {
  const { canManage, members, candidates, query, setQuery, add, remove, pendingRemoval, setPendingRemoval } = useCouncilHubMembers();
  const { user } = useHub();
  const notAddedYet = candidates.length;

  return (
    <div className="form-stack">
      <div className="panel-heading"><div><h2><Users />Explicit members <span className="outline-count">{members.length}</span></h2><p>Only accounts on this list can open the Council Hub chat. Administrators manage the list but are not members automatically.</p></div></div>

      <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
        {members.map((member) => (
          <div key={member.id} className="integration-row !py-2.5">
            <span className="member-inline">
              <span className="mini-avatar !h-8 !w-8 !rounded-full !text-[9px]">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : initials(member.name)}</span>
              <span>
                <strong className="!text-[10px]">{member.name}</strong>
                <small>{member.councilTitle ?? ROLE_LABEL[member.role]} · {member.gradeLabel ?? "Staff"}</small>
              </span>
            </span>
            <span className="flex items-center gap-2">
              <HouseMark house={member.house} className="h-5 w-5 text-[8px]" />
              {member.id === PRIMARY_ADMIN_ID ? (
                <span className="clearance !text-[8px]"><ShieldCheck className="h-3 w-3" />Protected</span>
              ) : canManage ? (
                <button className="icon-action red" title={`Remove ${member.name} from the Council Hub`} aria-label={`Remove ${member.name} from the Council Hub`} onClick={() => setPendingRemoval(member)}><Trash2 /></button>
              ) : null}
            </span>
          </div>
        ))}
        {!members.length && <div className="empty-content !min-h-[110px]"><Users /><strong>No members yet</strong><p>Add the first account below to open the Council Hub.</p></div>}
      </div>

      {canManage && <>
        <label className="form-field"><span>Add accounts to the Council Hub</span>
          <div className="search-control"><Search /><input className="control" aria-label="Search roster for Council Hub members" placeholder="Search name, email, class, house, or ID..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        </label>
        <div className="max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
          {candidates.map((candidate) => (
            <div key={candidate.id} className="integration-row !py-2.5">
              <span className="member-inline">
                <span className="mini-avatar !h-8 !w-8 !rounded-full !text-[9px]">{initials(candidate.name)}</span>
                <span>
                  <strong className="!text-[10px]">{candidate.name}</strong>
                  <small>{candidate.councilTitle ?? ROLE_LABEL[candidate.role]} · {candidate.gradeLabel ?? "Staff"} · {candidate.email}</small>
                </span>
              </span>
              <span className="flex items-center gap-2">
                {candidate.status !== "active" && <span className="status-label" title="They reach the hub once they activate their roster login.">Pending activation</span>}
                <button className="btn btn-outline !min-h-[30px] !px-3 !text-[9px]" onClick={() => add(candidate)}><UserPlus />Add</button>
              </span>
            </div>
          ))}
          {!notAddedYet && <p className="small-note">{query ? "No roster account matches this search." : "Every roster account is already a Council Hub member."}</p>}
        </div>
      </>}

      {user?.role !== "admin" && <p className="inline-message">Only administrators can add or remove Council Hub members.</p>}

      <Modal open={!!pendingRemoval} onClose={() => setPendingRemoval(null)} title="Remove from the Council Hub" icon={<Trash2 />}>
        <p className="inline-message">Remove <strong>{pendingRemoval?.name}</strong> from the Council Hub? They lose access to the chat immediately. Their roster account, council role, and past messages are kept.</p>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={() => setPendingRemoval(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={() => pendingRemoval && remove(pendingRemoval)}><Trash2 />Remove access</button>
        </div>
      </Modal>
    </div>
  );
}

/** Admin Panel section: full-width Council Hub access control. */
export default function CouncilHubMembersPanel() {
  const { state, user, setActiveTab } = useHub();
  const members = councilMembers(state);
  const selfMember = members.some((member) => member.id === user?.id);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1.3fr_1fr]">
      <section className="panel panel-pad">
        <div className="panel-heading">
          <div>
            <h2><MessagesSquare />Council Hub Access</h2>
            <p>Chat access is granted one account at a time. A council title, house, or role never opens the hub on its own.</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setActiveTab(COUNCIL_HUB_TAB)}><MessagesSquare />Open hub</button>
        </div>
        <CouncilHubMemberBoard />
      </section>

      <section className="panel panel-pad">
        <div className="panel-heading"><div><h2><ShieldCheck />How Council Hub access works</h2><p>What administrators can expect after a change.</p></div></div>
        <div className="form-stack">
          <p className="inline-message"><strong>{members.length}</strong> {members.length === 1 ? "account is" : "accounts are"} currently on the list. Everyone else sees a locked Council Hub with no message content.</p>
          <div className="integration-row"><span>Members with activated logins</span><strong className="text-right text-[11px]">{members.filter((member) => member.status === "active").length} of {members.length}</strong></div>
          {!selfMember && <p className="inline-message error">Your administrator account is not a member, so you cannot read or post in the hub until you add yourself.</p>}
          <div className="integration-row"><span>Cloud sessions</span><strong className="text-right text-[11px]">Firestore rules check the same list</strong></div>
          <div className="integration-row"><span>Removing a member</span><strong className="text-right text-[11px]">Keeps roster, role, and messages</strong></div>
          <div className="integration-row"><span>Primary administrator</span><strong className="text-right text-[11px]">Always a member</strong></div>
          <div className="integration-row"><span>Adding a member</span><strong className="text-right text-[11px]">Sends an in-app notification</strong></div>
        </div>
        <div className="dialog-actions"><button className="btn btn-primary" onClick={() => setActiveTab(COUNCIL_HUB_TAB)}><MessagesSquare />Go to the Council Hub</button></div>
      </section>
    </div>
  );
}

/** Modal variant used from the Council Hub page. */
export function CouncilHubMembersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Council Hub members" icon={<Users />} subtitle="Add or remove the accounts that may read and post in the Council Hub." wide>
      <CouncilHubMemberBoard />
      <div className="dialog-actions"><button className="btn btn-secondary" onClick={onClose}><CheckCheck />Done</button></div>
    </Modal>
  );
}
