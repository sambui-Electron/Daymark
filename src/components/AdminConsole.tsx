import { useEffect, useMemo, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  KeyRound,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";

type Theme = "light" | "dark";

interface AdminAuthResponse {
  token: string;
  mustChangePassword: boolean;
}

interface AccountSummary {
  id: string;
  name: string;
  email: string;
  taskCount: number;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  weatherLocation: string;
}

interface TaskListMeta {
  id: string;
  name: string;
  color: string;
}

interface Todo {
  id: string;
  title: string;
  details: string;
  dueDate: string;
  listId: string;
  listName: string;
  listColor: string;
  completed: boolean;
  createdAt: string;
}

interface AccountDetails {
  user: User;
  lists: TaskListMeta[];
  todos: Todo[];
}

type Stage = "login" | "change-password" | "dashboard";

export default function AdminConsole({ theme, onExit }: { theme: Theme; onExit: () => void }) {
  const [stage, setStage] = useState<Stage>("login");
  const [adminToken, setAdminToken] = useState("");
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [search, setSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<AccountSummary | null>(null);
  const [accountPassword, setAccountPassword] = useState("");
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [details, setDetails] = useState<AccountDetails | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editWeatherLocation, setEditWeatherLocation] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((account) => `${account.name} ${account.email}`.toLowerCase().includes(query));
  }, [accounts, search]);

  async function loadAccounts(token = adminToken) {
    const result = await invoke<AccountSummary[]>("admin_list_accounts", { token });
    setAccounts(result);
  }

  useEffect(() => {
    if (stage === "dashboard" && adminToken) {
      void loadAccounts().catch((caught) => setError(String(caught)));
    }
    // The dashboard session is established before this effect is enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, adminToken]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await invoke<AdminAuthResponse>("admin_login", { username: adminUsername, password: adminPassword });
      setAdminToken(result.token);
      setStage(result.mustChangePassword ? "change-password" : "dashboard");
      setAdminPassword("");
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function changeAdminPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newAdminPassword !== confirmAdminPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await invoke("admin_change_password", { token: adminToken, newPassword: newAdminPassword });
      setNewAdminPassword("");
      setConfirmAdminPassword("");
      setStage("dashboard");
      setNotice("Administrator password updated.");
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function openAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount) return;
    setBusy(true);
    setError("");
    try {
      const result = await invoke<AccountDetails>("admin_inspect_account", {
        token: adminToken,
        userId: selectedAccount.id,
        accountPassword,
      });
      setDetails(result);
      setEditName(result.user.name);
      setEditEmail(result.user.email);
      setEditWeatherLocation(result.user.weatherLocation);
      setEditPassword("");
      setNewAccountPassword("");
      setAccountPassword("");
    } catch (caught) {
      setError(String(caught));
      setDetails(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount) return;
    setBusy(true);
    setError("");
    try {
      const updated = await invoke<User>("admin_update_account", {
        token: adminToken,
        userId: selectedAccount.id,
        accountPassword: editPassword,
        name: editName,
        email: editEmail,
        weatherLocation: editWeatherLocation,
        newPassword: newAccountPassword.trim() ? newAccountPassword : null,
      });
      setDetails((current) => current ? { ...current, user: updated } : current);
      setAccounts((current) => current.map((item) => item.id === updated.id ? { ...item, name: updated.name, email: updated.email } : item));
      setEditPassword("");
      setNewAccountPassword("");
      setNotice(`Updated ${updated.name}'s account.`);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount) return;
    setBusy(true);
    setError("");
    try {
      await invoke("admin_delete_account", {
        token: adminToken,
        userId: selectedAccount.id,
        accountPassword: deletePassword,
      });
      setAccounts((current) => current.filter((item) => item.id !== selectedAccount.id));
      setSelectedAccount(null);
      setDetails(null);
      setShowDeleteConfirmation(false);
      setDeletePassword("");
      setNotice("Account deleted. Its local tasks and lists were removed with it.");
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await invoke<AccountSummary>("admin_create_account", {
        token: adminToken,
        name: createName,
        email: createEmail,
        password: createPassword,
      });
      setAccounts((current) => [created, ...current]);
      setCreateName("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateOpen(false);
      setNotice(`Created ${created.name}'s account.`);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (adminToken) {
      try { await invoke("admin_logout", { token: adminToken }); } catch { /* Session is discarded locally either way. */ }
    }
    setAdminToken("");
    setStage("login");
    setSelectedAccount(null);
    setDetails(null);
    onExit();
  }

  function selectAccount(account: AccountSummary) {
    setSelectedAccount(account);
    setDetails(null);
    setAccountPassword("");
    setEditPassword("");
    setShowDeleteConfirmation(false);
    setDeletePassword("");
    setError("");
  }

  return (
    <main className="admin-shell" data-theme={theme}>
      <header className="admin-topbar">
        <button className="admin-back" type="button" onClick={stage === "login" ? onExit : signOut}>
          <ArrowLeft size={16} /> <span>{stage === "login" ? "Back to Daymark" : "Sign out"}</span>
        </button>
        <div className="admin-brand"><span className="brand-mark">d</span><span>daymark</span><i /> <small>ADMINISTRATION</small></div>
        <span className="admin-local-label"><ShieldCheck size={14} /> Local console</span>
      </header>

      {stage === "login" && (
        <section className="admin-auth-wrap">
          <div className="admin-auth-card">
            <div className="admin-auth-mark"><LockKeyhole size={22} /></div>
            <p className="eyebrow">RESTRICTED AREA</p>
            <h1>Administrator access</h1>
            <p className="admin-lede">Manage Daymark accounts stored on this device.</p>
            <form className="admin-form" onSubmit={(event) => void login(event)}>
              <div className="field-group">
                <label className="field-label" htmlFor="admin-username">Username</label>
                <input id="admin-username" className="field-input" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} autoComplete="username" required autoFocus />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="admin-password">Administrator password</label>
                <input id="admin-password" className="field-input" type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" placeholder="Enter administrator password" required autoFocus />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button className="button button-dark button-full" type="submit" disabled={busy}>{busy ? "Checking…" : "Continue"}<ArrowRight size={15} /></button>
            </form>
            <p className="admin-footnote">First-run sign-in uses the bootstrap credentials. You will be required to replace the default password.</p>
          </div>
        </section>
      )}

      {stage === "change-password" && (
        <section className="admin-auth-wrap">
          <div className="admin-auth-card">
            <div className="admin-auth-mark"><KeyRound size={22} /></div>
            <p className="eyebrow">FIRST SIGN-IN</p>
            <h1>Secure this console.</h1>
            <p className="admin-lede">The default administrator password is temporary. Set a new password before managing accounts.</p>
            <form className="admin-form" onSubmit={(event) => void changeAdminPassword(event)}>
              <div className="field-group">
                <label className="field-label" htmlFor="admin-new-password">New password</label>
                <input id="admin-new-password" className="field-input" type="password" value={newAdminPassword} onChange={(event) => setNewAdminPassword(event.target.value)} minLength={10} autoComplete="new-password" placeholder="At least 10 characters" required />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="admin-confirm-password">Confirm password</label>
                <input id="admin-confirm-password" className="field-input" type="password" value={confirmAdminPassword} onChange={(event) => setConfirmAdminPassword(event.target.value)} minLength={10} autoComplete="new-password" required />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button className="button button-dark button-full" type="submit" disabled={busy}>{busy ? "Saving…" : "Set administrator password"}<Check size={15} /></button>
            </form>
          </div>
        </section>
      )}

      {stage === "dashboard" && (
        <div className="admin-content">
          <div className="admin-heading-row">
            <div>
              <p className="eyebrow">DEVICE ADMINISTRATION</p>
              <h1>Accounts</h1>
              <p>Review local accounts. Account contents stay locked until their password is verified.</p>
            </div>
            <div className="admin-heading-actions">
              <button className="button button-light" type="button" onClick={() => void loadAccounts().catch((caught) => setError(String(caught)))} disabled={busy}><RefreshCw size={14} /> Refresh</button>
              <button className="button button-dark" type="button" onClick={() => { setCreateOpen((value) => !value); setError(""); }}><Plus size={15} /> New account</button>
            </div>
          </div>

          {(error || notice) && (
            <div className={error ? "admin-message error" : "admin-message"} role="status">
              <span>{error || notice}</span>
              <button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss"><X size={15} /></button>
            </div>
          )}

          {createOpen && (
            <section className="admin-panel admin-create-panel">
              <div className="admin-panel-title"><div><p className="eyebrow">NEW LOCAL USER</p><h2>Create account</h2></div><button type="button" className="icon-button" onClick={() => setCreateOpen(false)} aria-label="Close"><X size={17} /></button></div>
              <form className="admin-create-form" onSubmit={(event) => void createAccount(event)}>
                <div className="field-group"><label className="field-label" htmlFor="create-user-name">Name</label><input id="create-user-name" className="field-input" value={createName} onChange={(event) => setCreateName(event.target.value)} maxLength={48} required /></div>
                <div className="field-group"><label className="field-label" htmlFor="create-user-email">Email</label><input id="create-user-email" className="field-input" type="email" value={createEmail} onChange={(event) => setCreateEmail(event.target.value)} required /></div>
                <div className="field-group"><label className="field-label" htmlFor="create-user-password">Temporary password</label><input id="create-user-password" className="field-input" type="password" value={createPassword} onChange={(event) => setCreatePassword(event.target.value)} minLength={8} required /></div>
                <button className="button button-dark" type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
              </form>
            </section>
          )}

          <div className="admin-stats-grid">
            <div className="admin-stat-card"><span>Local accounts</span><strong>{accounts.length}</strong><Users size={18} /></div>
            <div className="admin-stat-card"><span>Tasks stored</span><strong>{accounts.reduce((sum, account) => sum + account.taskCount, 0)}</strong><Check size={18} /></div>
          </div>

          <div className="admin-main-grid">
            <section className="admin-panel accounts-panel">
              <div className="admin-panel-title">
                <div><p className="eyebrow">LOCAL DATABASE</p><h2>Account directory</h2></div>
                <span className="admin-count">{filteredAccounts.length} shown</span>
              </div>
              <div className="admin-search"><Search size={15} /><input aria-label="Search accounts" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" /></div>
              <div className="admin-account-list">
                {filteredAccounts.map((account) => (
                  <article className={`admin-account-row ${selectedAccount?.id === account.id ? "active" : ""}`} key={account.id}>
                    <div className="admin-avatar"><UserRound size={17} /></div>
                    <div className="admin-account-copy"><strong>{account.name}</strong><span>{account.email}</span><small>{account.taskCount} {account.taskCount === 1 ? "task" : "tasks"}</small></div>
                    <button className="button button-light admin-open-button" type="button" onClick={() => selectAccount(account)}><Eye size={14} /> Manage</button>
                  </article>
                ))}
                {filteredAccounts.length === 0 && <div className="admin-empty"><Users size={22} /><strong>No accounts found</strong><span>Try another search.</span></div>}
              </div>
            </section>

            <section className="admin-panel admin-detail-panel">
              {!selectedAccount ? (
                <div className="admin-detail-empty"><div className="admin-empty-mark"><LockKeyhole size={20} /></div><p className="eyebrow">ACCOUNT DETAILS</p><h2>Select an account</h2><p>Choose an account from the directory, then verify its password to view private details.</p></div>
              ) : !details ? (
                <div className="admin-unlock">
                  <button className="admin-inline-back" type="button" onClick={() => setSelectedAccount(null)}><ArrowLeft size={14} /> Account directory</button>
                  <div className="admin-auth-mark small"><LockKeyhole size={20} /></div>
                  <p className="eyebrow">VERIFY ACCOUNT OWNER</p>
                  <h2>{selectedAccount.name}</h2>
                  <p className="admin-lede">Enter this account's current password to view its profile and task data.</p>
                  <form className="admin-form" onSubmit={(event) => void openAccount(event)}>
                    <div className="field-group"><label className="field-label" htmlFor="target-account-password">Account password</label><input id="target-account-password" className="field-input" type="password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} autoComplete="off" required autoFocus /></div>
                    <button className="button button-dark button-full" type="submit" disabled={busy}>{busy ? "Verifying…" : "Unlock account"}<ArrowRight size={15} /></button>
                  </form>
                  <p className="admin-footnote">The administrator password cannot replace the account owner's password.</p>
                </div>
              ) : (
                <div className="admin-account-details">
                  <button className="admin-inline-back" type="button" onClick={() => { setDetails(null); setAccountPassword(""); setError(""); }}><ArrowLeft size={14} /> Lock account details</button>
                  <div className="admin-panel-title"><div><p className="eyebrow">VERIFIED ACCOUNT</p><h2>{details.user.name}</h2><span className="admin-detail-email">{details.user.email}</span></div><span className="verified-pill"><ShieldCheck size={13} /> Verified</span></div>
                  <div className="admin-detail-stats"><div><strong>{details.todos.length}</strong><span>Tasks</span></div><div><strong>{details.lists.length}</strong><span>Lists</span></div><div><strong>{details.todos.filter((todo) => todo.completed).length}</strong><span>Completed</span></div></div>
                  <div className="admin-account-section"><p className="eyebrow">ACCOUNT INFORMATION</p>
                    <form className="admin-form admin-edit-form" onSubmit={(event) => void saveAccount(event)}>
                      <div className="field-group"><label className="field-label" htmlFor="edit-account-name">Display name</label><input id="edit-account-name" className="field-input" value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={48} required /></div>
                      <div className="field-group"><label className="field-label" htmlFor="edit-account-email">Email address</label><input id="edit-account-email" className="field-input" type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} required /></div>
                      <div className="field-group"><label className="field-label" htmlFor="edit-account-weather">Weather location</label><input id="edit-account-weather" className="field-input" value={editWeatherLocation} onChange={(event) => setEditWeatherLocation(event.target.value)} maxLength={100} placeholder="No location set" /></div>
                      <div className="field-group"><label className="field-label" htmlFor="edit-account-new-password">New password <span>Optional</span></label><input id="edit-account-new-password" className="field-input" type="password" value={newAccountPassword} onChange={(event) => setNewAccountPassword(event.target.value)} minLength={8} autoComplete="new-password" placeholder="Leave blank to keep the current password" /></div>
                      <div className="field-group"><label className="field-label" htmlFor="edit-account-current-password">Current account password <span>Required to save</span></label><input id="edit-account-current-password" className="field-input" type="password" value={editPassword} onChange={(event) => setEditPassword(event.target.value)} autoComplete="off" required /></div>
                      <button className="button button-dark button-full" type="submit" disabled={busy}>{busy ? "Saving…" : "Save account changes"}<Check size={14} /></button>
                    </form>
                  </div>
                  <div className="admin-account-section">
                    <div className="admin-panel-title"><div><p className="eyebrow">PRIVATE CONTENT</p><h3>Tasks and lists</h3></div><span className="admin-count">{details.todos.length} tasks</span></div>
                    <div className="admin-private-lists">{details.lists.map((list) => <span key={list.id}><i style={{ backgroundColor: list.color }} />{list.name}</span>)}</div>
                    <div className="admin-private-tasks">
                      {details.todos.slice(0, 8).map((todo) => <div className="admin-private-task" key={todo.id}><span className={todo.completed ? "done" : ""}>{todo.title}</span><small>{todo.listName} · {todo.dueDate}</small></div>)}
                      {details.todos.length > 8 && <p className="admin-more-tasks">And {details.todos.length - 8} more tasks</p>}
                      {details.todos.length === 0 && <p className="admin-more-tasks">This account has no tasks yet.</p>}
                    </div>
                  </div>
                  <div className="admin-danger-zone"><div><strong>Delete this account</strong><span>All tasks and lists belonging to this account will also be removed.</span></div><button className="button button-danger" type="button" onClick={() => { setShowDeleteConfirmation((value) => !value); setDeletePassword(""); }} disabled={busy}><Trash2 size={14} /> Delete</button></div>
                  {showDeleteConfirmation && <form className="admin-delete-confirm" onSubmit={(event) => void deleteAccount(event)}><div className="field-group"><label className="field-label" htmlFor="delete-account-password">Enter the account's current password</label><input id="delete-account-password" className="field-input" type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} autoComplete="off" required /></div><div><button className="button button-light" type="button" onClick={() => { setShowDeleteConfirmation(false); setDeletePassword(""); }}>Cancel</button><button className="button button-danger" type="submit" disabled={busy}>{busy ? "Deleting…" : "Confirm deletion"}</button></div></form>}
                </div>
              )}
            </section>
          </div>
          <footer className="admin-footer"><span>Daymark administration</span><span>Local accounts · This device only</span><button type="button" onClick={() => void signOut()}><LogOut size={13} /> Exit admin</button></footer>
        </div>
      )}
    </main>
  );
}
