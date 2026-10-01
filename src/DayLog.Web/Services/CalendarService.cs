using DayLog.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace DayLog.Web.Services;

/// <summary>One cell of the month grid.</summary>
public sealed record CalendarDay(
    DateOnly Date,
    bool InMonth,
    bool IsToday,
    bool IsFuture,
    bool HasData,
    int? DayRating,
    double? AverageEnergy,
    TimeSpan? Sleep)
{
    /// <summary>Screen-reader / tooltip summary, e.g. "Mon 28 Sep: rating 4/5, energy 3.2, sleep 6h 59m".</summary>
    public string Summary
    {
        get
        {
            var parts = new List<string>();
            if (DayRating is { } r) parts.Add($"rating {r}/5");
            if (AverageEnergy is { } e) parts.Add($"energy {e:0.0}");
            if (Sleep is { } s) parts.Add($"sleep {Domain.DisplayNames.Duration(s)}");
            if (parts.Count == 0) parts.Add(HasData ? "some entries" : "nothing logged");
            return $"{Date:ddd d MMM}: {string.Join(", ", parts)}";
        }
    }
}

public sealed record CalendarMonth(int Year, int Month, IReadOnlyList<CalendarDay> Days)
{
    public DateOnly FirstOfMonth => new(Year, Month, 1);
    public string Title => FirstOfMonth.ToString("MMMM yyyy");
}

public sealed class CalendarService(DayLogDbContext db, LocalClock clock)
{
    /// <summary>
    /// The grid for a month: full weeks, Monday first, so it includes a few days of the
    /// neighbouring months (shown dimmed), like a normal calendar.
    /// </summary>
    public async Task<CalendarMonth> GetMonthAsync(int year, int month, CancellationToken ct = default)
    {
        var first = new DateOnly(year, month, 1);
        var gridStart = first.AddDays(-(((int)first.DayOfWeek + 6) % 7)); // back to Monday
        var last = first.AddMonths(1).AddDays(-1);
        var gridEnd = last.AddDays((7 - (int)last.DayOfWeek) % 7).AddDays(1); // forward past Sunday (exclusive)

        var from = gridStart.ToDateTime(TimeOnly.MinValue);
        var to = gridEnd.ToDateTime(TimeOnly.MinValue);

        // A month of personal data is a few hundred rows, so load just the columns we need and
        // group in memory: simpler than date-grouping SQL, and fast enough by a wide margin.
        var checkIns = await db.EnergyCheckIns.AsNoTracking()
            .Where(c => c.Time >= from && c.Time < to).Select(c => new { c.Time, c.Energy }).ToListAsync(ct);
        var sleeps = await db.SleepLogs.AsNoTracking()
            .Where(s => s.WakeTime >= from && s.WakeTime < to).Select(s => new { s.BedTime, s.WakeTime }).ToListAsync(ct);
        var ratings = await db.DailyReflections.AsNoTracking()
            .Where(r => r.Date >= gridStart && r.Date < gridEnd).Select(r => new { r.Date, r.DayRating }).ToListAsync(ct);

        var otherTimes = await db.Meals.Where(m => m.Time >= from && m.Time < to).Select(m => m.Time)
            .Concat(db.CaffeineIntakes.Where(c => c.Time >= from && c.Time < to).Select(c => c.Time))
            .Concat(db.WaterIntakes.Where(w => w.Time >= from && w.Time < to).Select(w => w.Time))
            .Concat(db.Activities.Where(a => a.StartTime >= from && a.StartTime < to).Select(a => a.StartTime))
            .ToListAsync(ct);

        var energyByDay = checkIns.GroupBy(c => DateOnly.FromDateTime(c.Time)).ToDictionary(g => g.Key, g => g.Average(c => c.Energy));
        var sleepByDay = sleeps.GroupBy(s => DateOnly.FromDateTime(s.WakeTime)).ToDictionary(g => g.Key, g => g.First().WakeTime - g.First().BedTime);
        var ratingByDay = ratings.ToDictionary(r => r.Date, r => r.DayRating);
        var daysWithData = otherTimes.Select(DateOnly.FromDateTime)
            .Concat(energyByDay.Keys).Concat(sleepByDay.Keys).Concat(ratingByDay.Keys)
            .ToHashSet();

        var today = clock.Today;
        var days = new List<CalendarDay>();
        for (var d = gridStart; d < gridEnd; d = d.AddDays(1))
        {
            days.Add(new CalendarDay(
                d,
                InMonth: d.Month == month,
                IsToday: d == today,
                IsFuture: d > today,
                HasData: daysWithData.Contains(d),
                DayRating: ratingByDay.TryGetValue(d, out var r) ? r : null,
                AverageEnergy: energyByDay.TryGetValue(d, out var e) ? e : null,
                Sleep: sleepByDay.TryGetValue(d, out var s) ? s : null));
        }

        return new CalendarMonth(year, month, days);
    }
}
