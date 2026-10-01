using DayLog.Web.Data;
using DayLog.Web.Domain;
using Microsoft.EntityFrameworkCore;

namespace DayLog.Web.Services;

// ---------------------------------------------------------------- report shapes
// Plain records so the same report can be rendered as charts (Insights page), as tables,
// and as text (Monthly Review export in Phase 5).

public sealed record InsightsSummary(int DaysLogged, double? AvgSleepHours, double? AvgEnergy, double? AvgDayRating, double? AvgCaffeineMg);

/// <summary>
/// One night. Bed/Wake are "hours after 18:00 the evening before", so a night is a simple
/// numeric range (23:30 = 5.5, 06:30 = 12.5) that can be drawn as a floating bar and averaged
/// without the midnight wrap-around problem.
/// </summary>
public sealed record SleepNight(DateOnly Date, double Bed, double Wake, double Hours, int Quality, string BedTime, string WakeTime);

public sealed record SleepStats(int Nights, double? AvgHours, string? AvgBedTime, string? AvgWakeTime, double? AvgQuality, int ShortNights, int LongNights);

public sealed record HourlyPoint(int Hour, double Energy, double Sleepiness, int CheckIns);

public sealed record SleepBucket(string Label, int Days, double? Energy, double? Sleepiness);

public sealed record CaffeinePoint(DateOnly Date, double LastCaffeineHour, string LastCaffeineTime, double NightSleepHours, int NightQuality);

public sealed record CaffeineBucket(string Label, int Days, double? SleepHours, double? Quality);

public sealed record BreakfastGroup(string Label, int Days, double? MorningEnergy);

public sealed record WeekActivity(DateOnly WeekStart, bool Partial, IReadOnlyDictionary<string, double> HoursByFamily, IReadOnlyDictionary<string, double> HoursByCategory);

public sealed record RatingPoint(DateOnly Date, int? Rating, double? RollingAverage);

/// <summary>A chart's one-sentence conclusion, and whether there was enough data to draw one.</summary>
public sealed record Takeaway(string Text, bool Enough);

public sealed record InsightsReport(
    DateOnly From,
    DateOnly To,
    InsightsSummary Summary,
    IReadOnlyList<SleepNight> Nights,
    SleepStats Sleep,
    Takeaway SleepTakeaway,
    IReadOnlyList<HourlyPoint> Hourly,
    Takeaway HourlyTakeaway,
    IReadOnlyList<SleepBucket> SleepBuckets,
    Takeaway SleepVsEnergyTakeaway,
    IReadOnlyList<CaffeinePoint> CaffeinePoints,
    IReadOnlyList<CaffeineBucket> CaffeineBuckets,
    Takeaway CaffeineTakeaway,
    IReadOnlyList<BreakfastGroup> Breakfast,
    Takeaway BreakfastTakeaway,
    IReadOnlyList<WeekActivity> Weeks,
    IReadOnlyList<ActivityFamily> Families,
    Takeaway ActivityTakeaway,
    IReadOnlyList<RatingPoint> Ratings,
    Takeaway RatingTakeaway)
{
    public int Days => To.DayNumber - From.DayNumber + 1;
}

/// <summary>An activity colour family (as on the timeline): its key, display name and member categories.</summary>
public sealed record ActivityFamily(string Key, string Label, IReadOnlyList<string> Categories);

/// <summary>
/// Computes everything on the Insights page from raw entries.
///
/// A note on honesty: these are comparisons between groups of days, not proof of cause and
/// effect, and a handful of days can swing an average a lot. So every comparison reports how
/// many days it's based on, and says "not enough data" below <see cref="MinDaysPerGroup"/>.
/// </summary>
public sealed class InsightsService(DayLogDbContext db, LocalClock clock)
{
    /// <summary>Fewest days a group needs before we compare it with another.</summary>
    public const int MinDaysPerGroup = 2;

    public static readonly IReadOnlyList<ActivityFamily> Families = BuildFamilies();

