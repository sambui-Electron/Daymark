use std::{collections::HashMap, fs, sync::Mutex};

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand_core::OsRng;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::{Manager, State};
use uuid::Uuid;

struct AppState {
    db: Mutex<Connection>,
    sessions: Mutex<HashMap<String, String>>,
    admin_sessions: Mutex<HashMap<String, bool>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct User {
    id: String,
    name: String,
    email: String,
    weather_location: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TaskList {
    id: String,
    name: String,
    color: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Todo {
    id: String,
    title: String,
    details: String,
    due_date: String,
    list_id: String,
    list_name: String,
    list_color: String,
    completed: bool,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthResponse {
    token: String,
    user: User,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminAuthResponse {
    token: String,
    must_change_password: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminAccountSummary {
    id: String,
    name: String,
    email: String,
    task_count: i64,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminAccountDetails {
    user: User,
    lists: Vec<TaskList>,
    todos: Vec<Todo>,
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| "The password could not be secured.".to_string())
}

fn verify_password(password: &str, stored_hash: &str) -> Result<(), String> {
    let parsed_hash = PasswordHash::new(stored_hash)
        .map_err(|_| "This account's password data could not be verified.".to_string())?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| "The password is incorrect.".to_string())
}

fn current_user_id(state: &AppState, token: &str) -> Result<String, String> {
    state
        .sessions
        .lock()
        .map_err(|_| "The session service is unavailable.".to_string())?
        .get(token)
        .cloned()
        .ok_or_else(|| "Your session has expired. Please sign in again.".to_string())
}

fn require_admin(state: &AppState, token: &str) -> Result<(), String> {
    let sessions = state
        .admin_sessions
        .lock()
        .map_err(|_| "The administrator session service is unavailable.".to_string())?;
    match sessions.get(token) {
        Some(true) => Ok(()),
        Some(false) => Err("Change the default administrator password before continuing.".into()),
        None => Err("The administrator session has expired. Please sign in again.".into()),
    }
}

fn read_user(connection: &Connection, user_id: &str) -> Result<User, String> {
    connection
        .query_row(
            "SELECT id, name, email, weather_location FROM users WHERE id = ?1",
            [user_id],
            |row| {
                Ok(User {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    email: row.get(2)?,
                    weather_location: row.get(3)?,
                })
            },
        )
        .map_err(|_| "The account could not be loaded.".to_string())
}

fn issue_session(state: &AppState, user: User) -> Result<AuthResponse, String> {
    let token = Uuid::new_v4().to_string();
    state
        .sessions
        .lock()
        .map_err(|_| "The session service is unavailable.".to_string())?
        .insert(token.clone(), user.id.clone());
    Ok(AuthResponse { token, user })
}

fn validate_account_fields(name: &str, email: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.trim().chars().count() > 48 {
        return Err("Please enter a name between 1 and 48 characters.".into());
    }
    if !email.contains('@') || email.len() > 254 || email.trim().is_empty() {
        return Err("Enter a valid email address.".into());
    }
    Ok(())
}

fn default_lists() -> [(&'static str, &'static str); 4] {
    [
        ("Personal", "#879a7c"),
        ("Work", "#b48c6b"),
        ("Study", "#8296b4"),
        ("Other", "#a18aaa"),
    ]
}

fn seed_user_lists(connection: &Connection, user_id: &str) -> Result<(), String> {
    let existing_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM task_lists WHERE user_id = ?1", [user_id], |row| row.get(0))
        .map_err(|_| "Task lists could not be checked.".to_string())?;

    // Seed the starter lists only for genuinely new accounts. Do not recreate
    // renamed or deleted lists every time the app starts.
    if existing_count == 0 {
        for (name, color) in default_lists() {
            let id = Uuid::new_v4().to_string();
            connection
                .execute(
                    "INSERT INTO task_lists (id, user_id, name, color) VALUES (?1, ?2, ?3, ?4)",
                    params![id, user_id, name, color],
                )
                .map_err(|_| "Task lists could not be initialized.".to_string())?;
            connection
                .execute(
                    "UPDATE todos SET list_id = ?1 WHERE user_id = ?2 AND list_id IS NULL AND category = ?3",
                    params![id, user_id, name],
                )
                .map_err(|_| "Existing tasks could not be assigned to their lists.".to_string())?;
        }
    }

    let fallback_id: String = connection
        .query_row(
            "SELECT id FROM task_lists WHERE user_id = ?1
             ORDER BY CASE name WHEN 'Personal' THEN 0 WHEN 'Work' THEN 1 WHEN 'Study' THEN 2 WHEN 'Other' THEN 3 ELSE 4 END,
                      created_at ASC, name ASC LIMIT 1",
            [user_id],
            |row| row.get(0),
        )
        .map_err(|_| "A default task list could not be found.".to_string())?;
    connection
        .execute(
            "UPDATE todos SET list_id = ?1 WHERE user_id = ?2 AND list_id IS NULL",
            params![fallback_id, user_id],
        )
        .map_err(|_| "Existing tasks could not be assigned to a list.".to_string())?;
    Ok(())
}

fn query_task_lists(connection: &Connection, user_id: &str) -> Result<Vec<TaskList>, String> {
    let mut statement = connection
        .prepare("SELECT id, name, color FROM task_lists WHERE user_id = ?1
         ORDER BY CASE name WHEN 'Personal' THEN 0 WHEN 'Work' THEN 1 WHEN 'Study' THEN 2 WHEN 'Other' THEN 3 ELSE 4 END,
                  created_at ASC, name COLLATE NOCASE ASC")
        .map_err(|_| "Task lists could not be loaded.".to_string())?;
    let rows = statement
        .query_map([user_id], |row| {
            Ok(TaskList {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })
        .map_err(|_| "Task lists could not be loaded.".to_string())?;
    rows.map(|row| row.map_err(|_| "A task list could not be read.".to_string()))
        .collect()
}

fn query_todos(connection: &Connection, user_id: &str) -> Result<Vec<Todo>, String> {
    let mut statement = connection
        .prepare(
            "SELECT t.id, t.title, t.details, t.due_date, COALESCE(l.id, ''),
                    COALESCE(l.name, t.category, 'Personal'), COALESCE(l.color, '#879a7c'),
                    t.completed, t.created_at
             FROM todos t LEFT JOIN task_lists l ON l.id = t.list_id
             WHERE t.user_id = ?1
             ORDER BY t.due_date ASC, t.created_at ASC",
        )
        .map_err(|_| "Tasks could not be loaded.".to_string())?;
    let rows = statement
        .query_map([user_id], |row| {
            Ok(Todo {
                id: row.get(0)?,
                title: row.get(1)?,
                details: row.get(2)?,
                due_date: row.get(3)?,
                list_id: row.get(4)?,
                list_name: row.get(5)?,
                list_color: row.get(6)?,
                completed: row.get::<_, i64>(7)? != 0,
                created_at: row.get(8)?,
            })
        })
        .map_err(|_| "Tasks could not be loaded.".to_string())?;
    rows.map(|row| row.map_err(|_| "A task could not be read.".to_string()))
        .collect()
}

fn verify_target_account_password(
    connection: &Connection,
    user_id: &str,
    password: &str,
) -> Result<(), String> {
    let stored_hash: Option<String> = connection
        .query_row(
            "SELECT password_hash FROM users WHERE id = ?1",
            [user_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "The account could not be checked.".to_string())?;
    let Some(stored_hash) = stored_hash else {
        return Err("That account no longer exists.".into());
    };
    verify_password(password, &stored_hash).map_err(|_| "The account password is incorrect.".to_string())
}

#[tauri::command]
fn register_user(
    state: State<'_, AppState>,
    name: String,
    email: String,
    password: String,
) -> Result<AuthResponse, String> {
    let name = name.trim().to_string();
    let email = email.trim().to_lowercase();
    validate_account_fields(&name, &email)?;
    if password.chars().count() < 8 {
        return Err("Your password must contain at least 8 characters.".into());
    }
    if password.len() > 256 {
        return Err("That password is too long.".into());
    }
    let password_hash = hash_password(&password)?;
    let id = Uuid::new_v4().to_string();
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    let existing: Option<String> = connection
        .query_row("SELECT id FROM users WHERE email = ?1", [&email], |row| row.get(0))
        .optional()
        .map_err(|_| "The local database could not be read.".to_string())?;
    if existing.is_some() {
        return Err("An account with this email already exists.".into());
    }
    connection
        .execute(
            "INSERT INTO users (id, name, email, password_hash) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, email, password_hash],
        )
        .map_err(|_| "The account could not be created. Please try again.".to_string())?;
    seed_user_lists(&connection, &id)?;
    let user = read_user(&connection, &id)?;
    drop(connection);
    issue_session(&state, user)
}

#[tauri::command]
fn login_user(
    state: State<'_, AppState>,
    email: String,
    password: String,
) -> Result<AuthResponse, String> {
    let email = email.trim().to_lowercase();
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    let account: Option<(String, String)> = connection
        .query_row(
            "SELECT id, password_hash FROM users WHERE email = ?1",
            [&email],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|_| "The local database could not be read.".to_string())?;
    let Some((user_id, stored_hash)) = account else {
        return Err("The email or password is incorrect.".into());
    };
    if verify_password(&password, &stored_hash).is_err() {
        return Err("The email or password is incorrect.".into());
    }
    let user = read_user(&connection, &user_id)?;
    drop(connection);
    issue_session(&state, user)
}

#[tauri::command]
fn logout_user(state: State<'_, AppState>, token: String) -> Result<(), String> {
    state.sessions.lock().map_err(|_| "The session service is unavailable.".to_string())?.remove(&token);
    Ok(())
}

#[tauri::command]
fn list_task_lists(state: State<'_, AppState>, token: String) -> Result<Vec<TaskList>, String> {
    let user_id = current_user_id(&state, &token)?;
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    query_task_lists(&connection, &user_id)
}

#[tauri::command]
fn create_task_list(
    state: State<'_, AppState>,
    token: String,
    name: String,
    color: String,
) -> Result<TaskList, String> {
    let user_id = current_user_id(&state, &token)?;
    let name = name.trim().to_string();
    if name.is_empty() || name.chars().count() > 32 {
        return Err("List names must contain between 1 and 32 characters.".into());
    }
    if !is_valid_color(&color) {
        return Err("Choose a valid list color.".into());
    }
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    let id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO task_lists (id, user_id, name, color) VALUES (?1, ?2, ?3, ?4)",
            params![id, user_id, name, color],
        )
        .map_err(|_| "A list with that name may already exist.".to_string())?;
    Ok(TaskList { id, name, color })
}

#[tauri::command]
fn update_task_list(
    state: State<'_, AppState>,
    token: String,
    id: String,
    name: String,
    color: String,
) -> Result<TaskList, String> {
    let user_id = current_user_id(&state, &token)?;
    let name = name.trim().to_string();
    if name.is_empty() || name.chars().count() > 32 {
        return Err("List names must contain between 1 and 32 characters.".into());
    }
    if !is_valid_color(&color) {
        return Err("Choose a valid list color.".into());
    }
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    let changed = connection
        .execute(
            "UPDATE task_lists SET name = ?1, color = ?2 WHERE id = ?3 AND user_id = ?4",
            params![name, color, id, user_id],
        )
        .map_err(|_| "A list with that name may already exist.".to_string())?;
    if changed == 0 {
        return Err("That list could not be found.".into());
    }
    connection.execute(
        "UPDATE todos SET category = ?1 WHERE list_id = ?2 AND user_id = ?3",
        params![name, id, user_id],
    ).map_err(|_| "The list was renamed, but some tasks could not be updated.".to_string())?;
    Ok(TaskList { id, name, color })
}

#[tauri::command]
fn delete_task_list(state: State<'_, AppState>, token: String, id: String) -> Result<(), String> {
    let user_id = current_user_id(&state, &token)?;
    let mut connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM task_lists WHERE user_id = ?1", [&user_id], |row| row.get(0))
        .map_err(|_| "Task lists could not be checked.".to_string())?;
    if count <= 1 {
        return Err("Keep at least one list in your account.".into());
    }
    let fallback: String = connection
        .query_row(
            "SELECT id FROM task_lists WHERE user_id = ?1 AND id <> ?2
             ORDER BY CASE name WHEN 'Personal' THEN 0 WHEN 'Work' THEN 1 WHEN 'Study' THEN 2 WHEN 'Other' THEN 3 ELSE 4 END,
                      created_at ASC, name ASC LIMIT 1",
            params![user_id, id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "A replacement list could not be found.".to_string())?
        .ok_or_else(|| "A replacement list could not be found.".to_string())?;
    let transaction = connection.transaction().map_err(|_| "The list could not be changed.".to_string())?;
    let fallback_name: String = transaction
        .query_row("SELECT name FROM task_lists WHERE id = ?1", [&fallback], |row| row.get(0))
        .map_err(|_| "A replacement list could not be found.".to_string())?;
    transaction.execute(
        "UPDATE todos SET list_id = ?1, category = ?2 WHERE user_id = ?3 AND list_id = ?4",
        params![fallback, fallback_name, user_id, id],
    ).map_err(|_| "Tasks could not be moved to the replacement list.".to_string())?;
    let changed = transaction.execute("DELETE FROM task_lists WHERE id = ?1 AND user_id = ?2", params![id, user_id])
        .map_err(|_| "The list could not be deleted.".to_string())?;
    if changed == 0 {
        return Err("That list could not be found.".into());
    }
    transaction.commit().map_err(|_| "The list could not be deleted.".to_string())
}

fn is_valid_color(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}

#[tauri::command]
fn list_todos(state: State<'_, AppState>, token: String) -> Result<Vec<Todo>, String> {
    let user_id = current_user_id(&state, &token)?;
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    query_todos(&connection, &user_id)
}

#[tauri::command]
fn create_todo(
    state: State<'_, AppState>,
    token: String,
    title: String,
    details: String,
    due_date: String,
    list_id: String,
) -> Result<Todo, String> {
    let user_id = current_user_id(&state, &token)?;
    let title = title.trim().to_string();
    if title.is_empty() || title.chars().count() > 120 {
        return Err("A task title must contain between 1 and 120 characters.".into());
    }
    if due_date.len() != 10 || !due_date.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("Choose a valid due date.".into());
    }
    let details = details.trim().chars().take(500).collect::<String>();
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    let list: Option<(String, String)> = connection
        .query_row(
            "SELECT name, color FROM task_lists WHERE id = ?1 AND user_id = ?2",
            params![list_id, user_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|_| "The selected list could not be checked.".to_string())?;
    let Some((list_name, _)) = list else {
        return Err("Choose one of your own lists.".into());
    };
    let id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO todos (id, user_id, title, details, due_date, category, list_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, user_id, title, details, due_date, list_name, list_id],
        )
        .map_err(|_| "The task could not be saved.".to_string())?;
    query_todos(&connection, &user_id)?
        .into_iter()
        .find(|todo| todo.id == id)
        .ok_or_else(|| "The task was saved but could not be reloaded.".to_string())
}

#[tauri::command]
fn set_todo_completed(
    state: State<'_, AppState>,
    token: String,
    id: String,
    completed: bool,
) -> Result<(), String> {
    let user_id = current_user_id(&state, &token)?;
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    let changed = connection.execute(
        "UPDATE todos SET completed = ?1 WHERE id = ?2 AND user_id = ?3",
        params![if completed { 1 } else { 0 }, id, user_id],
    ).map_err(|_| "The task could not be updated.".to_string())?;
    if changed == 0 { return Err("That task could not be found.".into()); }
    Ok(())
}

#[tauri::command]
fn delete_todo(state: State<'_, AppState>, token: String, id: String) -> Result<(), String> {
    let user_id = current_user_id(&state, &token)?;
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    let changed = connection.execute(
        "DELETE FROM todos WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
    ).map_err(|_| "The task could not be deleted.".to_string())?;
    if changed == 0 { return Err("That task could not be found.".into()); }
    Ok(())
}

#[tauri::command]
fn update_weather_location(
    state: State<'_, AppState>,
    token: String,
    location: String,
) -> Result<User, String> {
    let user_id = current_user_id(&state, &token)?;
    let location = location.trim().to_string();
    if location.chars().count() > 100 {
        return Err("Please use a shorter city or location name.".into());
    }
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    connection.execute(
        "UPDATE users SET weather_location = ?1 WHERE id = ?2",
        params![location, user_id],
    ).map_err(|_| "The weather location could not be saved.".to_string())?;
    read_user(&connection, &user_id)
}

// The local administrator is seeded once. Its well-known bootstrap password is
// immediately forced to change on the first successful sign-in.
#[tauri::command]
fn admin_login(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> Result<AdminAuthResponse, String> {
    let username = username.trim().to_lowercase();
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    let record: Option<(String, i64)> = connection
        .query_row(
            "SELECT password_hash, must_change_password FROM administrators WHERE username = ?1",
            [&username],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|_| "Administrator credentials could not be checked.".to_string())?;
    let Some((stored_hash, must_change)) = record else {
        return Err("The administrator username or password is incorrect.".into());
    };
    if verify_password(&password, &stored_hash).is_err() {
        return Err("The administrator username or password is incorrect.".into());
    }
    let token = Uuid::new_v4().to_string();
    state.admin_sessions.lock()
        .map_err(|_| "The administrator session service is unavailable.".to_string())?
        .insert(token.clone(), must_change == 0);
    Ok(AdminAuthResponse { token, must_change_password: must_change != 0 })
}

#[tauri::command]
fn admin_change_password(
    state: State<'_, AppState>,
    token: String,
    new_password: String,
) -> Result<(), String> {
    let sessions = state.admin_sessions.lock().map_err(|_| "The administrator session service is unavailable.".to_string())?;
    if !sessions.contains_key(&token) {
        return Err("The administrator session has expired. Please sign in again.".into());
    }
    drop(sessions);
    if new_password.chars().count() < 10 || new_password.len() > 256 {
        return Err("Use a new administrator password with at least 10 characters.".into());
    }
    let hash = hash_password(&new_password)?;
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    connection.execute(
        "UPDATE administrators SET password_hash = ?1, must_change_password = 0 WHERE username = 'admin'",
        [hash],
    ).map_err(|_| "The administrator password could not be changed.".to_string())?;
    state.admin_sessions.lock().map_err(|_| "The administrator session service is unavailable.".to_string())?.insert(token, true);
    Ok(())
}

#[tauri::command]
fn admin_list_accounts(state: State<'_, AppState>, token: String) -> Result<Vec<AdminAccountSummary>, String> {
    require_admin(&state, &token)?;
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    let mut statement = connection.prepare(
        "SELECT u.id, u.name, u.email, COUNT(t.id), u.created_at
         FROM users u LEFT JOIN todos t ON t.user_id = u.id
         GROUP BY u.id ORDER BY u.created_at DESC, u.name COLLATE NOCASE ASC"
    ).map_err(|_| "Accounts could not be loaded.".to_string())?;
    let rows = statement.query_map([], |row| Ok(AdminAccountSummary {
        id: row.get(0)?,
        name: row.get(1)?,
        email: row.get(2)?,
        task_count: row.get(3)?,
        created_at: row.get(4)?,
    })).map_err(|_| "Accounts could not be loaded.".to_string())?;
    rows.map(|row| row.map_err(|_| "An account could not be read.".to_string())).collect()
}

#[tauri::command]
fn admin_inspect_account(
    state: State<'_, AppState>,
    token: String,
    user_id: String,
    account_password: String,
) -> Result<AdminAccountDetails, String> {
    require_admin(&state, &token)?;
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    verify_target_account_password(&connection, &user_id, &account_password)?;
    let user = read_user(&connection, &user_id)?;
    let lists = query_task_lists(&connection, &user_id)?;
    let todos = query_todos(&connection, &user_id)?;
    Ok(AdminAccountDetails { user, lists, todos })
}

#[tauri::command]
fn admin_create_account(
    state: State<'_, AppState>,
    token: String,
    name: String,
    email: String,
    password: String,
) -> Result<AdminAccountSummary, String> {
    require_admin(&state, &token)?;
    let name = name.trim().to_string();
    let email = email.trim().to_lowercase();
    validate_account_fields(&name, &email)?;
    if password.chars().count() < 8 || password.len() > 256 {
        return Err("New account passwords must contain between 8 and 256 characters.".into());
    }
    let password_hash = hash_password(&password)?;
    let id = Uuid::new_v4().to_string();
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    connection.execute(
        "INSERT INTO users (id, name, email, password_hash) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, email, password_hash],
    ).map_err(|_| "An account with that email already exists.".to_string())?;
    seed_user_lists(&connection, &id)?;
    Ok(AdminAccountSummary { id, name, email, task_count: 0, created_at: "Just now".into() })
}

#[tauri::command]
fn admin_update_account(
    state: State<'_, AppState>,
    token: String,
    user_id: String,
    account_password: String,
    name: String,
    email: String,
    weather_location: String,
    new_password: Option<String>,
) -> Result<User, String> {
    require_admin(&state, &token)?;
    let name = name.trim().to_string();
    let email = email.trim().to_lowercase();
    validate_account_fields(&name, &email)?;
    let weather_location = weather_location.trim().to_string();
    if weather_location.chars().count() > 100 {
        return Err("Please use a shorter weather location.".into());
    }
    if let Some(ref password) = new_password {
        if password.chars().count() < 8 || password.len() > 256 {
            return Err("A new account password must contain at least 8 characters.".into());
        }
    }
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    verify_target_account_password(&connection, &user_id, &account_password)?;
    if let Some(password) = new_password {
        let password_hash = hash_password(&password)?;
        connection.execute(
            "UPDATE users SET name = ?1, email = ?2, weather_location = ?3, password_hash = ?4 WHERE id = ?5",
            params![name, email, weather_location, password_hash, user_id],
        ).map_err(|_| "The email address may already belong to another account.".to_string())?;
    } else {
        connection.execute(
            "UPDATE users SET name = ?1, email = ?2, weather_location = ?3 WHERE id = ?4",
            params![name, email, weather_location, user_id],
        ).map_err(|_| "The email address may already belong to another account.".to_string())?;
    }
    let updated_user = read_user(&connection, &user_id)?;
    drop(connection);
    state.sessions.lock().map_err(|_| "User sessions could not be refreshed.".to_string())?
        .retain(|_, session_user_id| session_user_id != &user_id);
    Ok(updated_user)
}

#[tauri::command]
fn admin_delete_account(
    state: State<'_, AppState>,
    token: String,
    user_id: String,
    account_password: String,
) -> Result<(), String> {
    require_admin(&state, &token)?;
    let connection = state.db.lock().map_err(|_| "The local database is unavailable.".to_string())?;
    verify_target_account_password(&connection, &user_id, &account_password)?;
    let changed = connection.execute("DELETE FROM users WHERE id = ?1", [&user_id])
        .map_err(|_| "The account could not be deleted.".to_string())?;
    if changed == 0 { return Err("That account could not be found.".into()); }
    drop(connection);
    state.sessions.lock().map_err(|_| "User sessions could not be refreshed.".to_string())?
        .retain(|_, session_user_id| session_user_id != &user_id);
    Ok(())
}

#[tauri::command]
fn admin_logout(state: State<'_, AppState>, token: String) -> Result<(), String> {
    state.admin_sessions.lock().map_err(|_| "The administrator session service is unavailable.".to_string())?.remove(&token);
    Ok(())
}

fn column_exists(connection: &Connection, table: &str, column: &str) -> Result<bool, rusqlite::Error> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
    for name in rows {
        if name? == column { return Ok(true); }
    }
    Ok(false)
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let database_path = app_data_dir.join("daymark.sqlite3");
            let connection = Connection::open(database_path)?;
            connection.execute_batch(
                "PRAGMA foreign_keys = ON;
                 CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    weather_location TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                 );
                 CREATE TABLE IF NOT EXISTS task_lists (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    name TEXT NOT NULL COLLATE NOCASE,
                    color TEXT NOT NULL DEFAULT '#879a7c',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    UNIQUE(user_id, name),
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                 );
                 CREATE TABLE IF NOT EXISTS todos (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    details TEXT NOT NULL DEFAULT '',
                    due_date TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'Personal',
                    list_id TEXT,
                    completed INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                 );
                 CREATE TABLE IF NOT EXISTS administrators (
                    username TEXT PRIMARY KEY COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    must_change_password INTEGER NOT NULL DEFAULT 1
                 );
                 CREATE INDEX IF NOT EXISTS idx_todos_user_due ON todos(user_id, due_date);
                 CREATE INDEX IF NOT EXISTS idx_lists_user ON task_lists(user_id);"
            )?;

            // Add fields to databases created by earlier Daymark versions.
            if !column_exists(&connection, "users", "created_at")? {
                connection.execute("ALTER TABLE users ADD COLUMN created_at TEXT NOT NULL DEFAULT ''", [])?;
            }
            connection.execute("UPDATE users SET created_at = datetime('now') WHERE created_at IS NULL OR created_at = ''", [])?;
            if !column_exists(&connection, "todos", "list_id")? {
                connection.execute("ALTER TABLE todos ADD COLUMN list_id TEXT", [])?;
            }

            let user_ids = {
                let mut statement = connection.prepare("SELECT id FROM users")?;
                let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
                rows.collect::<Result<Vec<_>, _>>()?
            };
            for user_id in user_ids {
                seed_user_lists(&connection, &user_id).map_err(std::io::Error::other)?;
            }

            let admin_exists: Option<String> = connection.query_row(
                "SELECT username FROM administrators WHERE username = 'admin'",
                [],
                |row| row.get(0),
            ).optional()?;
            if admin_exists.is_none() {
                let bootstrap_hash = hash_password("admin").map_err(std::io::Error::other)?;
                connection.execute(
                    "INSERT INTO administrators (username, password_hash, must_change_password) VALUES ('admin', ?1, 1)",
                    [bootstrap_hash],
                )?;
            }

            app.manage(AppState {
                db: Mutex::new(connection),
                sessions: Mutex::new(HashMap::new()),
                admin_sessions: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            register_user,
            login_user,
            logout_user,
            list_task_lists,
            create_task_list,
            update_task_list,
            delete_task_list,
            list_todos,
            create_todo,
            set_todo_completed,
            delete_todo,
            update_weather_location,
            admin_login,
            admin_change_password,
            admin_list_accounts,
            admin_inspect_account,
            admin_create_account,
            admin_update_account,
            admin_delete_account,
            admin_logout
        ])
        .run(tauri::generate_context!())
        .expect("error while running Daymark");
}
