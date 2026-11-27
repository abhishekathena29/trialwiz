# TrialWizx
A clinical trial finder for recruiting **cancer trials in India**, built on the public
[ClinicalTrials.gov Data API (v2)](https://clinicaltrials.gov/data-api/api). Three apps in one
codebase:

- **`/login` — one login page for everyone.** Sign-in is just email + password; each account is
  routed by its role: admins to `/admin`, PIs/coordinators to `/portal`, everyone else back to the
  Trial Finder. The role (Individual, Doctor, Principal Investigator, Trial Coordinator) is only
  chosen when creating an account. `/portal` and `/admin` send signed-out visitors here.
- **`/` — public Trial Finder.** Browse recruiting cancer trials by cancer type or by centre, or
  search with facets (spread/metastatic, therapy line, biomarker). Location-aware (GPS or typed
  city + radius, or All India). No login.
- **`/portal` — Provider Portal.** PIs, Trial Team Doctors and trial coordinators sign up here. A coordinator
  names the doctor they work with at sign-up and stays pending until that doctor approves them;
  once approved, they can add clinical trials, which appear immediately in the public Trial
  Finder alongside the ClinicalTrials.gov data. See [`src/pages/Portal/`](src/pages/Portal/).
- **`/admin` — Demand Intelligence.** Internal, owner-only dashboard showing aggregate,
  de-identified search demand (what conditions/regions people are searching, and where demand
  goes unmet), plus a live Trial catalogue breakdown (cancer types, centres, registry vs.
  coordinator-submitted). Gated behind Firebase Auth + a Firestore allowlist. Never linked from
  the public app.

## How the data flows

- Registry trials live in Firestore `registryTrials`, one doc per study, from two sources:
  recruiting India oncology studies from `clinicaltrials.gov/api/v2/studies` (see
  [`src/api/clinicalTrials.ts`](src/api/clinicalTrials.ts)) and the CTRI oncology export at
  [`data/ctri-oncology-trials.csv`](data/ctri-oncology-trials.csv) (mapped in
  [`scripts/ctri.ts`](scripts/ctri.ts)). CTRI trials cross-registered on ClinicalTrials.gov are
  merged into the CT.gov record; CTRI rows the export tags "Peripheral (not an oncology question)"
  are stored but hidden from the public app. The CTRI export has no recruitment status, so those
  trials show as "Registered", not "Recruiting".
- Refresh the collection with `GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> npm run
  seed:registry` (add `-- --dry-run` to preview into `data/registry-preview.json`). It upserts
  every study and deletes ones no longer in either source. Deploy the read rule once with
  `firebase deploy --only firestore:rules`.
- The public app reads `registryTrials` and caches it in `localStorage` for 6 hours; "Refresh
  now" in the hero forces a reload. If Firestore holds no ClinicalTrials.gov rows (not seeded
  yet, rules not deployed), it falls back to the live API for those.
- ClinicalTrials.gov has no structured "cancer type", "therapy line", "metastatic", or
  "biomarker" field. Those facets are derived with keyword heuristics over each study's
  conditions/title/eligibility text — see [`src/data/cancerTaxonomy.ts`](src/data/cancerTaxonomy.ts)
  and the `detectMetastatic`/`detectLineOfTherapy` helpers in `clinicalTrials.ts`. Anything that
  doesn't match a known cancer type lands in "Other cancer" rather than being dropped.
- Centres are deduplicated with a normalizing key, not exact string match — see `centreKey` in
  [`src/utils/format.ts`](src/utils/format.ts). The same physical hospital is often registered
  under several free-text name variants across different studies (site codes, department
  suffixes, "Hospital" vs "Centre", diacritics); the key strips that noise so it collapses to one
  row in Browse-by-centre and the admin catalogue instead of several.
- Doctor/coordinator-submitted trials ([`src/services/trialSubmissions.ts`](src/services/trialSubmissions.ts))
  are stored in Firestore in the exact same shape as a registry trial and merged in live via
  [`src/hooks/useTrialCatalogue.ts`](src/hooks/useTrialCatalogue.ts) — the public list, search,
  and the admin catalogue stats all read from this one combined, always-current dataset.
- Trial sites can be **closed** by: an **admin** (any site, claimed or not — Trial Catalogue → Find & close
  a trial, or the Claimed Trials drill-down); an approved **Principal Investigator** (their own claim, one at
  their hospital, or one by a coordinator they approved); and whoever **submitted** a TW- trial, or their PI's
  team (Add New Trial → Your submitted trials). The closure goes to the `closedTrials` repository and the
  `auditLog`; `useTrialCatalogue` drops every matching row, so the site leaves all active lists at once.
  Whoever closed it, or an admin, can reopen it. Coordinators still can't close registry claims.
- When claiming a trial, the phone and email can each be **Public** (shown on the Trial Finder)
  or **Personal**. Personal values are never written to the publicly readable `trialClaims` doc —
  they go to `claimPrivateContacts/{claimId}`, readable only by the owner and admins — and the
  public listing falls back to the registry's own site contact.
