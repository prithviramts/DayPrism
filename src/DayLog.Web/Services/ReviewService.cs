using DayLog.Web.Data;
using DayLog.Web.Domain;
using Microsoft.EntityFrameworkCore;

namespace DayLog.Web.Services;

/// <summary>One day, boiled down to the numbers the review and its "day by day" table need.</summary>
public sealed record DayRow(
    DateOnly Date,
    bool HasData,
    double? SleepHours,
    string? BedTime,
    string? WakeTime,
    int? SleepQuality,
    int CheckIns,
    double? AvgEnergy,
    double? AvgSleepiness,
    double? AvgMood,
    double? MorningEnergy,
    int CaffeineDrinks,
    int CaffeineMg,
    TimeOnly? LastCaffeine,
    int MealsEaten,
    int MealsSkipped,
    bool? AteBreakfast,
    int WaterGlasses,
    int ExerciseMinutes,
    int DeepWorkMinutes,
    int ScreenTimeMinutes,
    int? DayRating,
    DailyReflection? Reflection);

public sealed record Streak(string Name, string Description, int Current, int Longest, DateOnly? LongestFrom, DateOnly? LongestTo, int DaysMet, int DaysCounted);

public sealed record NotableDay(DayRow Day, string Why);

public sealed record ReviewReport(
    DateOnly From,
    DateOnly To,
    DateOnly Today,
    InsightsReport Insights,
    IReadOnlyList<DayRow> Days,
    IReadOnlyList<NotableDay> BestDays,
    IReadOnlyList<NotableDay> HardestDays,
    IReadOnlyList<Streak> Streaks,
    int DemoRows)
{
    public int DaysInRange => To.DayNumber - From.DayNumber + 1;
    public int DaysLogged => Days.Count(d => d.HasData);
    public IEnumerable<DayRow> Reflections => Days.Where(d => d.Reflection is not null);

    public double? Avg(Func<DayRow, double?> pick)
    {
        var values = Days.Select(pick).Where(v => v is not null).Select(v => v!.Value).ToList();
        return values.Count > 0 ? values.Average() : null;
    }

    /// <summary>Average over days that have any data, for counts like water where "nothing" means 0.</summary>
    public double? AvgPerLoggedDay(Func<DayRow, double> pick) =>
        DaysLogged > 0 ? Days.Where(d => d.HasData).Average(pick) : null;
}

/// <summary>
/// Builds the Monthly Review: per-day rows, best and hardest days, streaks, all reflections,
/// plus the Insights patterns for the same range. Feeds the Review page and both exports.
/// </summary>
public sealed class ReviewService(DayLogDbContext db, InsightsService insights, LocalClock clock)
{
    public const int MaxRangeDays = 366;