    public async Task<InsightsReport> BuildAsync(DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var start = from.ToDateTime(TimeOnly.MinValue);
        var end = to.AddDays(1).ToDateTime(TimeOnly.MinValue);

        // ---- Load the range once. Sleep extends one extra day: "caffeine vs that night's
        // sleep" needs the night after the last day in the range.
        var sleeps = await db.SleepLogs.AsNoTracking()
            .Where(s => s.WakeTime >= start && s.WakeTime < end.AddDays(1)).ToListAsync(ct);
        var checkIns = await db.EnergyCheckIns.AsNoTracking()
            .Where(c => c.Time >= start && c.Time < end).ToListAsync(ct);
        var caffeine = await db.CaffeineIntakes.AsNoTracking()
            .Where(c => c.Time >= start && c.Time < end).ToListAsync(ct);
        var meals = await db.Meals.AsNoTracking()
            .Where(m => m.Time >= start && m.Time < end).ToListAsync(ct);
        var activities = await db.Activities.AsNoTracking()
            .Where(a => a.StartTime < end && (a.EndTime == null || a.EndTime > start)).ToListAsync(ct);
        var reflections = await db.DailyReflections.AsNoTracking()
            .Where(r => r.Date >= from && r.Date <= to).ToListAsync(ct);

        var days = Enumerable.Range(0, to.DayNumber - from.DayNumber + 1).Select(from.AddDays).ToList();
        var sleepByWakeDate = sleeps
            .GroupBy(s => DateOnly.FromDateTime(s.WakeTime))
            .ToDictionary(g => g.Key, g => g.OrderByDescending(s => s.WakeTime).First());
        var checkInsByDay = checkIns.ToLookup(c => DateOnly.FromDateTime(c.Time));
        var caffeineByDay = caffeine.ToLookup(c => DateOnly.FromDateTime(c.Time));
        var ratingByDay = reflections.ToDictionary(r => r.Date, r => r.DayRating);

        var nights = BuildNights(days, sleepByWakeDate);
        var sleepStats = BuildSleepStats(nights);
        var hourly = BuildHourly(checkIns);
        var sleepBuckets = BuildSleepBuckets(days, sleepByWakeDate, checkInsByDay);
        var (caffeinePoints, caffeineBuckets) = BuildCaffeine(days, caffeineByDay, sleepByWakeDate);
        var breakfast = BuildBreakfast(days, meals, checkInsByDay);
        var weeks = BuildWeeks(from, to, activities);
        var ratings = BuildRatings(days, ratingByDay);

        var loggedDays = days.Count(d =>
            checkInsByDay[d].Any() || caffeineByDay[d].Any() || sleepByWakeDate.ContainsKey(d) || ratingByDay.ContainsKey(d)
            || meals.Any(m => DateOnly.FromDateTime(m.Time) == d) || activities.Any(a => DateOnly.FromDateTime(a.StartTime) == d));

        var dayEnergies = days.Where(d => checkInsByDay[d].Any()).Select(d => checkInsByDay[d].Average(c => c.Energy)).ToList();
        var summary = new InsightsSummary(
            loggedDays,
            nights.Count > 0 ? nights.Average(n => n.Hours) : null,
            dayEnergies.Count > 0 ? dayEnergies.Average() : null,
            ratingByDay.Count > 0 ? ratingByDay.Values.Average() : null,
            loggedDays > 0 ? caffeine.Sum(c => c.CaffeineMg) / (double)loggedDays : null);

        return new InsightsReport(from, to, summary,
            nights, sleepStats, SleepTakeaway(sleepStats),
            hourly, HourlyTakeaway(hourly),
            sleepBuckets, SleepVsEnergyTakeaway(sleepBuckets),
            caffeinePoints, caffeineBuckets, CaffeineTakeaway(caffeineBuckets),
            breakfast, BreakfastTakeaway(breakfast),
            weeks, Families, ActivityTakeaway(weeks),
            ratings, RatingTakeaway(ratings));
    }

