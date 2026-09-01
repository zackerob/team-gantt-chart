# Team Gantt Chart — Project Brief

## Overview
Build a browser-based, collapsible Gantt chart app for tracking a shared project
timeline (August 2026 – May 2027) used by a team of 5 people.

> **Update (architecture pivot):** the original plan below was a no-backend app
> reading/writing a JSON file in a shared OneDrive folder via the File System
> Access API, with each person running a local server. The team found running a
> local server per-person too much friction and wanted "just a website." The app
> was migrated to Firebase (Firestore for data + Google Sign-In for access,
> restricted to an email allowlist) hosted on GitHub Pages — a single URL,
> nothing to run locally, live sync instead of a manual Reload button. See
> `README.md` for the current setup/run instructions and `firestore.rules` for
> the access-control rules. The features/UX goals below (collapsible groups,
> drag-to-resize, dependencies, etc.) are unchanged — only the persistence and
> hosting model changed. The "Data & Multi-User Access Strategy" and "Tech
> Stack" sections below describe the *original* OneDrive-file design and are
> kept for history; they no longer reflect how the app actually persists data.

## Users
5 named team members. Ask the user for their actual names before building the
assignee list; use placeholders ("Person 1"–"Person 5") until then, editable
later in a settings panel.

## Core Features (MVP)

1. **Gantt chart view**
   - Rows = tasks. Each row shows a horizontal bar spanning its start–end dates.
   - Tasks are organized into groups/phases. Groups are **collapsible/expandable**.

2. **Timeline header**
   - Standard calendar-year timeline across the top, showing months from
     **August 2026 through May 2027**.
   - Gridlines per week or month. A "today" marker if today falls in range.

3. **Task CRUD**
   - Add new tasks and groups.
   - Remove tasks.
   - Edit task name/details.

4. **Due date editing — two ways**
   - Manual: drag the start/end edges of a task's bar directly on the chart to
     resize/move it.
   - Typed: a date input in a task detail panel for precise entry.

5. **Assignees**
   - Each task can be assigned to one or more of the 5 users.
   - Show the assignee(s) on the bar (e.g. initials or a color swatch).

6. **Dependencies**
   - A task can depend on one or more other tasks.
   - Show a visual connector (arrow/line) from predecessor(s) to the dependent task.
   - UI to add/remove a dependency link between any two tasks.
   - Stretch/optional: warn, or auto-shift a task's dates, if a task it depends
     on moves past it. Flag this to the user as optional complexity rather than
     building it silently.

## Data & Multi-User Access Strategy

- No backend, no login. The team already shares a OneDrive folder.
- Store all Gantt data (tasks, dates, assignees, dependencies, collapse state)
  in a single JSON file (e.g. `gantt-data.json`) that lives in that shared
  OneDrive folder next to the app.
- Use the **File System Access API** (`showOpenFilePicker`, with the file handle
  persisted via IndexedDB so users don't have to repick it every session) so the
  app reads/writes that JSON file directly on disk. OneDrive then syncs the
  change to the other 4 people's machines.
- Provide a manual **"Reload"** button so a user can pull in a teammate's latest
  saved changes without restarting the app.
- Because there's no real-time sync or locking, two people saving at the same
  moment can overwrite each other. Mitigate with:
  - A visible "last edited by / last edited at" field, populated from the
    editing user's own name + local timestamp.
  - Rolling backups: write a timestamped copy (e.g.
    `gantt-data.backup-<timestamp>.json`) alongside the main file on each save,
    so a bad overwrite is recoverable.
- Provide **Import JSON / Export JSON** buttons as a fallback for browsers
  without File System Access API support (e.g. Firefox, Safari).
- The File System Access API generally needs a secure context (https, or
  localhost) — plain `file://` may not work reliably. Ship a trivial
  zero-dependency local server (Node's built-in `http` module or Python's
  `http.server`) so anyone can run the app at `http://localhost:PORT` with one
  command.

## Tech Stack

- Plain HTML/CSS/JavaScript. No frontend framework, no build step.
- Keep dependencies minimal — vanilla JS is preferred; only pull in a small
  utility/date library if it genuinely simplifies date math, and confirm with
  the user first.

## Suggested Nice-to-Haves (optional — confirm with the user before building)

- Task status (not started / in progress / done / blocked) with color coding.
- Progress % shown as a partial fill on the bar.
- Critical path highlighting.
- Zoom control (week vs. month view).
- Filter/search by assignee or status.
- Print / export to PDF or image, for sharing outside the team.
- Milestone markers (zero-duration, diamond-shaped tasks).

## Non-Goals for MVP

- No user accounts or authentication — OneDrive folder access is the access
  control.
- No live, Google-Docs-style collaborative cursors. This is a
  save-and-sync-via-OneDrive model, not real-time collaboration.

## Suggested Build Order

1. Scaffold `index.html`, `styles.css`, `app.js` (small modules as needed).
2. Build the static timeline header (Aug 2026–May 2027) with example rows.
3. Add task CRUD against in-memory state.
4. Add drag-to-resize on the chart and the typed date-input editing.
5. Add assignees (5 users).
6. Add dependency linking and connector-line rendering.
7. Wire up File System Access API read/write to the shared JSON file, plus the
   Import/Export fallback and the local server script.
8. Add collapsible groups last, once the task hierarchy exists.
9. Revisit the nice-to-haves list with the user.
