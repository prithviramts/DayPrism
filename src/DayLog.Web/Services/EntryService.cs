using DayLog.Web.Data;
using DayLog.Web.Domain;
using Microsoft.EntityFrameworkCore;

namespace DayLog.Web.Services;

/// <summary>
/// Creates, updates and deletes entries. Every write goes through here, so validation and rules
/// (one running activity at a time, one sleep per morning, ...) live in one place.
/// Add and Update share one Apply method per entry type, so they can't drift apart.
/// </summary>
public sealed class EntryService(DayLogDbContext db, LocalClock clock)
{
    // ---------------------------------------------------------------- check-ins
    public Task<EnergyCheckIn> AddCheckInAsync(CheckInRequest r, CancellationToken ct = default) =>
        AddAsync(Apply(new EnergyCheckIn(), r), r.Time, ct);

    public Task<EnergyCheckIn?> UpdateCheckInAsync(int id, CheckInRequest r, CancellationToken ct = default) =>
        UpdateAsync(db.EnergyCheckIns, id, e => Apply(e, r), r.Time, ct);

    private static EnergyCheckIn Apply(EnergyCheckIn e, CheckInRequest r)
    {
        Validate(r);
        e.Time = r.Time;
        e.Energy = r.Energy;
        e.Sleepiness = r.Sleepiness;
        e.Mood = r.Mood;
        e.Note = Clean(r.Note);
        return e;
    }

    // ---------------------------------------------------------------- meals
    public Task<Meal> AddMealAsync(MealRequest r, CancellationToken ct = default) =>
        AddAsync(Apply(new Meal(), r), r.Time, ct);

    public Task<Meal?> UpdateMealAsync(int id, MealRequest r, CancellationToken ct = default) =>
        UpdateAsync(db.Meals, id, m => Apply(m, r), r.Time, ct);

    private static Meal Apply(Meal m, MealRequest r)
    {
        Validate(r);
        m.Time = r.Time;
        m.MealType = r.MealType;
        m.Skipped = r.Skipped;
        // A skipped meal has no contents, so drop anything the form still had filled in.
        m.Description = r.Skipped ? null : Clean(r.Description);
        m.Size = r.Skipped ? null : r.Size;
        return m;
    }

    // ---------------------------------------------------------------- caffeine
    public Task<CaffeineIntake> AddCaffeineAsync(CaffeineRequest r, CancellationToken ct = default) =>
        AddAsync(Apply(new CaffeineIntake(), r), r.Time, ct);

    public Task<CaffeineIntake?> UpdateCaffeineAsync(int id, CaffeineRequest r, CancellationToken ct = default) =>
        UpdateAsync(db.CaffeineIntakes, id, c => Apply(c, r), r.Time, ct);

    private static CaffeineIntake Apply(CaffeineIntake c, CaffeineRequest r)
    {
        Validate(r);
        c.Time = r.Time;
        c.Type = r.Type;
        c.Servings = r.Servings;
        c.CaffeineMg = r.CaffeineMg ?? (int)Math.Round(CaffeineDefaults.MgPerServing(r.Type) * r.Servings);
        return c;
    }

    // ---------------------------------------------------------------- water
    public Task<WaterIntake> AddWaterAsync(WaterRequest r, CancellationToken ct = default) =>
        AddAsync(Apply(new WaterIntake(), r), r.Time, ct);

    public Task<WaterIntake?> UpdateWaterAsync(int id, WaterRequest r, CancellationToken ct = default) =>
        UpdateAsync(db.WaterIntakes, id, w => Apply(w, r), r.Time, ct);

    private static WaterIntake Apply(WaterIntake w, WaterRequest r)
    {
        Validate(r);
        w.Time = r.Time;
        w.Glasses = r.Glasses;
        return w;
    }

    // ---------------------------------------------------------------- activities

    /// <summary>
    /// Starts an activity (no EndTime) or logs a finished one (with EndTime).
    /// Only one activity can be running: starting a new one stops the current one at the new
    /// start time. That matches real life ("I stopped commuting when I started work") and saves a tap.
    /// </summary>
    public async Task<Activity> StartActivityAsync(ActivityRequest r, CancellationToken ct = default)
    {
        Validate(r);

        if (r.EndTime is null)
        {
            var running = await db.Activities.Where(a => a.EndTime == null).ToListAsync(ct);
            foreach (var current in running)
            {
                if (current.StartTime >= r.StartTime)
                    Fail(nameof(r.StartTime),
                        $"{DisplayNames.For(current.Category)} is running since {current.StartTime:HH:mm}. Start the new activity after that, or stop it first.");
                current.EndTime = r.StartTime;
            }
        }

        return await AddAsync(Apply(new Activity(), r), r.StartTime, ct);
    }

    /// <summary>Editing never auto-stops anything; it just refuses to create a second running activity.</summary>
    public async Task<Activity?> UpdateActivityAsync(int id, ActivityRequest r, CancellationToken ct = default)
    {
        Validate(r);
        if (r.EndTime is null && await db.Activities.AnyAsync(a => a.Id != id && a.EndTime == null, ct))
            Fail(nameof(r.EndTime), "Another activity is running. Give this one an end time, or stop the other one first.");

        return await UpdateAsync(db.Activities, id, a => Apply(a, r), r.StartTime, ct);
    }

