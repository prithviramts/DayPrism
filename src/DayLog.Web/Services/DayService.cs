using DayLog.Web.Data;
using DayLog.Web.Domain;
using Microsoft.EntityFrameworkCore;

namespace DayLog.Web.Services;

/// <summary>Everything logged for one calendar day, plus derived totals.</summary>
public sealed record DaySnapshot(
    DateOnly Date,
    bool IsToday,
    DateTime Now,
    SleepLog? Sleep,
    IReadOnlyList<Meal> Meals,
    IReadOnlyList<CaffeineIntake> Caffeine,
    IReadOnlyList<WaterIntake> Water,
    IReadOnlyList<EnergyCheckIn> CheckIns,
    IReadOnlyList<Activity> Activities,
    DailyReflection? Reflection,
    Activity? RunningActivity)
{
    public int MealsEaten => Meals.Count(m => !m.Skipped);
    public int MealsSkipped => Meals.Count(m => m.Skipped);
    public int CaffeineDrinks => Caffeine.Count;
    public int CaffeineMg => Caffeine.Sum(c => c.CaffeineMg);
    public int WaterGlasses => Water.Sum(w => w.Glasses);
    public EnergyCheckIn? LatestCheckIn => CheckIns.MaxBy(c => c.Time);
}

/// <summary>Loads a day's entries. Used by the Today page now, and the History page in Phase 3.</summary>
public sealed class DayService(DayLogDbContext db, LocalClock clock)
{
    public async Task<DaySnapshot> GetDayAsync(DateOnly date, CancellationToken ct = default)
    {
        var start = date.ToDateTime(TimeOnly.MinValue);
        var end = start.AddDays(1);

        // Each query is a simple indexed range scan on the table's time column. AsNoTracking
        // because this is read-only: EF skips change-tracking work.
        var sleep = await db.SleepLogs.AsNoTracking()
            .Where(s => s.WakeTime >= start && s.WakeTime < end)
            .OrderByDescending(s => s.WakeTime).FirstOrDefaultAsync(ct);
        var meals = await db.Meals.AsNoTracking()
            .Where(m => m.Time >= start && m.Time < end).OrderBy(m => m.Time).ToListAsync(ct);
        var caffeine = await db.CaffeineIntakes.AsNoTracking()
            .Where(c => c.Time >= start && c.Time < end).OrderBy(c => c.Time).ToListAsync(ct);
        var water = await db.WaterIntakes.AsNoTracking()
            .Where(w => w.Time >= start && w.Time < end).OrderBy(w => w.Time).ToListAsync(ct);
        var checkIns = await db.EnergyCheckIns.AsNoTracking()
            .Where(c => c.Time >= start && c.Time < end).OrderBy(c => c.Time).ToListAsync(ct);

        // Activities that *overlap* the day, so one running from 23:00 to 01:00 shows on both days.
        var activities = await db.Activities.AsNoTracking()
            .Where(a => a.StartTime < end && (a.EndTime == null || a.EndTime > start))
            .OrderBy(a => a.StartTime).ToListAsync(ct);

        var reflection = await db.DailyReflections.AsNoTracking().FirstOrDefaultAsync(r => r.Date == date, ct);

        // The running activity is global, not per day: it might have been started yesterday.
        var running = await db.Activities.AsNoTracking()
            .Where(a => a.EndTime == null).OrderByDescending(a => a.StartTime).FirstOrDefaultAsync(ct);

        return new DaySnapshot(date, date == clock.Today, clock.Now,
            sleep, meals, caffeine, water, checkIns, activities, reflection, running);
    }
}
