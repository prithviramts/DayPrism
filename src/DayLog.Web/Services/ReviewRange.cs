namespace DayLog.Web.Services;

/// <summary>
/// Turns optional from/to query values into a sensible range, the same way for the Review page
/// and the export downloads: default is the last 30 days, never past today, from ≤ to, and at
/// most a year (so a typo like 2006 doesn't build a 20-year report).
/// </summary>
public static class ReviewRange
{
    public const int DefaultDays = 30;

    public static (DateOnly From, DateOnly To) Resolve(DateOnly? from, DateOnly? to, DateOnly today)
    {
        var end = to is { } t && t < today ? t : today;
        var start = from ?? end.AddDays(-(DefaultDays - 1));
        if (start > end) (start, end) = (end, start);
        if (end.DayNumber - start.DayNumber + 1 > ReviewService.MaxRangeDays) start = end.AddDays(-(ReviewService.MaxRangeDays - 1));
        return (start, end);
    }

    /// <summary>Quick picks shown above the review.</summary>
    public static IReadOnlyList<(string Label, DateOnly From, DateOnly To)> Presets(DateOnly today)
    {
        var thisMonth = new DateOnly(today.Year, today.Month, 1);
        var lastMonth = thisMonth.AddMonths(-1);
        return
        [
            ("Last 30 days", today.AddDays(-(DefaultDays - 1)), today),
            ("This month", thisMonth, today),
            ($"{lastMonth:MMMM}", lastMonth, thisMonth.AddDays(-1)),
            ("Last 7 days", today.AddDays(-6), today),
        ];
    }
}