    private static Activity Apply(Activity a, ActivityRequest r)
    {
        a.StartTime = r.StartTime;
        a.EndTime = r.EndTime;
        a.Category = r.Category;
        a.Notes = Clean(r.Notes);
        return a;
    }

    public async Task<Activity?> StopActivityAsync(int id, StopActivityRequest r, CancellationToken ct = default)
    {
        var activity = await db.Activities.FindAsync([id], ct);
        if (activity is null) return null;
        if (activity.EndTime is not null) Fail("endTime", "This activity has already been stopped.");
        if (r.EndTime <= activity.StartTime)
            Fail("endTime", $"End time must be after the start time ({activity.StartTime:HH:mm}).");

        activity.EndTime = r.EndTime;
        await db.SaveChangesAsync(ct);
        return activity;
    }

    /// <summary>One sleep per wake-up date: logging again for the same morning updates it instead of duplicating.</summary>
    public async Task<SleepLog> UpsertSleepAsync(SleepRequest r, CancellationToken ct = default)
    {
        Validate(r);
        var start = r.WakeDate.ToDateTime(TimeOnly.MinValue);
        var sleep = await db.SleepLogs.FirstOrDefaultAsync(s => s.WakeTime >= start && s.WakeTime < start.AddDays(1), ct);
        if (sleep is null) db.SleepLogs.Add(sleep = new SleepLog());

        sleep.BedTime = r.BedDateTime;
        sleep.WakeTime = r.WakeDateTime;
        sleep.Quality = r.Quality;
        sleep.TimesWoken = r.TimesWoken;
        sleep.Notes = Clean(r.Notes);
        sleep.UtcOffsetMinutes = clock.OffsetMinutesAt(r.WakeDateTime);
        sleep.IsSeed = false; // editing a demo row makes it yours
        await db.SaveChangesAsync(ct);
        return sleep;
    }

    /// <summary>One reflection per date (enforced by a unique index); saving again updates it.</summary>
    public async Task<DailyReflection> UpsertReflectionAsync(ReflectionRequest r, CancellationToken ct = default)
    {
        Validate(r);
        var reflection = await db.DailyReflections.FirstOrDefaultAsync(x => x.Date == r.Date, ct);
        if (reflection is null) db.DailyReflections.Add(reflection = new DailyReflection { Date = r.Date });

        reflection.WentWell = Clean(r.WentWell);
        reflection.DidntGoWell = Clean(r.DidntGoWell);
        reflection.DoDifferently = Clean(r.DoDifferently);
        reflection.DayRating = r.DayRating;
        reflection.IsSeed = false;
        await db.SaveChangesAsync(ct);
        return reflection;
    }

    /// <summary>Deletes one entry. Returns false if it didn't exist.</summary>
    public async Task<bool> DeleteAsync(EntryKind kind, int id, CancellationToken ct = default)
    {
        var deleted = kind switch
        {
            EntryKind.Sleep => await db.SleepLogs.Where(x => x.Id == id).ExecuteDeleteAsync(ct),
            EntryKind.Meal => await db.Meals.Where(x => x.Id == id).ExecuteDeleteAsync(ct),
            EntryKind.Caffeine => await db.CaffeineIntakes.Where(x => x.Id == id).ExecuteDeleteAsync(ct),
            EntryKind.Water => await db.WaterIntakes.Where(x => x.Id == id).ExecuteDeleteAsync(ct),
            EntryKind.CheckIn => await db.EnergyCheckIns.Where(x => x.Id == id).ExecuteDeleteAsync(ct),
            EntryKind.Activity => await db.Activities.Where(x => x.Id == id).ExecuteDeleteAsync(ct),
            EntryKind.Reflection => await db.DailyReflections.Where(x => x.Id == id).ExecuteDeleteAsync(ct),
            _ => 0,
        };
        return deleted > 0;
    }

    private async Task<T> AddAsync<T>(T entry, DateTime localTime, CancellationToken ct) where T : TimedEntry
    {
        entry.UtcOffsetMinutes = clock.OffsetMinutesAt(localTime);
        db.Add(entry);
        await db.SaveChangesAsync(ct);
        return entry;
    }

    /// <summary>Loads an entry, applies the change, re-computes its UTC offset and saves. Null if it doesn't exist.</summary>
    private async Task<T?> UpdateAsync<T>(DbSet<T> set, int id, Action<T> apply, DateTime localTime, CancellationToken ct)
        where T : TimedEntry
    {
        var entry = await set.FindAsync([id], ct);
        if (entry is null) return null;

        apply(entry);
        entry.UtcOffsetMinutes = clock.OffsetMinutesAt(localTime);
        entry.IsSeed = false; // once you've edited a demo row it's yours, so "wipe demo data" keeps it
        await db.SaveChangesAsync(ct);
        return entry;
    }

    private static void Validate(IValidatable request)
    {
        var errors = new ValidationErrors();
        request.Validate(errors);
        errors.ThrowIfAny();
    }

    private static void Fail(string field, string message)
    {
        var errors = new ValidationErrors();
        errors.Add(field, message);
        errors.ThrowIfAny();
    }

    /// <summary>Trims text and stores empty strings as null, so "no note" is always null.</summary>
    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();
}
