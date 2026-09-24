# Native Build Backlog — changes that only take effect in an app-store build

> Anything here needs `npx cap sync` + a real iOS/Android rebuild to reach a device —
> a Vercel deploy does NOT ship these (per axioms.md §10, web vs native are separate
> deploy paths). Collected here instead of fixed on sight so they can be batched into
> one native release instead of triggering rebuilds one at a time.
>
> Add an entry the moment you find one, even mid-investigation of something else —
> don't fix it immediately. One `##`-heading entry per item, with **Found**/**Source**.

---

## NSPhotoLibraryUsageDescription wording is profile-photo-specific — 24.09.2026

**Found:** 24.09.2026 · **Source:** camera-picker fix verification (item 3, park-photo-picker audit) — David caught this while reviewing the iOS permission strings.

`ios/App/App/Info.plist` — `NSPhotoLibraryUsageDescription` reads: "אפליקציית OUT מבקשת גישה לגלריה שלך כדי לאפשר בחירת תמונת פרופיל..." ("...to allow choosing a **profile photo**"). Written when the only gallery-access caller was `ProfilePhotoUploader.tsx`. Since the park-contribution photo step (`Step3Photo.tsx`) now also goes through `Camera.getPhoto({source: Prompt})` (same permission, same plugin), this exact string is what the user sees when picking a park photo too — factually wrong in that context, though not a functional blocker (iOS doesn't scope the permission grant per call site, only per app).

**Fix (not done — needs a native build to ship):** reword to something generic, e.g. "אפליקציית OUT מבקשת גישה לגלריה שלך כדי לאפשר בחירת תמונות (לדוגמה: תמונת פרופיל או תמונה של מיקום שהוספת)." — no code change beyond the Info.plist string, but requires `npx cap sync` + a new iOS build to actually reach users (the current build already shows the old string to everyone until then).