- **Provider portal opens on "My Trials"**: the trials already on TrialWiz under that PI (for a coordinator,
  their PI) — registry sites whose investigator name/email matches (see `src/utils/piMatch.ts`), plus trials
  the team claimed or submitted. With none, a banner says no trials are actively recruiting under the team.
- **Passwords:** every signed-in account can change its own password (portal profile card, admin header,
  public Saved tab); the login page has "Forgot password?"; admins can email any account a reset link from
  Edit account. Nobody, admin included, can see or set someone else's password directly.
- **Admin outreach tracker:** a "Contacted" checkbox + private note on every doctor row, stored in the
  admin-only `adminContacts/{uid}` collection; the All Registered Doctors tab filters by it.
- Sponsor-masked site names ("Research Site", "Local Institution - 0012", "GSK Investigational Site"…) are
  flagged by `isPlaceholderFacility` — left out of the admin Top Centres chart and listed last in Browse by
  centre.
- Phone numbers are collected when an account is created. PIs and doctors give two: a **public**
  phone (a PI's default contact number on the trials they claim) and a **private** one; other roles
  give one private phone. They live in `userContacts/{uid}`, owner + admin only, because PI
  profiles in `users/` are publicly readable for the coordinator sign-up lookup.
- Admins can create an account of any role from the admin dashboard; it's approved immediately.
  A new trial coordinator is linked to the PI the admin picks.
- **Trial Team Doctors** are PI accounts (role `doctor`) with `piTitle: 'trialDoctor'` — every PI
  feature, verified the same way, only the label differs (admins can switch it in Edit account).
  A PI and the coordinators they approved form one **team**: members see the team's claims (no
  re-claiming what the PI already claimed) and can update a teammate's claim contact details,
  added locations and submitted trials. Team membership is `users/{uid}.doctorUid`, which only the
  PI's approval or an admin can set (see `sameTeamAs` in `firestore.rules`).
- **Bulk PI accounts:** `npm run create-pi-accounts` (dry run) previews an approved PI login for every
  PI email on the site's CTRI trials; add `-- --apply` with `GOOGLE_APPLICATION_CREDENTIALS` to create
  them. Sponsor/CRO contacts are skipped unless `--include-sponsors`. No emails are sent — passwords
  for new logins go to `private/` (gitignored). Safe to re-run.
- Every PI decision on a coordinator is logged in the append-only `teamApprovals`
  collection, in the same batch as the status change — the PI sees their team's log in the portal,
  admins see all of it under **Approval History** (alongside the PI authorization history).
- PIs and team members can **add a location** to any trial (`addedSites`, merged into the catalogue
  as an extra site of that study) and edit the location/contact of trials they submitted.
- The portal's hospital filter (`src/utils/hospitalMatch.ts`) requires every distinctive word of the
  hospital name to match and understands acronyms (AIIMS, RGCI), so a search for one hospital no
  longer returns others. Trial search also matches the site investigator's name.
