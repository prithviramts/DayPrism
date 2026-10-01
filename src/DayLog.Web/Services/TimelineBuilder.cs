using DayLog.Web.Domain;

namespace DayLog.Web.Services;

/// <summary>The timeline has three side-by-side lanes so different kinds of entry never cover each other.</summary>
public enum TimelineLane { Blocks, Intake, CheckIns }

/// <summary>
/// One thing drawn on the timeline. Positions are in hours from the top of the timeline;
/// the page multiplies them by a CSS "pixels per hour" value, so layout stays in CSS.
/// </summary>
public sealed record TimelineItem(
    EntryKind Kind,
    int Id,
    TimelineLane Lane,
    double Top,
    double Height,
    string Label,
    string Detail,
    string CssClass,
    string? Icon = null,
    bool Running = false,
    bool ClippedTop = false)
{
    /// <summary>Horizontal slot within the lane, so markers logged close together sit side by side.</summary>
    public int Column { get; init; }
}

public sealed record TimelineModel(DateOnly Date, int StartHour, int EndHour, IReadOnlyList<TimelineItem> Items, double? NowOffset)
{
    public int Hours => EndHour - StartHour;
}

/// <summary>Turns a day's entries into positioned timeline items. Pure function, so it's easy to unit-test.</summary>
public static class TimelineBuilder
{
    /// <summary>
    /// How much vertical room (in hours) a point marker takes up. At ~60px per hour a marker is
    /// ~26px tall, so two markers closer together than this would overlap, and the second
    /// one moves to the next column instead.
    /// </summary>
    public const double MarkerHours = 0.45;

    /// <summary>Very short blocks still get enough height to be tapped.</summary>
    private const double MinBlockHours = 0.3;

