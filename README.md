# Daywise

<img src="src/DayLog.Web/wwwroot/icons/icon-192.png" alt="Daywise logo" width="72">

_Learn from your days._

> The code base is called **DayLog** (project, namespaces, `daylog.db`, `DayLog:*` settings). That's the internal name; **Daywise** is the app's name everywhere you see it. They were kept apart on purpose: renaming the database file would make the app start with an empty database instead of your data.

A personal daily tracker for sleep, meals, caffeine, water, energy check-ins, activities and end-of-day reflections. After a few weeks of data it shows patterns, and it exports a summary you can paste into Claude for an honest review.

Single user, runs locally, no login (v1).

> **DayPrism (the mobile app)** is a React Native (Expo) rewrite for Android, with encrypted
> on-phone storage and sync. Each version has its own folder:
>
> | Folder | What it is |
> |---|---|
> | [`dayprism-v1/`](dayprism-v1/README.md) | **DayPrism 1.x**, the version going to the Play Store. Launch fixes only. |
> | [`dayprism-beta/`](dayprism-beta/README.md) | **DayPrism Beta**, where all new work happens (nutrition, next ideas). Installs next to the store app. |
> | [`supabase/`](supabase/) | Server database migrations and email templates, shared by every version. |
>
> A finished Beta feature moves into the release folder when it's ready. Later versions get their
> own folder (`dayprism-v2/`, …).

## Tech stack

| Piece | Choice | Why |
|---|---|---|
| Framework | ASP.NET Core 10, Razor Pages | Plain HTML per request. It copes better with patchy phone signal than Blazor Server's always-on connection. .NET 10 is LTS (supported to Nov 2028); .NET 8 support ends Nov 2026. |
| Database | SQLite via EF Core 10 | A single file that's easy to back up. Migrations track schema changes. |
| Charts | Chart.js (Phase 4) | Simple and works well on mobile. |
| Tests | xUnit, against in-memory SQLite | Tests run against the real schema and migrations. |

## Setup

1. Install the **.NET 10 SDK**: <https://dotnet.microsoft.com/download/dotnet/10.0>
   (or, without admin rights: `irm https://dot.net/v1/dotnet-install.ps1 -OutFile dotnet-install.ps1; ./dotnet-install.ps1 -Channel 10.0`, which installs to `%USERPROFILE%\.dotnet`. Add that folder to your PATH.)
