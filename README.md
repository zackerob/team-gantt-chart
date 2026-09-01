# Team Gantt Chart

A shared, collapsible Gantt chart for a 5-person team, covering August 2026
through May 2027. No server, no accounts — the app and its data file are meant
to sit in a shared OneDrive folder, and OneDrive keeps everyone's copy in sync.

## Running it

The app needs to be served over `http://localhost` rather than opened directly
as a file (`file://`), because the File System Access API requires a secure
context.

```
node server.js
```

Then open the printed `http://localhost:8080` URL (pass a different port as
an argument, e.g. `node server.js 3000`, if 8080 is taken). No install step —
`server.js` only uses Node's built-in `http` module.

## Where the data lives

Put this whole project folder inside your shared OneDrive folder, then click
**"Open Shared Folder…"** in the app and pick that folder. The app reads and
writes `gantt-data.json` there directly; OneDrive syncs the file to the rest
of the team. Each save also writes a timestamped `gantt-data.backup-*.json`
copy (the newest 15 are kept) so a bad overwrite is recoverable.

Browsers without the File System Access API (Firefox, Safari) can still use
the app via the **Import JSON** / **Export JSON** buttons as a manual
fallback — export after editing and share the file, import to pick up
someone else's changes.

## Notes

- Everyone should run the app pointed at the same shared folder. Two people
  saving at the same moment can still overwrite each other — the save status
  bar shows who last saved and when, and the rolling backups are the recovery
  path if that happens.
- Use **Reload** to pull in a teammate's latest saved changes without
  restarting the app.
- Team member names and "your name" (used for the last-edited-by stamp) are
  editable from the ⚙ Settings panel.

See `CLAUDE.md` for the full project brief.