    // ---------------------------------------------------------------- sleep

    private static double HoursAfterSixPm(DateTime t, DateOnly wakeDate) =>
        (t - wakeDate.AddDays(-1).ToDateTime(new TimeOnly(18, 0))).TotalHours;

    /// <summary>Converts "hours after 18:00" back to a clock time, e.g. 5.5 → "23:30".</summary>
    public static string ClockFromSixPm(double hours) =>
        TimeOnly.FromTimeSpan(TimeSpan.FromMinutes(Math.Round((18 + hours) * 60) % (24 * 60))).ToString("HH:mm");

    private static List<SleepNight> BuildNights(List<DateOnly> days, Dictionary<DateOnly, SleepLog> sleepByWakeDate) =>
        days.Where(sleepByWakeDate.ContainsKey).Select(d =>
        {
            var s = sleepByWakeDate[d];
            return new SleepNight(d, HoursAfterSixPm(s.BedTime, d), HoursAfterSixPm(s.WakeTime, d),
                s.Duration.TotalHours, s.Quality, s.BedTime.ToString("HH:mm"), s.WakeTime.ToString("HH:mm"));
        }).ToList();

    private static SleepStats BuildSleepStats(List<SleepNight> nights) => nights.Count == 0
        ? new SleepStats(0, null, null, null, null, 0, 0)
        : new SleepStats(
            nights.Count,
            nights.Average(n => n.Hours),
            ClockFromSixPm(nights.Average(n => n.Bed)),
            ClockFromSixPm(nights.Average(n => n.Wake)),
            nights.Average(n => n.Quality),
            nights.Count(n => n.Hours < 6),
            nights.Count(n => n.Hours >= 7));

    private static Takeaway SleepTakeaway(SleepStats s) => s.Nights < 3
        ? new("Log at least 3 nights to see your sleep pattern.", false)
        : new($"You averaged {Hm(s.AvgHours!.Value)} a night, in bed around {s.AvgBedTime} and up around {s.AvgWakeTime}. " +
              $"{s.ShortNights} of {s.Nights} nights were under 6h; {s.LongNights} were 7h or more.", true);

    // ---------------------------------------------------------------- energy by hour

    private static List<HourlyPoint> BuildHourly(List<EnergyCheckIn> checkIns) =>
        checkIns.GroupBy(c => c.Time.Hour).OrderBy(g => g.Key)
            .Select(g => new HourlyPoint(g.Key, g.Average(c => c.Energy), g.Average(c => c.Sleepiness), g.Count()))
            .ToList();

    private static Takeaway HourlyTakeaway(List<HourlyPoint> hourly)
    {
        // Only trust hours with a few check-ins; a single reading at 06:00 shouldn't be "the peak".
        var solid = hourly.Where(h => h.CheckIns >= 3).ToList();
        if (solid.Count < 3) return new("Log check-ins at different times of day to see your daily energy curve.", false);

        var peak = solid.MaxBy(h => h.Energy)!;
        var low = solid.MinBy(h => h.Energy)!;
        var sleepiest = solid.MaxBy(h => h.Sleepiness)!;
        return new($"Energy peaks around {peak.Hour:00}:00 ({peak.Energy:0.0}) and is lowest around {low.Hour:00}:00 ({low.Energy:0.0}). " +
                   $"You feel sleepiest around {sleepiest.Hour:00}:00.", true);
    }

    // ---------------------------------------------------------------- sleep vs next-day energy

    private static readonly string[] SleepBucketLabels = ["Under 6h", "6–7h", "7h or more"];

