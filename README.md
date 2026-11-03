# Daymark

Daymark is a calm, minimal task planner for Windows. It helps you keep track of what needs doing today, what is coming up, and when it is due, with a monthly calendar and a small weather panel alongside your tasks.

Everything you create stays on your own computer: there is no cloud service and no sync. Daymark is built with Tauri 2, React, TypeScript, Tailwind CSS 4, Rust, and SQLite.

## Download Daymark for Windows

**[Download the latest Windows installer from GitHub Releases](https://github.com/sambui-Electron/Daymark/releases/latest)**

You do **not** need Node.js, Rust, Visual Studio Build Tools, or any other development software to use Daymark.

### Install

1. Open the [latest release](https://github.com/sambui-Electron/Daymark/releases/latest).
2. Scroll to the **Assets** section at the bottom of the release.
3. Download the `.exe` setup file (the NSIS installer, named similar to `Daymark_0.1.0_x64-setup.exe`). Do not download the "Source code" ZIP; that is for developers.
4. Run the downloaded file and follow the setup wizard.
5. Start Daymark from the **Daymark** folder in the Start menu.

### Notes

- **Administrator rights:** not normally required. The installer is configured to install for the current Windows user only.
- **Windows SmartScreen:** if Windows warns about an unrecognized app, check that you downloaded the file from this repository's Releases page, then choose **More info** and **Run anyway** if you are comfortable proceeding.
- **Installer missing?** If the release has no `.exe` under Assets, it has not been uploaded yet. Check back later or [open an issue](https://github.com/sambui-Electron/Daymark/issues). To run Daymark right now, you can [build it from source](#build-the-windows-installer).

## Features

- **Tasks:** add, complete, and delete tasks, each with a due date and optional notes.
- **Lists:** four starter lists (Personal, Work, Study, Other). Create, rename, recolor, and delete your own lists. Deleting a list moves its tasks to another list instead of removing them, and at least one list is always kept.
- **Views:** Today, one view per list, and All Tasks.
- **Monthly calendar:** see which days have tasks and select a date to view or add tasks for it.
- **Weather:** current conditions for a city you choose, including temperature, feels-like temperature, humidity, wind, daily high and low, and chance of precipitation. City names are suggested as you type.
- **Themes:** light and dark mode, remembered between launches.
- **Local accounts:** several people can keep separate accounts and tasks in the same installation.
- **Administrator console:** a local admin area for creating, inspecting, editing, and deleting accounts (see [Privacy and Data Storage](#privacy-and-data-storage)).

Daymark's calendar is its own in-app calendar. It does not sync with Google Calendar, Outlook, Apple Calendar, or CalDAV.

## Privacy and Data Storage

Daymark is local-first.

**Stays on your computer**

- Accounts, tasks, and lists are stored in a local SQLite database named `daymark.sqlite3`.
- Passwords are hashed with Argon2id and never stored in plain text.
- Sign-in sessions are held in memory only and end when you sign out or close the app.
- The database lives in Tauri's per-user application-data directory for the current Windows user. On Windows this is typically under `%APPDATA%`, in a folder named after the app identifier (`com.daymark.desktop`).
- Accounts are separate for each Windows user profile and are not shared between profiles.
- There is no hosted authentication server, remote database, password-reset service, or cross-device sync. If you lose the local data, accounts and tasks cannot be recovered, so back up the database file if it matters to you.

**Sent to external services**

- Weather uses [Open-Meteo](https://open-meteo.com/). When you search for or select a weather location, Daymark sends your search text and the coordinates of the selected place to Open-Meteo's geocoding and forecast APIs. Like any web request, this also exposes your IP address to that service.
- Daymark does not request device location access. Weather locations are always typed in by you.
- Task, list, and account data are never sent to Open-Meteo or anywhere else.

**Open-Meteo notice:** Open-Meteo's public API is intended for non-commercial use. If you distribute or use Daymark commercially, review the [Open-Meteo terms](https://open-meteo.com/en/terms) first. Weather data is provided by Open-Meteo.com.

**Uninstalling:** removing the app does not necessarily remove the data directory. Back it up before deleting it manually, and delete it if you want all local accounts and tasks gone.

### Local administrator console

Choose **Administrator access** on the sign-in screen to open the admin console. On a fresh database the bootstrap credentials are username `admin` and password `admin`. The first time you sign in, Daymark requires you to set a new password of at least 10 characters before the dashboard is shown.

The admin console can create accounts and list them (name, email, and task count). Inspecting an account's profile, lists, and task titles, editing an account, or deleting it (which also deletes its tasks and lists) each require entering that account's current password. Admin sessions are held in memory and end when the app closes or the administrator signs out.

**Security boundary:** this is an application-level gate, not a Windows administrator account or a hosted identity system. Anyone who can read the SQLite file directly or modify the installed application is outside its protection. It is not a substitute for Windows account permissions or full-disk encryption.

## Getting Started

1. **Launch Daymark** from the Start menu.
2. **Create an account.** On the sign-in screen, choose the create-account option and enter your name, email address, and a password of at least 8 characters. The email is only used as a local account name; nothing is sent to it.
3. **Sign in** with your email and password next time you open the app.
4. **Add a task.** Choose **New task**, enter a title, optional notes, a due date, and a list.
5. **Organize.** Use **Today**, the calendar, and your lists in the sidebar to see what is due. Complete a task by checking it off.
6. **Set your weather city** from the weather panel by searching for a city and picking a suggestion.

---

# For Contributors

Everything below is for people who want to build or modify Daymark. You do not need any of it to install and use the app.

## Technology Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Tauri 2 |
| Frontend | React 19, TypeScript, Vite 7 |
| Styling | Tailwind CSS 4, plus custom CSS in `src/index.css` |
| Backend | Rust (edition 2021) |
| Storage | SQLite via `rusqlite` (bundled) |
| Password hashing | Argon2id via the `argon2` crate |
| Weather | Open-Meteo forecast and geocoding APIs |
| Installer | NSIS, through the Tauri bundler |

## Development Prerequisites

1. **Node.js LTS**, version 20.19 or newer (or 22.12+), as required by Vite 7.
2. **Rust**, installed with [rustup](https://rustup.rs/), using the `stable-x86_64-pc-windows-msvc` toolchain.
3. **Visual Studio Build Tools** with the **Desktop development with C++** workload.
4. **Microsoft Edge WebView2 Runtime**, which is already present on most up-to-date Windows 10 and 11 systems.

See the official [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) for installation details.

## Clone and Install

```powershell
git clone https://github.com/sambui-Electron/Daymark.git
cd Daymark
npm install
```

## Run in Development Mode

```powershell
npm run tauri dev
```

This starts the Vite dev server on `127.0.0.1:1420` and opens the Daymark window. The first run compiles all Rust dependencies, which can take a few minutes. Later runs are much faster.

## Build the Windows Installer

```powershell
npm run tauri build
```

This builds the frontend, compiles the Rust app in release mode, and produces an NSIS setup executable in:

```text
src-tauri/target/release/bundle/nsis/
```

The installer is configured in `src-tauri/tauri.conf.json` (NSIS is the only bundle target):

- Installs per user (`installMode: currentUser`), so administrator rights are not normally needed.
- Creates a **Daymark** Start menu folder.
- English only, with the language selector hidden.
- Uses `icons/icon.ico` for the installer and uninstaller, `icons/installer-header.bmp` as the header image, and `icons/installer-sidebar.bmp` (164 × 314 px) as the Welcome and Finish page sidebar. `installer-sidebar-source.png` is the source artwork.

Build output is git-ignored. Do not commit installers to the repository; they are published as assets on [GitHub Releases](https://github.com/sambui-Electron/Daymark/releases) instead.

### Database migration

When an older Daymark database is opened, the app adds the list tables and columns and migrates existing Personal, Work, Study, and Other tasks into matching starter lists. Tasks with other older categories go into the first available list. Existing accounts and tasks are kept.

## Project Structure

```text
src/                        React interface
  main.tsx                  App entry point
  App.tsx                   Auth, dashboard, calendar, tasks, list management
  components/
    AdminConsole.tsx        Local administrator interface
  lib/
    weather.ts              Open-Meteo geocoding and forecast requests
  index.css                 Tailwind import and styling
src-tauri/                  Tauri and Rust application
  src/
    main.rs                 Native entry point
    lib.rs                  SQLite schema, migrations, accounts, lists,
                            tasks, sessions, and admin commands
  capabilities/default.json Tauri window permissions
  icons/                    App icons and installer artwork
  tauri.conf.json           Window, build, CSP, and NSIS bundle config
  Cargo.toml                Rust dependencies
index.html                  Vite HTML entry
vite.config.ts              Vite configuration (React, Tailwind, port 1420)
LICENSE                     GNU GPL v3
```

## Contributing

Contributions are welcome.

- **Report bugs** through [GitHub Issues](https://github.com/sambui-Electron/Daymark/issues). Please include your Windows version, the Daymark version, the steps to reproduce the problem, what you expected, and what happened instead. Screenshots help. Do not attach your database file or any personal data.
- **Suggest features** as an issue describing the problem you want solved. Keep in mind Daymark's local-first design: features that need a hosted service or remote sync are unlikely to fit.
- **Discuss major changes first.** For anything larger than a small fix, open an issue before writing code so the approach can be agreed.
- **Create a branch** from the main branch for each change, for example `fix/calendar-selection` or `feature/task-search`.
- **Test before submitting.** Run `npm run build` (type-checks and builds the frontend), run `cargo check` inside `src-tauri`, and try your change in `npm run tauri dev`. If you change installer settings, also run `npm run tauri build`.
- **Open a pull request** that explains what changed and why, links the related issue, and includes screenshots for visible changes.

## License

Daymark is licensed under the **GNU General Public License v3.0**. See [LICENSE](LICENSE) for the full text.
