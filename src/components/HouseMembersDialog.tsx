import { useMemo, useState } from "react";
import { Check, LoaderCircle, Search, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { useHub } from "../store/hub";
import { belongsToHouse, classLabel, roleLabel } from "../lib/accounts";
import { houseFullName } from "../lib/admin";
import type { House } from "../lib/types";
import { Avatar, Modal } from "./ui";

export default function HouseMembersDialog({ house, onClose }: { house: House; onClose: () => void }) {
  const { state, user, setHouseMembership, announce } = useHub();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const label = houseFullName(state.houses, house);
  const accounts = useMemo(() => state.users.filter((account) => account.role !== "admin" && (role === "all" || (role === "teacher" ? account.role === "teacher" : account.role !== "teacher")) && `${account.name} ${account.email} ${classLabel(account)}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [state.users, search, role]);
  const admins = state.users.filter((account) => account.role === "admin");
  if (user?.role !== "admin") return null;

  const change = async (accountId: string, include: boolean) => {
    setBusyId(accountId); setError("");
    try { await setHouseMembership(house, accountId, include); announce(include ? `Member added to ${label}.` : `Member removed from ${label}. Their account was retained.`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not change membership."); }
    finally { setBusyId(""); }
  };
  return <Modal open onClose={onClose} title={`Manage ${label} Members`} subtitle="Add or remove students and teachers without deleting their accounts." icon={<Users />} wide>
    <p className="inline-message mb-4">Hub access is independent of a person's primary house or class. Teachers with no class or house can still be added here. Removing a captain also clears their captain appointment.</p>
    <div className="flex flex-wrap gap-2"><div className="search-control min-w-[220px]"><Search /><input className="control" aria-label="Search hub members" placeholder="Search name or email..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><select className="control !w-auto" aria-label="Filter members by account type" value={role} onChange={(e) => setRole(e.target.value)}><option value="all">Students & teachers</option><option value="student">Students</option><option value="teacher">Teachers</option></select></div>
    {error && <p className="inline-message error mt-3" role="alert">{error}</p>}
    <div className="hub-members-manager mt-4">{accounts.map((person) => {
      const included = belongsToHouse(person, house, state.houseMemberships);
      return <div className="hub-member" key={person.id}><Avatar name={person.name} house={person.house} /><div className="min-w-0 flex-1"><strong>{person.name}</strong><small className="!break-all">{person.email}</small><small>{roleLabel(person.role)} / {classLabel(person)} / {houseFullName(state.houses, person.house)}</small></div><button className={`btn !min-h-9 !text-[10px] ${included ? "btn-danger" : "btn-outline"}`} disabled={!!busyId} onClick={() => void change(person.id, !included)}>{busyId === person.id ? <LoaderCircle className="animate-spin" /> : included ? <UserMinus /> : <UserPlus />}{included ? "Remove" : "Add to hub"}</button></div>;
    })}{!accounts.length && <div className="empty-content"><Search /><strong>No matching accounts</strong><p>Add teacher or student accounts in the Admin Panel first.</p></div>}</div>
    <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3"><p className="flex items-center gap-2 text-[10px] font-semibold text-[var(--green)]"><ShieldCheck className="h-4 w-4" />Administrators are always included</p><div className="mt-2 flex flex-wrap gap-3">{admins.map((admin) => <span key={admin.id} className="flex items-center gap-1 text-[10px] text-[var(--muted)]"><Check className="h-3 w-3" />{admin.name}</span>)}</div></div>
    <div className="dialog-actions"><button className="btn btn-secondary" onClick={onClose}>Done</button></div>
  </Modal>;
}