    private static List<SleepBucket> BuildSleepBuckets(
        List<DateOnly> days, Dictionary<DateOnly, SleepLog> sleepByWakeDate, ILookup<DateOnly, EnergyCheckIn> checkInsByDay)
    {
        // One value per day (that day's average), so a day with 6 check-ins doesn't count 6 times.
        var rows = days
            .Where(d => sleepByWakeDate.ContainsKey(d) && checkInsByDay[d].Any())
            .Select(d => (
                Bucket: sleepByWakeDate[d].Duration.TotalHours switch { < 6 => 0, < 7 => 1, _ => 2 },
                Energy: checkInsByDay[d].Average(c => c.Energy),
                Sleepiness: checkInsByDay[d].Average(c => c.Sleepiness)))
            .ToList();

        return SleepBucketLabels.Select((label, i) =>
        {
            var group = rows.Where(r => r.Bucket == i).ToList();
            return new SleepBucket(label, group.Count,
                group.Count > 0 ? group.Average(r => r.Energy) : null,
                group.Count > 0 ? group.Average(r => r.Sleepiness) : null);
        }).ToList();
    }

    private static Takeaway SleepVsEnergyTakeaway(List<SleepBucket> b)
    {
        var (shortNights, longNights) = (b[0], b[2]);
        if (shortNights.Days < MinDaysPerGroup || longNights.Days < MinDaysPerGroup)
            return new($"Need at least {MinDaysPerGroup} days after nights under 6h and {MinDaysPerGroup} after 7h+ to compare " +
                       $"(have {shortNights.Days} and {longNights.Days}).", false);

        var diff = longNights.Energy!.Value - shortNights.Energy!.Value;
        return new($"After nights under 6h your energy averaged {shortNights.Energy:0.0}, vs {longNights.Energy:0.0} after 7h+ " +
                   $"({Signed(-diff)} points). Sleepiness: {shortNights.Sleepiness:0.0} vs {longNights.Sleepiness:0.0}. " +
                   $"Based on {shortNights.Days} and {longNights.Days} days.", true);
    }

    // ---------------------------------------------------------------- caffeine vs that night's sleep

    private static readonly string[] CaffeineBucketLabels = ["Before 14:00", "14:00–16:00", "After 16:00"];

    private static (List<CaffeinePoint>, List<CaffeineBucket>) BuildCaffeine(
        List<DateOnly> days, ILookup<DateOnly, CaffeineIntake> caffeineByDay, Dictionary<DateOnly, SleepLog> sleepByWakeDate)
    {
        // "That night" = the sleep you woke up from the next morning.
        var points = days
            .Where(d => caffeineByDay[d].Any() && sleepByWakeDate.ContainsKey(d.AddDays(1)))
            .Select(d =>
            {
                var last = caffeineByDay[d].Max(c => c.Time);
                var night = sleepByWakeDate[d.AddDays(1)];
                return new CaffeinePoint(d, last.TimeOfDay.TotalHours, last.ToString("HH:mm"), night.Duration.TotalHours, night.Quality);
            })
            .ToList();

        var buckets = CaffeineBucketLabels.Select((label, i) =>
        {
            var group = points.Where(p => (p.LastCaffeineHour switch { < 14 => 0, < 16 => 1, _ => 2 }) == i).ToList();
            return new CaffeineBucket(label, group.Count,
                group.Count > 0 ? group.Average(p => p.NightSleepHours) : null,
                group.Count > 0 ? group.Average(p => p.NightQuality) : null);
        }).ToList();

        return (points, buckets);
    }

    private static Takeaway CaffeineTakeaway(List<CaffeineBucket> b)
    {
        var (early, late) = (b[0], b[2]);
        if (early.Days < MinDaysPerGroup || late.Days < MinDaysPerGroup)
            return new($"Need at least {MinDaysPerGroup} days with your last caffeine before 14:00 and {MinDaysPerGroup} after 16:00 to compare " +
                       $"(have {early.Days} and {late.Days}).", false);

        return new($"When your last caffeine was after 16:00 you slept {Hm(late.SleepHours!.Value)} (quality {late.Quality:0.0}), " +
                   $"vs {Hm(early.SleepHours!.Value)} (quality {early.Quality:0.0}) when it was before 14:00. " +
                   $"Based on {late.Days} and {early.Days} days.", true);
    }