    public async Task<ReviewReport> BuildAsync(DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var start = from.ToDateTime(TimeOnly.MinValue);
        var end = to.AddDays(1).ToDateTime(TimeOnly.MinValue);

        var sleeps = await db.SleepLogs.AsNoTracking().Where(s => s.WakeTime >= start && s.WakeTime < end).ToListAsync(ct);
        var checkIns = await db.EnergyCheckIns.AsNoTracking().Where(c => c.Time >= start && c.Time < end).ToListAsync(ct);
        var caffeine = await db.CaffeineIntakes.AsNoTracking().Where(c => c.Time >= start && c.Time < end).ToListAsync(ct);
        var meals = await db.Meals.AsNoTracking().Where(m => m.Time >= start && m.Time < end).ToListAsync(ct);
        var water = await db.WaterIntakes.AsNoTracking().Where(w => w.Time >= start && w.Time < end).ToListAsync(ct);
        var activities = await db.Activities.AsNoTracking()
            .Where(a => a.StartTime < end && (a.EndTime == null || a.EndTime > start)).ToListAsync(ct);
        var reflections = await db.DailyReflections.AsNoTracking().Where(r => r.Date >= from && r.Date <= to).ToListAsync(ct);

        var demoRows = sleeps.Count(x => x.IsSeed) + checkIns.Count(x => x.IsSeed) + caffeine.Count(x => x.IsSeed)
                     + meals.Count(x => x.IsSeed) + water.Count(x => x.IsSeed) + activities.Count(x => x.IsSeed)
                     + reflections.Count(x => x.IsSeed);

        var now = clock.Now;
        var days = Enumerable.Range(0, to.DayNumber - from.DayNumber + 1).Select(i =>
        {
            var d = from.AddDays(i);
            var dayStart = d.ToDateTime(TimeOnly.MinValue);
            var dayEnd = dayStart.AddDays(1);
            bool OnDay(DateTime t) => t >= dayStart && t < dayEnd;

            var sleep = sleeps.Where(s => OnDay(s.WakeTime)).MaxBy(s => s.WakeTime);
            var dayCheckIns = checkIns.Where(c => OnDay(c.Time)).ToList();
            var morning = dayCheckIns.Where(c => c.Time.Hour < 12).ToList();
            var dayCaffeine = caffeine.Where(c => OnDay(c.Time)).ToList();
            var dayMeals = meals.Where(m => OnDay(m.Time)).ToList();
            var breakfasts = dayMeals.Where(m => m.MealType == MealType.Breakfast).ToList();
            var reflection = reflections.FirstOrDefault(r => r.Date == d);

            // Minutes of an activity category inside this day (activities can cross midnight).
            int Minutes(ActivityCategory category) => (int)Math.Round(activities
                .Where(a => a.Category == category)
                .Sum(a => Math.Max(0, (Min(a.EndTime ?? now, dayEnd) - Max(a.StartTime, dayStart)).TotalMinutes)));

            var hasData = sleep is not null || dayCheckIns.Count > 0 || dayCaffeine.Count > 0 || dayMeals.Count > 0
                          || water.Any(w => OnDay(w.Time)) || reflection is not null
                          || activities.Any(a => OnDay(a.StartTime));

            return new DayRow(
                d, hasData,
                sleep?.Duration.TotalHours, sleep?.BedTime.ToString("HH:mm"), sleep?.WakeTime.ToString("HH:mm"), sleep?.Quality,
                dayCheckIns.Count,
                dayCheckIns.Count > 0 ? dayCheckIns.Average(c => c.Energy) : null,
                dayCheckIns.Count > 0 ? dayCheckIns.Average(c => c.Sleepiness) : null,
                dayCheckIns.Count > 0 ? dayCheckIns.Average(c => c.Mood) : null,
                morning.Count > 0 ? morning.Average(c => c.Energy) : null,
                dayCaffeine.Count, dayCaffeine.Sum(c => c.CaffeineMg),
                dayCaffeine.Count > 0 ? TimeOnly.FromDateTime(dayCaffeine.Max(c => c.Time)) : null,
                dayMeals.Count(m => !m.Skipped), dayMeals.Count(m => m.Skipped),
                breakfasts.Count > 0 ? breakfasts.Any(m => !m.Skipped) : null,
                water.Where(w => OnDay(w.Time)).Sum(w => w.Glasses),
                Minutes(ActivityCategory.Exercise), Minutes(ActivityCategory.DeepWork), Minutes(ActivityCategory.ScreenTime),
                reflection?.DayRating, reflection);
        }).ToList();

        var (best, hardest) = PickNotableDays(days);
        var report = await insights.BuildAsync(from, to, ct);

        return new ReviewReport(from, to, clock.Today, report, days, best, hardest, BuildStreaks(days, clock.Today), demoRows);
    }

    // ---------------------------------------------------------------- best & hardest days

