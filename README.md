# TrialWiz

A clinical trial finder for recruiting **cancer trials in India**, built on the public
[ClinicalTrials.gov Data API (v2)](https://clinicaltrials.gov/data-api/api). Three apps in one
codebase:

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

- The public app fetches **live** recruiting oncology trials with an India site directly from
  `clinicaltrials.gov/api/v2/studies` (CORS-enabled, no API key needed) — see
  [`src/api/clinicalTrials.ts`](src/api/clinicalTrials.ts). Results are cached in `localStorage`
  for 6 hours to avoid refetching ~200 studies on every page load; use "Refresh now" in the hero
  to force a resync.
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
  services/profiles.ts        doctor/coordinator profile + approval workflow (Firestore)
  services/trialSubmissions   coordinator trial submission, read/update/retire (Firestore)
  analytics/                  Firestore demand-log writer (public) + aggregator (admin)
  firebase.ts                 Firebase init, no-ops gracefully if env vars are unset
  pages/PublicSearch/         the public Trial Finder UI
  pages/Portal/               doctor/coordinator sign-up, approval, and add-trial UI
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
