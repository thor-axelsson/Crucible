# The Crucible app

Installable phone web app (PWA) for The Crucible at Inness. No build step.

## Try it now (demo mode)
Open `index.html` through any web server (for example `python3 -m http.server`, then visit http://localhost:8000).
Demo mode keeps data on that device only. Admin PIN starts as **1234**; change it in Admin > Data & connection.

## Go live (shared scores): Firebase, about 10 minutes
1. Go to https://console.firebase.google.com and sign in with a Google account. Click **Add project**, name it `crucible`, turn Google Analytics off, Create.
2. In the project, click the **</>** (Web) icon on the overview page. Nickname `crucible`, leave Hosting unchecked, **Register app**. Copy the `firebaseConfig` values shown.
3. Left menu > **Build > Firestore Database > Create database**. Pick a nearby region (us-east1 works for NYC), choose **Production mode**, Enable.
4. In Firestore, open the **Rules** tab, replace everything with the contents of `firestore.rules`, and **Publish**. (These rules are open to anyone with the link. After the event, change `true` to `false`.)
5. Open `config.js` and replace `export const FIREBASE = null;` with your config:
   ```js
   export const FIREBASE = { apiKey: '...', authDomain: '...', projectId: '...', storageBucket: '...', messagingSenderId: '...', appId: '...' };
   ```
   Change `EVENT_ID` each year (for example `crucible-2027`) to start with a clean slate.

## Host it (GitHub Pages, free)
1. Create a GitHub account if needed, then a **new public repository** named `crucible`.
2. Click **Add file > Upload files**, drag in everything inside this folder (not the folder itself), and **Commit**.
3. **Settings > Pages**: Source = **Deploy from a branch**, Branch = `main`, folder `/ (root)`, Save. After a minute your link is `https://<your-username>.github.io/crucible/`.
4. Open that link on a phone. iPhone: Safari > Share > **Add to Home Screen**. Android: Chrome menu > **Install app**.

## First-time checklist
1. Open the live link, Admin tab, PIN 1234, **Test connection** (should say Connected).
2. The usual eight players are preloaded (rename anyone to swap them out). Enter each handicap index; the draw unlocks when all eight are set. Course data holds par, stroke index, tee ratings and yardages.
3. **Make the pool draw**, then check **Edit pool teams** if you want different partners.
4. Everyone opens the link, taps their name, and sees their match.
5. After pool play: Admin > **Review & finalize group stage** (compare to the paper cards, tap any hole to fix it, then Finalize). That starts the semis and moves everyone to their semifinal. In semis, players can be given No score on a hole or Forfeit (WD); Admin can Unforfeit. After semis: **Start finals**. Ties go in Tiebreaks & playoffs.

## Notes
- Scores are last-write-wins: enter a hole again to fix it. Each entry stores who entered it and a timestamp (for the future highlight-reel idea).
- Offline: scores entered without signal queue on the phone and sync when it reconnects. Fonts and the Firebase library load from Google's CDNs the first time and are cached afterward.
- Tests: `npm test` (Node 20+) runs the rules engine tests.
- Next year's format: edit `js/preset.js` or the Format settings in Admin.