    // ---------------------------------------------------------------- breakfast vs morning energy

    private static List<BreakfastGroup> BuildBreakfast(List<DateOnly> days, List<Meal> meals, ILookup<DateOnly, EnergyCheckIn> checkInsByDay)
    {
        var breakfastByDay = meals.Where(m => m.MealType == MealType.Breakfast).ToLookup(m => DateOnly.FromDateTime(m.Time));

        // Only days where breakfast was logged one way or the other. "Not logged" isn't the same as "skipped".
        var rows = days
            .Where(d => breakfastByDay[d].Any() && checkInsByDay[d].Any(c => c.Time.Hour < 12))
            .Select(d => (
                Skipped: breakfastByDay[d].All(m => m.Skipped),
                Energy: checkInsByDay[d].Where(c => c.Time.Hour < 12).Average(c => c.Energy)))
            .ToList();

        BreakfastGroup Group(string label, bool skipped)
        {
            var g = rows.Where(r => r.Skipped == skipped).ToList();
            return new BreakfastGroup(label, g.Count, g.Count > 0 ? g.Average(r => r.Energy) : null);
        }

        return [Group("Ate breakfast", false), Group("Skipped breakfast", true)];
    }

    private static Takeaway BreakfastTakeaway(List<BreakfastGroup> g)
    {
        var (ate, skipped) = (g[0], g[1]);
        if (ate.Days < MinDaysPerGroup || skipped.Days < MinDaysPerGroup)
            return new($"Need at least {MinDaysPerGroup} logged days of each (eating and skipping breakfast) with a morning check-in " +
                       $"(have {ate.Days} and {skipped.Days}).", false);

        return new($"Before noon your energy averaged {skipped.MorningEnergy:0.0} on days you skipped breakfast, " +
                   $"vs {ate.MorningEnergy:0.0} when you ate ({Signed(skipped.MorningEnergy!.Value - ate.MorningEnergy!.Value)} points). " +
                   $"Based on {skipped.Days} and {ate.Days} days.", true);
    }

    // ---------------------------------------------------------------- time per activity per week

    private List<WeekActivity> BuildWeeks(DateOnly from, DateOnly to, List<Activity> activities)
    {
        var rangeStart = from.ToDateTime(TimeOnly.MinValue);
        var rangeEnd = to.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var now = clock.Now;

        var weeks = new List<WeekActivity>();
        for (var week = MondayOf(from); week <= to; week = week.AddDays(7))
        {
            var weekStart = week.ToDateTime(TimeOnly.MinValue);
            var windowStart = Max(weekStart, rangeStart);
            var windowEnd = Min(weekStart.AddDays(7), rangeEnd);

            var byCategory = new Dictionary<string, double>();
            foreach (var a in activities)
            {
                // Only the part of the activity inside this week and the selected range counts.
                // A running activity counts up to now.
                var hours = (Min(a.EndTime ?? now, windowEnd) - Max(a.StartTime, windowStart)).TotalHours;
                if (hours <= 0) continue;
                var key = a.Category.ToString();
                byCategory[key] = byCategory.GetValueOrDefault(key) + hours;
            }

            var byFamily = Families.ToDictionary(f => f.Key, f => f.Categories.Sum(c => byCategory.GetValueOrDefault(c)));
            var partial = week < from || week.AddDays(6) > to;
            weeks.Add(new WeekActivity(week, partial, byFamily, byCategory));
        }
        return weeks;
    }

