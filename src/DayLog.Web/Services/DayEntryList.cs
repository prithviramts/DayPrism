using DayLog.Web.Domain;

namespace DayLog.Web.Services;

/// <summary>
/// One row in the History page's entry list.
/// <see cref="Sheet"/> is the quick-add sheet that edits it; <see cref="Key"/> ("meal-12") picks the
/// entry's values out of the page's JSON state. Sleep and reflection are one-per-day, so they need no key.
/// </summary>
public sealed record DayEntry(DateTime Time, string Icon, string Title, string Detail, string Sheet, string? Key);

public static class DayEntryList
{
    /// <summary>Every entry of the day as a flat list, in time order.</summary>
    public static IReadOnlyList<DayEntry> Build(DaySnapshot day)
    {
        var rows = new List<DayEntry>();

        if (day.Sleep is { } s)
            rows.Add(new(s.WakeTime, "🛏️", $"Sleep {DisplayNames.Duration(s.Duration)}",
                $"{s.BedTime:HH:mm} → {s.WakeTime:HH:mm} · quality {s.Quality}/5 · woke {s.TimesWoken}×", "sleep", null));

        foreach (var m in day.Meals)
            rows.Add(new(m.Time, DisplayNames.IconFor(m.MealType),
                m.Skipped ? $"Skipped {m.MealType.ToString().ToLowerInvariant()}" : m.MealType.ToString(),
                m.Skipped ? "" : $"{m.Description}" + (m.Size is { } size ? $" · {size.ToString().ToLowerInvariant()}" : ""),
                "meal", Key("meal", m.Id)));

        foreach (var c in day.Caffeine)
            rows.Add(new(c.Time, DisplayNames.IconFor(c.Type), DisplayNames.For(c.Type),
                $"{c.Servings:0.#}× · ~{c.CaffeineMg} mg", "caffeine", Key("caffeine", c.Id)));

        foreach (var w in day.Water)
            rows.Add(new(w.Time, "💧", "Water", $"{w.Glasses} glass{(w.Glasses == 1 ? "" : "es")}", "water", Key("water", w.Id)));

        foreach (var c in day.CheckIns)
            rows.Add(new(c.Time, "⚡", $"Energy {c.Energy}",
                $"sleepiness {c.Sleepiness} · mood {c.Mood}" + (c.Note is null ? "" : $" · {c.Note}"), "checkin", Key("checkin", c.Id)));

        foreach (var a in day.Activities)
        {
            var end = a.EndTime is { } e ? e.ToString("HH:mm") : "running";
            var duration = a.Duration is { } d ? $" · {DisplayNames.Duration(d)}" : "";
            rows.Add(new(a.StartTime, "▶️", DisplayNames.For(a.Category),
                $"{a.StartTime:HH:mm} → {end}{duration}" + (a.Notes is null ? "" : $" · {a.Notes}"), "activity", Key("activity", a.Id)));
        }

        return rows.OrderBy(r => r.Time).ThenBy(r => r.Sheet).ToList();
    }

    public static string Key(string kind, int id) => $"{kind}-{id}";
}