- Admins can edit any account's name, hospital, city/state, specialization and phone numbers
  (audited); users can edit their own profile from the portal (a verified PI's hospital stays fixed).
- **Shared starting password:** `npm run set-initial-password` (Admin SDK; preview, then `-- --apply`)
  sets one password (default `123456`) on the bulk-created PI accounts and flags them
  `mustChangePassword` — the portal won't open until the doctor picks their own, so the shared
  password works once per account. Accounts that already signed in are skipped.
- **View as (admin):** Edit account → 👁 View as opens `/portal?viewAs=<uid>` — the portal exactly as
  that person sees it, read-only (buttons and form submits are blocked; filters and search work).
- **Claimed & Added Trials (admin tab):** every claim, every newly added trial and every added
  location in one list — who did it, when, the published contact — with one combined count.
- Admins can **delete an account** (Edit → Delete account…). They first choose what happens to linked
  coordinators (move to another PI or back to pending) and owned claims / submitted trials / added
  locations (transfer or delete); then the profile, phones and saved trials are removed and a
  `deletedAccounts` tombstone blocks sign-in. A browser can't delete another user's Firebase login,
  so `npm run purge-deleted-accounts` (Admin SDK) erases those afterwards and frees the email.
- **Merging accounts** (same person, two emails): admin → Accounts → ⇄ Merge accounts (or Edit → Merge…). Claims,
  submitted trials, added locations, coordinators and teammates' items move to the kept account; blank profile fields
  and phones are filled in; the removed email is kept in `mergedEmails` so its registry trials still show in My Trials;
  the other login is deleted (tombstoned). PIs/coordinators can ask for it from the portal (⇄ Merge another account):
  they sign in to the other account to prove it's theirs, and it lands under **Merge requests** for admin.
- **Signing up again after a rejection/revoke:** a rejected account's owner can sign up again with the same email and
  password under any role (e.g. registered as a Trial Team Doctor but is a coordinator) — the old profile is replaced by a
  new pending one. A deleted account stays blocked unless the admin ticked "Let this email sign up again".
- Admins can correct a submitted trial's or added location's hospital name, city and contact (Claimed & Added Trials →
  Edit); audited as `trial_edited`. Hospital fields on Add Trial / location forms suggest the standard hospital name.
- "Call nearest site" dials on phones; on a computer it just shows the number (with Copy) instead of opening FaceTime.
- Admins can change a PI into a Trial Coordinator (choosing the supervising PI) or promote a
  coordinator to PI from the Principal Investigator Accounts tab; both are audited.
- Every public search is silently logged as one aggregate, de-identified event (cancer type,
  coarse location label, facets, result count — never a name, phone, email, or device id) to a
  Firestore collection the public app can only **write** to, never read. The admin dashboard
  reads and aggregates it client-side.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in after creating the Firebase project below
npm run dev
```

The public app at `/` works immediately with no setup — it only talks to ClinicalTrials.gov.
`/admin`, `/portal`, and demand logging need a Firebase project:

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com), then
   **Project settings → General → Add app → Web app**. Copy the config values into `.env.local`
   (see `.env.example` for the variable names).
2. **Build → Firestore Database** → create a database (production mode, any region).
3. **Build → Authentication → Sign-in method** → enable **Email/Password**. `/portal` has its own
   sign-up flow for doctors and coordinators; `/admin` still expects the owner account to already
   exist (add yourself under the **Users** tab).
4. Deploy the rules in [`firestore.rules`](firestore.rules) — easiest via the Firebase console's
   Firestore **Rules** tab (paste the file contents and Publish), or with the Firebase CLI:
   ```bash
   firebase deploy --only firestore:rules
   ```
5. Grant yourself admin access: in Firestore, create a document in a new collection named
   `admins`, using your Auth user's **UID** (Authentication → Users tab) as the document ID. Any
   field works, e.g. `{ ok: true }`. Without this document, sign-in succeeds but the dashboard
   shows "Not authorised" — this is what keeps the demand data owner-only.
6. Restart `npm run dev` and open `/admin` or `/portal`.

Doctor/coordinator accounts need **no manual setup** — sign up directly at `/portal`. The first
time a doctor opens their dashboard, or a coordinator opens "Your submitted trials", Firestore may
show a one-time console error with a link to create a composite index (`role` + `requestedDoctorEmail`,
or `submittedBy` + `createdAt`) — click that link once to create it; the app works immediately
after.

## Project layout

```
src/
  api/clinicalTrials.ts       ClinicalTrials.gov v2 client, India filtering, facet heuristics
  data/                       cancer-type taxonomy, city coordinates for the location picker
  hooks/useIndiaCancerTrials  fetch + localStorage cache for the ClinicalTrials.gov dataset
  hooks/useTrialCatalogue     merges the API dataset with live doctor/coordinator submissions
  services/profiles.ts        doctor/coordinator profile + approval workflow, phones, role changes
  services/closedTrials.ts    PI trial closure + closed-trial repository
  services/audit.ts           append-only audit trail (closures, reopenings, role changes)
  services/trialSubmissions   coordinator trial submission, read/update/retire (Firestore)
  analytics/                  Firestore demand-log writer (public) + aggregator (admin)
  firebase.ts                 Firebase init, no-ops gracefully if env vars are unset
  pages/PublicSearch/         the public Trial Finder UI
  pages/Login/                the single login/sign-up page for all roles
  pages/Portal/               PI/coordinator dashboard: claims, closures, approvals, add-trial
  pages/Admin/                the Demand Intelligence dashboard + auth gate
firestore.rules               public logging, admin-only reads, portal profiles/submissions
```

## Known limitations

- Cancer-type, metastatic-status, and therapy-line facets are heuristic text matches, not
  structured registry data — treat them as "the registry record mentions X", not ground truth.
- Centre deduplication (`centreKey`) is a heuristic, not a curated alias table: it strips generic
  institutional words, trailing descriptors, and the row's own city name before keying. It merges
  the vast majority of name variants for the same physical centre, but a centre whose registry
  `city` field is itself inconsistent (e.g. a neighbourhood used instead of the city in some
  studies) can still appear twice, and two unrelated centres that happen to share one distinctive
  word in the same city could in rare cases be over-merged.
- TrialWiz doesn't independently verify a doctor's medical registration — coordinator approval is
  a trust relationship between the doctor and the coordinator they name, not an identity-checked
  credentialing system.
- No server component: Firestore security rules are the only thing enforcing "public writes,
  admins read." There's no Cloud Function pre-aggregation, so the admin dashboard aggregates
  client-side over the period's raw event count (fine at MVP volume; revisit if that grows large).
- This is an information directory, not a medical or eligibility tool. Only the trial's own
  investigator can determine eligibility — the UI says as much in the public app's footer.