    private static Takeaway ActivityTakeaway(List<WeekActivity> weeks)
    {
        var full = weeks.Where(w => !w.Partial && w.HoursByCategory.Values.Sum() > 0).ToList();
        var pool = full.Count > 0 ? full : weeks.Where(w => w.HoursByCategory.Values.Sum() > 0).ToList();
        if (pool.Count == 0) return new("Log activities to see where your time goes.", false);

        // Average hours per week for each category, ignoring the big "always there" ones only in wording.
        var avg = pool.SelectMany(w => w.HoursByCategory)
            .GroupBy(kv => kv.Key)
            .Select(g => (Category: Enum.Parse<ActivityCategory>(g.Key), Hours: g.Sum(kv => kv.Value) / pool.Count))
            .OrderByDescending(x => x.Hours)
            .ToList();

        var top = string.Join(", ", avg.Take(3).Select(x => $"{DisplayNames.For(x.Category).ToLowerInvariant()} {x.Hours:0.#}h"));
        var growth = avg.Where(x => DisplayNames.FamilyOf(x.Category) == "growth").Sum(x => x.Hours);
        var exercise = avg.Where(x => x.Category == ActivityCategory.Exercise).Sum(x => x.Hours);
        var basis = full.Count > 0 ? $"{full.Count} full week{(full.Count == 1 ? "" : "s")}" : "partial weeks only";
        return new($"In a typical week: {top}. Study, YouTube and side projects together: {growth:0.#}h. Exercise: {exercise:0.#}h. ({basis})", true);
    }

    // ---------------------------------------------------------------- day rating

    private static List<RatingPoint> BuildRatings(List<DateOnly> days, Dictionary<DateOnly, int> ratingByDay) =>
        days.Select(d =>
        {
            // 7-day rolling average over the ratings that exist in that window (needs at least 3).
            var window = Enumerable.Range(0, 7).Select(i => d.AddDays(-i))
                .Where(ratingByDay.ContainsKey).Select(x => ratingByDay[x]).ToList();
            return new RatingPoint(d, ratingByDay.TryGetValue(d, out var r) ? r : null,
                window.Count >= 3 ? window.Average() : null);
        }).ToList();

    private static Takeaway RatingTakeaway(List<RatingPoint> ratings)
    {
        var rated = ratings.Where(r => r.Rating is not null).ToList();
        if (rated.Count < 3) return new("Write at least 3 end-of-day reflections to see your day-rating trend.", false);

        var avg = rated.Average(r => r.Rating!.Value);
        var best = rated.Where(r => r.Rating == rated.Max(x => x.Rating)).Select(r => r.Date.ToString("ddd d MMM")).Take(3);
        var text = $"Average day rating {avg:0.0} over {rated.Count} rated days. Best: {string.Join(", ", best)}.";

        if (rated.Count >= 6)
        {
            var half = rated.Count / 2;
            var first = rated.Take(half).Average(r => r.Rating!.Value);
            var second = rated.Skip(rated.Count - half).Average(r => r.Rating!.Value);
            var direction = Math.Abs(second - first) < 0.25 ? "steady" : second > first ? "improving" : "slipping";
            text += $" Trend: {direction} ({first:0.0} → {second:0.0}, first vs second half).";
        }
        return new(text, true);
    }

    // ---------------------------------------------------------------- helpers

    private static IReadOnlyList<ActivityFamily> BuildFamilies()
    {
        (string Key, string Label)[] order =
        [
            ("work", "Work"), ("growth", "Study & projects"), ("exercise", "Exercise"),
            ("commute", "Commute"), ("social", "Social"), ("neutral", "Rest, screen & other"),
        ];
        return order.Select(f => new ActivityFamily(f.Key, f.Label,
            Enum.GetValues<ActivityCategory>().Where(c => DisplayNames.FamilyOf(c) == f.Key).Select(c => c.ToString()).ToList())).ToList();
    }

    public static DateOnly MondayOf(DateOnly d) => d.AddDays(-(((int)d.DayOfWeek + 6) % 7));

    private static DateTime Max(DateTime a, DateTime b) => a > b ? a : b;
    private static DateTime Min(DateTime a, DateTime b) => a < b ? a : b;

    /// <summary>6.98 → "6h 59m".</summary>
    public static string Hm(double hours) => DisplayNames.Duration(TimeSpan.FromHours(hours));

    private static string Signed(double value) => value >= 0 ? $"+{value:0.0}" : $"−{Math.Abs(value):0.0}";
}
