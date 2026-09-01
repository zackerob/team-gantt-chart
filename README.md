# Team Gantt Chart

A shared, collapsible Gantt chart for a 5-person team, covering August 2026
through May 2027. Static site (no build step) backed by Firebase Firestore for
live-synced data, gated behind Google Sign-In restricted to your team's
emails. Hosted on GitHub Pages — one URL, nothing to install or run to use it.

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

**2. Fill in `src/firebase-config.js`:**
   - Paste the `firebaseConfig` values in.
   - Set `ALLOWED_EMAILS` to the Google account email each of the 5 team
     members will sign in with.

**3. Fill in `firestore.rules`** with the same 5 emails, then paste its
   contents into Firebase console → Firestore Database → Rules → **Publish**.
   This is what actually enforces access — `firebase-config.js`'s list is only
   a client-side convenience for a friendlier "not authorized" message.

**4. Authorize the GitHub Pages domain** for sign-in: Firebase console →
   Authentication → Settings → Authorized domains → add your
   `<username>.github.io` domain (Google Sign-In's popup will fail with an
   `auth/unauthorized-domain` error until this is added).

**5. Enable GitHub Pages** on this repo (Settings → Pages → deploy from the
   `master` branch, root folder). Push, then visit the Pages URL.

## Local development

To test changes before pushing:
```
node server.js
```
Then open `http://localhost:8080` (add that as an authorized domain too, the
same way as step 4, if you want sign-in to work locally). No install step —
`server.js` only uses Node's built-in `http` module; Firebase itself is
loaded from its CDN as ES modules, so there's still no `npm install` or build
step anywhere in this project.

## Team members & assignees

Editable any time from the ⚙ Settings panel inside the app (renames the 5
assignee labels used throughout the chart). "Last edited by" on each task
comes automatically from whoever is signed in — no separate name to set.

## Backup / restore

**Export JSON** downloads a full snapshot of the current shared data.
**Import JSON** replaces *everyone's* data with the contents of a file — used
for restoring a backup or migrating from the old local-file version of this
app. It asks for confirmation since it's destructive for the whole team.

## Access control

Only the emails listed in both `src/firebase-config.js` and
`firestore.rules` can sign in and use the app. To add or remove someone,
update both files (and re-publish the rules in Firebase console).

See `CLAUDE.md` for the full project brief and feature list.
