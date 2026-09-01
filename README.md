# Team Gantt Chart

A shared, collapsible Gantt chart for a 5-person team, covering August 2026
through May 2027. No server, no accounts — the app and its data file are meant
to sit in a shared OneDrive folder, and OneDrive keeps everyone's copy in sync.

## Status

Not yet built. `CLAUDE.md` in this repo contains the full project brief —
open this folder in VS Code and run Claude Code to start building against it.

## Planned local setup (once built)

The app needs to be served over `http://localhost` rather than opened directly
as a file, so a small local server script will be included. Until that's built,
there's nothing to run yet.

## Where the data lives

Once built, place the app folder inside your shared OneDrive folder. All 5
users point their app at the same `gantt-data.json` file in that folder; each
person's OneDrive sync propagates their saves to the rest of the team.
