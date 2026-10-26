# Boston Book Club site

Static site served by GitHub Pages from `main` (root) at https://tobiasfk.github.io/boston-book-club.
Data lives in Firebase project `boston-book-club` (Firestore + Auth). No build step: edit files directly.

- `index.html`: the whole page (markup, styles, script). Talks to data only via `window.claude.use("db" | "user" | "assets")`.
- `firebase-adapter.js`: implements that interface on Firestore; also organizer sign-in, club password (`window.bbc`).
- `firestore.rules`: security rules. Not deployed automatically; the organizer pastes them into Firebase console → Firestore → Rules → Publish.

Access model: members sign in anonymously and unlock with a shared club password (`secrets/club`, `access/{uid}`);
the organizer (tobias.fabricius@gmail.com) signs in with Google and gets admin controls. Covers are data URLs in `covers/{id}`.
Ballots and suggestions are anonymous; per-device ownership is tracked privately under `data/users/{uid}/vote-{roundId}`.

Pushing to `main` publishes the site within about a minute. If a change needs new rules, tell the organizer to republish them.
