# Team Gantt Chart

A shared, collapsible Gantt chart for a team, covering August 2026 through
May 2027 — plus a Time & Cost tab for logging hours and totaling project
cost. Static site (no build step) backed by Firebase Firestore for
live-synced data, gated behind Google Sign-In. Hosted on GitHub Pages — one
URL, nothing to install or run to use it.

## Using it (once it's set up)

Just open the GitHub Pages URL and sign in with Google. Edits sync to
everyone live — no reload, no save button, no local anything.

## One-time setup

**1. Create the Firebase project** (console.firebase.google.com):
   - Add project → any name → Google Analytics not needed.
   - Build → Firestore Database → Create database → any region → **production mode**.
   - Build → Authentication → Get started → enable the **Google** sign-in provider.
   - Project settings (gear icon) → Your apps → **`</>`** (Web) → register an app
     (skip the Firebase Hosting checkbox) → copy the `firebaseConfig` object.
   - If your Google account is on a Workspace/custom domain: go to
     console.cloud.google.com (same project) → APIs & Services → OAuth
     consent screen, and make sure **User type is "External"** — otherwise
     only accounts on your own domain can sign in, blocking teammates on
     plain Gmail.

**2. Fill in `src/firebase-config.js`** with the `firebaseConfig` values from
   step 1.

**3. Publish the security rules.** Paste the contents of `firestore.rules`
   into Firebase console → Firestore Database → Rules → **Publish** (no
   editing needed — access is driven entirely by the `members` collection in
   the database now, not a list in this file).

**4. Create the first member by hand** (this is the one step that can't
   happen through the app itself — the rules require you to already be a
   member to add members, so the very first one is a bootstrap exception).
   In Firebase console → Firestore Database → **Data** tab:
   - Start collection → Collection ID: `members`
   - Document ID: **your exact Google account email**
   - Add fields: `name` (string, your name), `color` (string, e.g. `#4C6EF5`),
     `role` (string, `admin`), `hourlyRate` (number, `0`), `order` (number, `0`)
   - Save.

   Everyone after you gets added from inside the app (⚙ Settings panel, as
   an admin) — no more console work needed for the rest of the team.

**5. Authorize the GitHub Pages domain** for sign-in: Firebase console →
   Authentication → Settings → Authorized domains → add your
   `<username>.github.io` domain (Google Sign-In's popup fails with an
   `auth/unauthorized-domain` error until this is added).

**6. Enable GitHub Pages** on this repo (Settings → Pages → deploy from the
   `master` branch, root folder) if not already on. Push, then visit the
   Pages URL and sign in with the email you used in step 4.

## Local development

To test changes before pushing:
```
node server.js
```
Then open `http://localhost:8080` (add that as an authorized domain too, the
same way as step 5, if you want sign-in to work locally). No install step —
`server.js` only uses Node's built-in `http` module; Firebase itself is
loaded from its CDN as ES modules, so there's still no `npm install` or
build step anywhere in this project.

## Team members & access

Anyone in the `members` collection can sign in and use the app — that's the
entire access list, managed from the ⚙ Settings panel:
- **Admins** can add or remove members, rename them, and grant/revoke admin.
- **Every member** sets their own hourly rate — nobody else can change it
  for them, admins included. That rate is used to auto-fill cost when they
  log time (still editable per entry).
- "Last edited by" on each task, and "logged by" on time entries, come
  automatically from whoever is signed in.

To remove your own admin status or delete yourself, have another admin do
it — the Settings panel deliberately won't let you do either to your own
account, so you can't accidentally lock yourself out.

## Time & Cost tab

A second tab alongside the Gantt chart. Log hours against a task (or leave
it general — materials, software, anything not tied to one task), with a
cost that auto-fills from your hourly rate and is editable per entry. Shows
running totals: total hours, total cost, and a breakdown by member. Anyone
can delete their own entries; admins can delete any entry.

## Backup / restore

**Export JSON** downloads a snapshot of the current shared data (groups,
tasks, members, time entries). **Import JSON** replaces the groups and tasks
for *everyone* with the contents of a file (membership isn't touched by
import — that stays admin-managed) — used for restoring a backup or
migrating from the old local-file version of this app. It asks for
confirmation since it's destructive for the whole team.

See `CLAUDE.md` for the full project brief and feature list.