    public static TimelineModel Build(DaySnapshot day)
    {
        var dayStart = day.Date.ToDateTime(TimeOnly.MinValue);
        double HourOf(DateTime t) => Math.Clamp((t - dayStart).TotalHours, 0, 24);

        double? nowHour = day.IsToday ? HourOf(day.Now) : null;

        // ---- Visible range: from just before waking up (or the first entry) to after the last entry / now.
        var pointHours = day.Meals.Select(m => HourOf(m.Time))
            .Concat(day.Caffeine.Select(c => HourOf(c.Time)))
            .Concat(day.Water.Select(w => HourOf(w.Time)))
            .Concat(day.CheckIns.Select(c => HourOf(c.Time)))
            .Concat(day.Activities.Select(a => HourOf(a.StartTime)))
            .ToList();

        var first = pointHours.Count > 0 ? pointHours.Min() : 7;
        if (day.Sleep is { } sleep) first = Math.Min(first, HourOf(sleep.WakeTime) - 1);
        var startHour = (int)Math.Floor(Math.Clamp(Math.Min(first, 7), 0, 23));

        var last = new[] { 21.0, nowHour ?? 0 }
            .Concat(pointHours)
            .Concat(day.Activities.Select(a => a.EndTime is { } e ? HourOf(e) : nowHour ?? 24))
            .Max();
        var endHour = Math.Min(24, (int)Math.Ceiling(last + 0.5));

        double Offset(double hour) => hour - startHour;
        var items = new List<TimelineItem>();

        // ---- Sleep: a block ending at wake-up. Bedtime was usually yesterday, so it's clipped at the top.
        if (day.Sleep is { } s)
        {
            var bedHour = s.BedTime < dayStart ? startHour : Math.Max(HourOf(s.BedTime), startHour);
            var wakeHour = HourOf(s.WakeTime);
            items.Add(new TimelineItem(EntryKind.Sleep, s.Id, TimelineLane.Blocks,
                Offset(bedHour), Math.Max(MinBlockHours, wakeHour - bedHour),
                $"Sleep {DisplayNames.Duration(s.Duration)}",
                $"Sleep · {s.BedTime:HH:mm} → {s.WakeTime:HH:mm} ·{DisplayNames.Duration(s.Duration)} · quality {s.Quality}/5 · woke {s.TimesWoken}×" + Suffix(s.Notes),
                "fam-sleep", "🛏️", ClippedTop: s.BedTime < dayStart.AddHours(startHour)));
        }

        // ---- Activities: blocks. A running one extends to "now" (or end of day when viewing a past day).
        foreach (var a in day.Activities)
        {
            var from = HourOf(a.StartTime);
            var to = a.EndTime is { } end ? HourOf(end) : nowHour ?? 24;
            var duration = (a.EndTime ?? day.Now) - a.StartTime;
            var name = DisplayNames.For(a.Category);
            items.Add(new TimelineItem(EntryKind.Activity, a.Id, TimelineLane.Blocks,
                Offset(Math.Max(from, startHour)), Math.Max(MinBlockHours, to - Math.Max(from, startHour)),
                name,
                $"{name} · {a.StartTime:HH:mm} → {(a.EndTime is { } e ? e.ToString("HH:mm") : "now")} · {DisplayNames.Duration(duration)}" + Suffix(a.Notes),
                $"fam-{DisplayNames.FamilyOf(a.Category)}", Running: a.IsRunning, ClippedTop: a.StartTime < dayStart));
        }

        // ---- Food & drink: point markers in the middle lane.
        foreach (var m in day.Meals)
        {
            var label = m.Skipped ? $"Skipped {m.MealType.ToString().ToLowerInvariant()}" : m.MealType.ToString();
            var detail = m.Skipped
                ? $"{label} · {m.Time:HH:mm}"
                : $"{m.MealType} · {m.Time:HH:mm} · {m.Description}" + (m.Size is { } size ? $" ({size.ToString().ToLowerInvariant()})" : "");
            items.Add(new TimelineItem(EntryKind.Meal, m.Id, TimelineLane.Intake, Offset(HourOf(m.Time)), 0,
                label, detail, m.Skipped ? "marker skipped" : "marker", DisplayNames.IconFor(m.MealType)));
        }

        foreach (var c in day.Caffeine)
        {
            var name = DisplayNames.For(c.Type);
            items.Add(new TimelineItem(EntryKind.Caffeine, c.Id, TimelineLane.Intake, Offset(HourOf(c.Time)), 0,
                name, $"{name} · {c.Time:HH:mm} · {c.Servings:0.#}× · ~{c.CaffeineMg} mg", "marker", DisplayNames.IconFor(c.Type)));
        }

        foreach (var w in day.Water)
        {
            items.Add(new TimelineItem(EntryKind.Water, w.Id, TimelineLane.Intake, Offset(HourOf(w.Time)), 0,
                "Water", $"Water · {w.Time:HH:mm} · {w.Glasses} glass{(w.Glasses == 1 ? "" : "es")}", "marker water", "💧"));
        }

        // ---- Energy check-ins: a dot showing the energy number, shaded by level.
        foreach (var c in day.CheckIns)
        {
            items.Add(new TimelineItem(EntryKind.CheckIn, c.Id, TimelineLane.CheckIns, Offset(HourOf(c.Time)), 0,
                c.Energy.ToString(),
                $"Check-in · {c.Time:HH:mm} · energy {c.Energy} · sleepiness {c.Sleepiness} · mood {c.Mood}" + Suffix(c.Note),
                $"checkin lvl-{c.Energy}"));
        }

        var positioned = items.GroupBy(i => i.Lane).SelectMany(AssignColumns).ToList();
        return new TimelineModel(day.Date, startHour, endHour, positioned, nowHour is { } n ? Offset(n) : null);
    }

    /// <summary>
    /// Greedy column packing: walk items top to bottom and put each in the first column whose
    /// previous item has already ended. Same idea as how calendar apps lay out clashing events.
    /// </summary>
    private static IEnumerable<TimelineItem> AssignColumns(IEnumerable<TimelineItem> laneItems)
    {
        var columnEnds = new List<double>();
        foreach (var item in laneItems.OrderBy(i => i.Top).ThenBy(i => i.Kind))
        {
            var column = columnEnds.FindIndex(end => end <= item.Top + 1e-9);
            if (column < 0)
            {
                column = columnEnds.Count;
                columnEnds.Add(0);
            }
            columnEnds[column] = item.Top + Math.Max(item.Height, MarkerHours);
            yield return item with { Column = column };
        }
    }

    private static string Suffix(string? note) => string.IsNullOrWhiteSpace(note) ? "" : $" · “{note}”";
}