    /// <summary>
    /// Ranks rated days by day rating, then by average energy as a tie-breaker. Takes up to 3 from
    /// each end, never the same day twice (with only 4 rated days you get 2 best and 2 hardest).
    /// </summary>
    public static (List<NotableDay> Best, List<NotableDay> Hardest) PickNotableDays(IReadOnlyList<DayRow> days)
    {
        var rated = days.Where(d => d.DayRating is not null)
            .OrderByDescending(d => d.DayRating).ThenByDescending(d => d.AvgEnergy ?? 0).ThenBy(d => d.Date)
            .ToList();
        var take = Math.Min(3, rated.Count / 2);

        var best = rated.Take(take).Select(d => new NotableDay(d, Why(d))).ToList();
        var hardest = rated.AsEnumerable().Reverse().Take(take).Select(d => new NotableDay(d, Why(d))).ToList();
        return (best, hardest);
    }

    /// <summary>The facts that usually explain a day: sleep, energy, caffeine timing, breakfast, exercise.</summary>
    private static string Why(DayRow d)
    {
        var parts = new List<string> { $"rated {d.DayRating}/5" };
        if (d.SleepHours is { } s) parts.Add($"slept {InsightsService.Hm(s)}");
        if (d.AvgEnergy is { } e) parts.Add($"energy {e:0.0}");
        if (d.LastCaffeine is { } c) parts.Add($"last caffeine {c:HH:mm}");
        if (d.AteBreakfast == false) parts.Add("skipped breakfast");
        if (d.ExerciseMinutes > 0) parts.Add($"exercised {d.ExerciseMinutes} min");
        return string.Join(" · ", parts);
    }

    // ---------------------------------------------------------------- streaks

    private sealed record StreakRule(string Name, string Description, Func<DayRow, bool?> Met);

    /// <summary>
    /// Each rule returns true (met), false (missed) or null (doesn't apply that day, e.g. no
    /// breakfast logged). Null days neither extend nor break a streak.
    /// </summary>
    private static readonly StreakRule[] Rules =
    [
        new("Logging", "days with at least one entry", d => d.HasData),
        new("Reflection", "days with an end-of-day reflection", d => d.Reflection is not null),
        new("7h+ sleep", "nights of 7 hours or more", d => d.SleepHours is { } h ? h >= 7 : null),
        new("Exercise", "days with an exercise activity", d => d.HasData ? d.ExerciseMinutes > 0 : null),
        new("Caffeine before 15:00", "logged days with no caffeine after 15:00", d => d.HasData ? d.LastCaffeine is null || d.LastCaffeine < new TimeOnly(15, 0) : null),
        new("Breakfast", "days you logged eating breakfast", d => d.AteBreakfast),
    ];

    public static List<Streak> BuildStreaks(IReadOnlyList<DayRow> days, DateOnly today) =>
        Rules.Select(rule => BuildStreak(rule, days, today)).ToList();

    private static Streak BuildStreak(StreakRule rule, IReadOnlyList<DayRow> days, DateOnly today)
    {
        int longest = 0, run = 0;
        DateOnly? runStart = null, longestFrom = null, longestTo = null;
        foreach (var d in days)
        {
            switch (rule.Met(d))
            {
                case true:
                    runStart ??= d.Date;
                    run++;
                    if (run > longest) (longest, longestFrom, longestTo) = (run, runStart, d.Date);
                    break;
                case false:
                    (run, runStart) = (0, null);
                    break;
                // null: day doesn't count either way
            }
        }

        // Current streak: count back from the end of the range. Today is still in progress, so
        // if today doesn't meet the rule (yet), the streak is counted from yesterday instead.
        var current = 0;
        for (var i = days.Count - 1; i >= 0; i--)
        {
            var met = rule.Met(days[i]);
            if (met == true) current++;
            else if (met == false && !(days[i].Date == today && i == days.Count - 1)) break;
        }

        var counted = days.Select(rule.Met).Where(m => m is not null).ToList();
        return new Streak(rule.Name, rule.Description, current, longest, longestFrom, longestTo,
            counted.Count(m => m == true), counted.Count);
    }

    private static DateTime Max(DateTime a, DateTime b) => a > b ? a : b;
    private static DateTime Min(DateTime a, DateTime b) => a < b ? a : b;
}
