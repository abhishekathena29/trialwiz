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
- **`/portal` — Provider Portal.** Doctors and trial coordinators sign up here. A coordinator
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
- A Principal Investigator can **close** a claimed trial site (their own claim, one at their
  hospital, or one by a coordinator they approved). The closure goes to the `closedTrials`
  repository and the `auditLog`; `useTrialCatalogue` drops every matching row, so the site leaves
  all active lists at once. The closing PI or an admin can reopen it. Coordinators can't close.
- When claiming a trial, the phone and email can each be **Public** (shown on the Trial Finder)
  or **Personal**. Personal values are never written to the publicly readable `trialClaims` doc —
  they go to `claimPrivateContacts/{claimId}`, readable only by the owner and admins — and the
  public listing falls back to the registry's own site contact.
- Phone numbers are collected when an account is created. PIs and doctors give two: a **public**
  phone (a PI's default contact number on the trials they claim) and a **private** one; other roles
  give one private phone. They live in `userContacts/{uid}`, owner + admin only, because PI
  profiles in `users/` are publicly readable for the coordinator sign-up lookup.
- Admins can create an account of any role from the admin dashboard; it's approved immediately.
  A new trial coordinator is linked to the PI the admin picks.
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