2. Restore the local `dotnet-ef` tool (it's pinned in `dotnet-tools.json`):
   ```bash
   dotnet tool restore
   ```

## Run

```bash
dotnet run --project src/DayLog.Web --launch-profile http
```

Then open <http://localhost:5085>.

On first run the app creates `src/DayLog.Web/App_Data/daylog.db`, applies migrations and fills it with **14 days of demo data**, so the charts have something to show.

## Test

```bash
dotnet test
```

## Demo data vs real data

Every demo row has `IsSeed = 1`. On the **Settings** page you can:

- **Wipe demo data**: deletes only demo rows. Anything you logged yourself stays. Do this before you start using Daywise for real.
- **Re-generate demo data**: replaces the demo rows with a fresh 14 days ending today.

Demo data is only created automatically when the database file is brand new. Wiping it and restarting won't bring it back.

## Backup and restore

- **Backup:** Settings → *Download backup*, or open <http://localhost:5085/backup>. This uses SQLite's online backup API, so the copy is consistent even while the app is running.
- **Restore:** stop the app, delete `daylog.db-wal` and `daylog.db-shm` if they exist in `src/DayLog.Web/App_Data/`, replace `daylog.db` with the backup file (renamed to `daylog.db`), then start the app. SQLite keeps recent writes in the `-wal` file, so a leftover one would mix old changes into the restored database.

The database is git-ignored, so your personal data never ends up in the repo.

## Using the Today page

| Action | How |
|---|---|
| Energy check-in | Big blue button → three 1–5 rows, pre-filled with your last values → **Save**. |
| Meal | Type is guessed from the time of day. Tick **I skipped this meal** to log a skipped meal. |
| Caffeine | Pick the type. The mg is estimated automatically; type a number to override it. |
| Water | **+1 water** saves instantly. **Undo** in the toast removes it. |
| Activity | **Start activity** starts a timer. Starting another one stops the current one at the new start time. Tick **Already finished** to log a past activity with an end time. **Stop** ends the running one. |
| Sleep | Bed and wake times. A bedtime later on the clock than the wake time (23:30 vs 06:30) counts as the previous evening. Saving again the same morning updates it. |
| Reflection | Three prompts and a 1–5 day rating. Saving again updates it. |
| Timeline | Tap any block or marker to see its details or delete it. |

Every time field defaults to "now" in `DayLog:TimeZoneId` and can be changed before saving, for when you log late.

## Using the History page

- **Calendar:** Monday-first month grid. A cell's shade is that day's rating (darker means better in light mode, lighter means better in dark mode, as the legend shows). A small dot means something was logged but there's no rating yet. Hover or long-press a day for its summary. Future days can't be selected.
- **Selected day:** totals, the reflection, the timeline, and a list of every entry in time order.
- **Edit:** tap an entry in the list (or a timeline item, then **Edit**). The same sheet as on the Today page opens, pre-filled, with **Save changes** and **Delete**.
- **Add to a past day:** the **Add** chips create entries on the selected day (default time 12:00; activities default to "finished").
- **Times past midnight:** an activity whose end time is earlier on the clock than its start (23:30 → 00:30) ends the next day, and shows on both days.
- **Demo rows:** editing one makes it a real entry, so **Wipe demo data** keeps your edits.

## Using the Insights page

Pick a range (7 / 14 / 30 / 90 days, ending today). Each chart has a one-line takeaway, hover tooltips and a **Show data** table.

| Chart | How it's calculated |
|---|---|
| Sleep | One floating bar per night from bedtime (top) to wake time (bottom); bar length is the duration. Averages handle bedtimes either side of midnight. |
| Energy & sleepiness by hour | Average of all check-ins in each clock hour. The takeaway only uses hours with 3+ check-ins. |
| Energy after short vs long nights | Each day's average energy, grouped by the previous night: under 6h / 6–7h / 7h+. One value per day, so a day with many check-ins doesn't count more. |
| Last caffeine vs that night's sleep | One dot per day: time of the last caffeine, and the sleep you woke up from the next morning. Grouped as before 14:00 / 14–16 / after 16:00. |
| Breakfast vs energy before noon | Only days where breakfast was logged (eaten or skipped) and there's a check-in before 12:00. "Not logged" isn't counted as "skipped". |
| Time per activity per week | Weeks start on Monday. Activities are clipped to the week and range; a running one counts up to now. The chart groups the six colour families; the table shows every category. |
| Day rating trend | Each rating as a dot, plus a 7-day rolling average (needs 3+ ratings in the window). |

Comparisons need at least **2 days in each group** before a takeaway is drawn, and always say how many days they're based on. They are patterns in your data, not proof of cause and effect.

Chart.js 4.5.1 is served from `wwwroot/lib/chartjs` (no CDN), so the page also works offline.

## Using the Review page

1. **Pick a range:** last 30 days (default), this month, last month, last 7 days, or any from/to (up to a year). The URL holds the range (`/Review?from=2026-09-01&to=2026-09-30`), so you can bookmark it.
2. **Read the summary:** averages, best and hardest days (by day rating, with energy as the tie-break), streaks, the Insights patterns for that range, and every reflection. Tap a day to open it in History.
3. **Export for review:**
   - **Export for review (.zip):** the markdown summary plus the raw CSV, in one download.
   - **Copy summary:** puts the markdown on your clipboard. Paste it into Claude.
   - **Summary (.md)** / **Raw data (.csv)** on their own.

**Streak rules.** A day that a habit doesn't apply to (no breakfast logged, no sleep logged) neither extends nor breaks a streak. Today doesn't break a current streak until it's over.

**The markdown summary** is written as a brief for Claude. It opens with the request (what to change, what to improve, what you're doing well, experiments to try), then context: scales, time zone, work week, and a warning if any demo data is in the range. Then come the averages, patterns, streaks, best and hardest days, a day-by-day table, and all reflections.

**The CSV** has one row per entry (`kind` = sleep, meal, caffeine, water, checkin, activity, reflection), with columns that don't apply left empty. Times are given as local `HH:mm` and as ISO with offset (`2026-09-24T07:05:00+04:00`). It's UTF-8 with a BOM so Excel opens it correctly, and text starting with `=`, `+`, `-` or `@` is prefixed with `'` so Excel won't run it as a formula. **Settings → Export all data (.csv)** exports everything ever logged.

## Installable app (PWA)

Daywise is a Progressive Web App: it can be added to your phone's home screen and opens full screen, like a native app.

| Piece | File | What it does |
|---|---|---|
| Manifest | `wwwroot/manifest.json` | Name, icons, colours, "standalone" display, and long-press shortcuts (Check-in, Meal, Caffeine, +1 water). |
| Service worker | `wwwroot/sw.js` | Runs in the background and answers requests from a cache. Pages are network-first (fresh when online, last saved copy when offline); CSS/JS/icons are served from cache and refreshed in the background. The API, exports and backup are never cached. |
| Offline page | `wwwroot/offline.html` | Shown offline for pages you haven't opened before. |
| App behaviour | `wwwroot/js/pwa.js` | Registers the service worker, shows the offline banner, powers the Install button on Settings. |
| Icons | `wwwroot/icons/` | Generated by `tools/make-icons.ps1` (run `powershell -File tools/make-icons.ps1` to rebuild). The maskable icon keeps its artwork inside the safe zone Android crops to. |

**Offline, today:** pages you've visited open, and the timeline and charts show the last saved data. Saving needs a connection: a sheet stays open with what you typed and says "Couldn't reach Daywise", so nothing is lost. Queuing entries offline and syncing them later would be a possible next step.

**Updating the service worker:** if you change the caching strategy in `sw.js`, bump `VERSION` at the top. Old caches are deleted when the new version activates.

### Using Daywise on your phone

Browsers only allow installing (and service workers) on **https://** addresses, or `localhost` on the computer itself.

1. **Same Wi-Fi (quick look, no install).** Start the app listening on your network:
   ```bash
   dotnet run --project src/DayLog.Web --urls http://0.0.0.0:5085
   ```
   Then open `http://<your-PC's-IP>:5085` on the phone (allow it through Windows Firewall when asked). It works, but it's plain http, so there's no install and no offline mode.
2. **HTTPS tunnel (install and test on the phone).** For example, Microsoft Dev Tunnels: `devtunnel user login`, then `devtunnel host -p 5085`. This gives you an `https://…devtunnels.ms` address. By default only your own Microsoft account can open it. Keep it that way: **Daywise has no login yet**, so an anonymous tunnel would expose your data to anyone with the link.
3. **Deploy (daily use on the metro).** Azure App Service, AWS App Runner or similar give you https, so the app installs normally. **Add authentication first** (see "Later: auth and cloud" below): the app currently trusts everyone who can reach it.

Then install it:
- **iPhone (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** menu ⋮ → *Install app*, or the **Install Daywise** button on the Settings page.

## Settings page

| Section | What it does |
|---|---|
| You | Your name (used in the greeting) and appearance: System (follows the phone), Light or Dark. |
| Daily goals | Sleep hours, water glasses, meals and a caffeine limit. The rings on Today and History fill towards them; the caffeine ring turns red past the limit. |
| Time zone | What "now" and "today" mean. Takes effect immediately. Existing entries keep the time you logged them at. |
| Your data | Entry counts, database backup and CSV export of everything. |
| Demo data | Wipe or re-generate the demo rows (your own entries are never touched). |
| Delete all entries | Removes every entry, demo and real; you type `DELETE` to confirm. Settings are kept. Download a backup first. |

Preferences are stored in the database (`UserSettings` table, one row), so they're included in backups. Until you first save, they come from the `DayLog:*` section of `appsettings.json`.

## Credits

- Font: [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans), SIL Open Font License (`wwwroot/fonts/OFL.txt`), self-hosted.
- Icons: [Tabler Icons](https://tabler.io/icons), MIT, as a sprite in `wwwroot/icons/ui.svg`.
- Charts: [Chart.js](https://www.chartjs.org) 4.5.1, MIT (`wwwroot/lib/chartjs/LICENSE.md`).

## API

The Today page talks to small JSON endpoints. They only accept `Content-Type: application/json` (form posts get 415), which is what protects them from cross-site requests.

| Method & path | Body |
|---|---|
| `POST /api/checkins` | `{ time, energy, sleepiness, mood, note? }` |
| `POST /api/meals` | `{ time, mealType, description?, size?, skipped }` |
| `POST /api/caffeine` | `{ time, type, servings, caffeineMg? }` |
| `POST /api/water` | `{ time, glasses }` |
| `POST /api/activities` | `{ startTime, endTime?, category, notes? }` |
| `POST /api/activities/{id}/stop` | `{ endTime }` |
| `PUT /api/{checkins,meals,caffeine,water,activities}/{id}` | same body as the matching POST; replaces the entry (404 if it doesn't exist) |
| `PUT /api/sleep` | `{ wakeDate, bedTime, wakeTime, quality, timesWoken, notes? }` (one per morning) |
| `PUT /api/reflections` | `{ date, wentWell?, didntGoWell?, doDifferently?, dayRating }` (one per date) |
| `DELETE /api/entries/{kind}/{id}` | `kind` = sleep, meal, caffeine, water, checkin, activity, reflection |

Downloads (GET, `from`/`to` optional, `yyyy-MM-dd`):

| Path | Returns |
|---|---|
| `/export/review.zip` | summary `.md` + raw `.csv` for the range (default last 30 days) |
| `/export/review.md` | the summary; add `download=false` to get it as plain text instead of a file |
| `/export/data.csv` | raw entries for the range; with no `from`/`to`, everything ever logged |
| `/backup` | a consistent copy of the SQLite database |

Times are local and have no offset (`"2026-10-01T13:05:00"`). Enums are sent as names (`"DeepWork"`). Invalid input returns `400` with `{ "errors": { "field": ["message"] } }`.

## Configuration (`appsettings.json`)

| Key | Default | Meaning |
|---|---|---|
| `ConnectionStrings:DayLog` | `Data Source=App_Data/daylog.db` | Relative paths are resolved from the web project folder. |
| `DayLog:TimeZoneId` | `Asia/Dubai` | Every "now" in the app uses this zone, never the server's clock. |
| `DayLog:SeedNewDatabase` | `true` | Seed demo data when the DB is first created. |
| `DayLog:SeedDays` | `14` | How many days of demo data. |

Any key can be overridden with an environment variable, e.g. `DayLog__TimeZoneId=Europe/London`. The time zone and `DayLog:Targets` are only defaults: once you save the Settings page, its values win.

## How times are stored

Each entry stores its **local wall-clock time** (what your watch showed) plus the **UTC offset** in effect (`UtcOffsetMinutes`, 240 for Dubai).

- SQLite can't sort or filter EF's `DateTimeOffset` type in queries, but it handles local `DateTime` values fine. "Everything on 3 Oct" is the most common query in the app, so this keeps it simple and fast.
- The offset keeps the exact instant recoverable if you travel or the app moves to a cloud server running in UTC.

A night's sleep belongs to the day you **woke up**.

## Project layout

```
src/DayLog.Web/
  Domain/      Entities and enums. No EF or web dependencies.
  Data/        DbContext, migrations, demo-data generator, startup DB setup
  Services/    App logic: clock, day loading, timeline layout, entry rules, seeding, backup
  Api/         JSON endpoints for quick-add, and the backup download
  Pages/       Razor Pages UI. Shared partials: _EntrySheets (add/edit forms), _Timeline, _DayStats
  wwwroot/     site.css (design tokens, light/dark), js/daylog.js (Today + History), js/insights.js (charts),
               js/review.js, js/pwa.js, sw.js, manifest.json, offline.html, icons/
tools/make-icons.ps1  regenerates the app icons
tests/DayLog.Tests/   unit tests + HTTP integration tests (WebApplicationFactory)
```

The **timeline layout is calculated in C#** (`TimelineBuilder`): each item gets a start, a height and a column, in hours. The page only multiplies those by a CSS "pixels per hour" value. That keeps the positioning logic unit-testable and in one place.

## Database schema

| Table | Columns (plus `Id`, `CreatedAtUtc`, `UpdatedAtUtc`, `IsSeed`) |
|---|---|
| `SleepLogs` | BedTime, WakeTime, Quality 1–5, TimesWoken, Notes, UtcOffsetMinutes |
| `Meals` | Time, MealType, Description, Size, Skipped, UtcOffsetMinutes |
| `CaffeineIntakes` | Time, Type, Servings, CaffeineMg, UtcOffsetMinutes |
| `WaterIntakes` | Time, Glasses, UtcOffsetMinutes |
| `EnergyCheckIns` | Time, Energy 1–5, Sleepiness 1–5, Mood 1–5, Note, UtcOffsetMinutes |
| `Activities` | StartTime, EndTime (null while running), Category, Notes, UtcOffsetMinutes |
| `DailyReflections` | Date (unique), WentWell, DidntGoWell, DoDifferently, DayRating 1–5 |

Enums are stored as text (`"DeepWork"`, not `2`). Check constraints enforce the 1–5 ranges and that an end time comes after its start time.

### Changing the schema

```bash
dotnet ef migrations add <Name> --project src/DayLog.Web --output-dir Data/Migrations
```

The app applies pending migrations automatically on startup.

## Roadmap

- [x] Phase 1: project setup, schema, migrations, demo data, backup
- [x] Phase 2: Today page (quick-add + timeline)
- [x] Phase 3: History (calendar, edit/delete)
- [x] Phase 4: Insights charts
- [x] Phase 5: Monthly review and export (CSV + markdown)
- [x] Phase 6: PWA (install on phone)

### Later: auth and cloud

- **Auth:** add ASP.NET Core Identity and a `UserId` column through a migration. From Phase 2 on, queries live in services rather than in pages, so the user filter only has to go in one layer.
- **Cloud:** Azure App Service or AWS App Runner, with the connection string set by environment variable. Moving from SQLite to Postgres or Azure SQL means swapping the EF provider and regenerating migrations.
