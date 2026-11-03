# Daymark

Daymark is a minimal desktop task planner built with **Tauri 2, React, TypeScript, Tailwind CSS 4, and Rust**.

## Features

- Local account creation and sign-in, with password hashing using Argon2id in the Rust backend.
- Per-account tasks and customizable lists stored in SQLite.
- Create, rename, recolor, and delete lists. When a list is deleted, its tasks are reassigned to another list instead of being removed.
- Four starter lists for new accounts: Personal, Work, Study, and Other.
- Today, list-specific task views, All Tasks, and a monthly calendar with task indicators and date selection.
- Add, complete, and delete tasks; each task has a due date and optional notes.
- City-based current weather from Open-Meteo, including temperature, feels-like temperature, humidity, wind, daily high/low, and precipitation probability.
- Searchable weather location suggestions powered by Open-Meteo geocoding.
- Persistent light and dark themes.
- A separate local administrator console for creating, inspecting, editing, and deleting accounts.
- A branded NSIS installer with a Daymark header graphic and a vertical sidebar illustration on the Welcome and Finish pages.

## Local administrator

Open **Administrator access** from the normal sign-in screen. On a fresh database, the bootstrap credentials are:

```text
Username: admin
Password: admin
```

The default password is intentionally temporary. After the first successful sign-in, Daymark requires the administrator to set a new password with at least 10 characters before showing the admin dashboard.

The admin console can:

- Create local user accounts.
- View the account directory and basic account metadata.
- Inspect a user's profile, task lists, and task titles only after entering that user's current account password.
- Edit the account name, email, weather location, or password. Saving changes requires entering the account's current password again.
- Delete an account only after entering that account's current password. Deleting an account also deletes its tasks and lists.

The administrator password and user passwords are stored as Argon2id hashes, not plaintext. Admin sessions are held in memory and end when the application closes or the administrator signs out.

**Security boundary:** this is an application-level local administration gate, not a Windows administrator account, Windows access-control boundary, or hosted identity system. The account directory shows basic metadata (name, email, and task count) so the administrator can choose an account; the profile and task content are password-gated as described above. Anyone with direct access to the local SQLite file or the ability to modify the installed application is outside this app-level protection model.

## Important scope notes

- There is no hosted authentication server, remote database, password-reset service, or cross-device sync.
- Accounts are separate inside the Daymark data store for the current Windows user profile. The app currently uses Tauri's per-user application-data directory; it does not share accounts across different Windows sign-in profiles on the same computer.
- The sign-in session is held in application memory and ends when the app closes or the user signs out.
- The calendar is an in-app calendar for Daymark tasks. It does not sync with Apple Calendar, Google Calendar, Outlook, or CalDAV.
- Weather locations are entered by the user. Daymark does not request device location access.
- Open-Meteo is used for location lookup and weather data. Its public service is intended for non-commercial use; review its terms before distributing or using this app commercially.

## Requirements on Windows

1. Install Node.js LTS (Node 20.19+ is recommended for this Vite setup).
2. Install Rust using rustup and select the `stable-x86_64-pc-windows-msvc` toolchain.
3. Install Visual Studio Build Tools with **Desktop development with C++**.
4. Ensure the Microsoft Edge WebView2 Runtime is installed (it is present on most supported Windows 10/11 systems).

Official prerequisites: <https://v2.tauri.app/start/prerequisites/>

## Run in development

From the project directory:

```powershell
npm install
npm run tauri dev
```

The first Rust build can take a few minutes while Cargo downloads and compiles dependencies.

## Build a Windows installer

The project is configured to produce a branded NSIS setup executable. It uses the Daymark app icon, a small header graphic, and a 164 × 314 px vertical sidebar bitmap shown on the installer's Welcome and Finish pages. It creates a Daymark Start Menu folder and installs for the current Windows user by default, so it does not normally require administrator privileges.

```powershell
npm run tauri build
```

The Windows setup executable is written under:

```text
src-tauri/target/release/bundle/nsis/
```

The vertical image is `src-tauri/icons/installer-sidebar.bmp`; the header graphic is `src-tauri/icons/installer-header.bmp`. The standard Tauri NSIS installer is intentionally retained instead of replacing it with a fully custom NSIS template.

## Existing database migration

When an earlier Daymark database is opened, the app adds the list metadata columns/tables and migrates existing Personal, Work, Study, and Other tasks into matching starter lists. Older task categories that do not match a starter list are placed into the first available list. Existing account and task records are retained.

## Project structure

```text
src/                 React interface and Open-Meteo client
  App.tsx            Authentication, dashboard, calendar, tasks, and list management
  components/
    AdminConsole.tsx Separate local administrator interface
  index.css          Tailwind import and visual styling
  lib/weather.ts     Open-Meteo geocoding and forecast requests
src-tauri/           Tauri and Rust application
  src/lib.rs         SQLite schema, migrations, accounts, lists, sessions, and admin commands
  tauri.conf.json    Window, frontend, bundle, and CSP configuration
  icons/
    installer-sidebar.bmp  NSIS Welcome/Finish sidebar artwork
```

## Data location

The SQLite database is named `daymark.sqlite3` and is created in Tauri's per-user application-data directory. Removing the app does not necessarily remove this data directory; back it up before deleting it manually.

## Security notes

- User and administrator passwords are hashed with Argon2id and are never stored in plaintext.
- Rust commands require backend-issued, in-memory session tokens for user and administrator operations.
- User task/list queries are scoped to the authenticated account ID.
- Admin access is a local application feature, not a substitute for Windows account permissions or full-disk encryption.
- The app does not implement remote account recovery. Losing local app data means losing local accounts and tasks unless the database has been backed up.
