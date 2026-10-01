using System.Text;

namespace DayLog.Web.Services;

/// <summary>
/// Turns a <see cref="ReviewReport"/> into a markdown file meant to be pasted into Claude.
/// It opens with the request, then context (scales, time zone, caveats), then the data, so
/// the reviewer knows what the numbers mean before reading them.
/// </summary>
public static class ReviewMarkdown
{
    public static string Build(ReviewReport r, string timeZoneId)
    {
        var md = new StringBuilder();
        var i = r.Insights;
        void Line(string text = "") => md.Append(text).Append('\n');

        Line($"# Daywise review: {r.From:d MMM} – {r.To:d MMM yyyy}");
        Line();
        Line("## What I'd like from you");
        Line();
        Line("This is a summary of my own daily tracking (sleep, meals, caffeine, water, energy check-ins, activities and end-of-day reflections). Please give me an honest, specific review:");
        Line();
        Line("1. **What to change**: the few habits that seem to hurt my energy, sleep or day rating most, ranked by likely impact.");
        Line("2. **What to improve**: things that are OK but could be better, with a concrete target for each.");
        Line("3. **What I'm doing well**: patterns worth keeping.");
        Line("4. **Experiments for the next 30 days**: 2–3 small, measurable changes I can track in Daywise.");
        Line();
        Line("Be direct. Use my reflections as well as the numbers. Where a group has only a few days, say the evidence is thin rather than drawing a firm conclusion. These are correlations in my own data, not proof of cause and effect.");
        Line();

        // ---- Context
        Line("## Context");
        Line();
        Line($"- Period: {r.From:ddd d MMM yyyy} to {r.To:ddd d MMM yyyy} ({r.DaysInRange} days, {r.DaysLogged} with entries).");
        Line($"- Time zone: {timeZoneId}. Work week: Monday to Friday (Saturday and Sunday off).");
        Line("- Energy, mood, sleep quality and day rating are 1–5 where **5 is best**. Sleepiness is 1–5 where **5 is very sleepy**.");
        Line("- A night's sleep belongs to the day I woke up. \"That night's sleep\" after caffeine means the sleep I woke up from the next morning.");
        if (r.To >= r.Today) Line("- The last day is today and still in progress, so its numbers are incomplete.");
        if (r.DemoRows > 0)
            Line($"- ⚠️ **{r.DemoRows} entries in this period are generated demo data, not real.** Treat the review as a test run.");
        Line();

        // ---- Averages
        Line("## Averages");
        Line();
        Line("| Measure | Value |");
        Line("|---|---|");
        Line($"| Sleep per night | {Hm(r.Avg(d => d.SleepHours))} ({i.Sleep.Nights} nights logged) |");
        Line($"| Typical bedtime / wake time | {i.Sleep.AvgBedTime ?? "–"} / {i.Sleep.AvgWakeTime ?? "–"} |");
        Line($"| Nights under 6h / 7h or more | {i.Sleep.ShortNights} / {i.Sleep.LongNights} |");
        Line($"| Sleep quality | {One(r.Avg(d => d.SleepQuality))} / 5 |");
        Line($"| Energy (daily average) | {One(r.Avg(d => d.AvgEnergy))} / 5 |");
        Line($"| Sleepiness | {One(r.Avg(d => d.AvgSleepiness))} / 5 |");
        Line($"| Mood | {One(r.Avg(d => d.AvgMood))} / 5 |");
        Line($"| Day rating | {One(r.Avg(d => d.DayRating))} / 5 ({r.Days.Count(d => d.DayRating is not null)} days rated) |");
        Line($"| Caffeine per logged day | {One(r.AvgPerLoggedDay(d => d.CaffeineDrinks))} drinks, ~{r.AvgPerLoggedDay(d => d.CaffeineMg) ?? 0:0} mg |");
        Line($"| Days with caffeine after 15:00 | {r.Days.Count(d => d.LastCaffeine >= new TimeOnly(15, 0))} |");
        Line($"| Skipped meals | {r.Days.Sum(d => d.MealsSkipped)} (breakfast skipped on {r.Days.Count(d => d.AteBreakfast == false)} days) |");
        Line($"| Water per logged day | {One(r.AvgPerLoggedDay(d => d.WaterGlasses))} glasses |");
        Line($"| Exercise | {r.Days.Count(d => d.ExerciseMinutes > 0)} days, {r.Days.Sum(d => d.ExerciseMinutes) / 60.0:0.#}h total |");
        Line();

        // ---- Patterns
        Line("## Patterns found in the data");
        Line();
        void Pattern(string name, Takeaway t) => Line($"- **{name}:** {t.Text}{(t.Enough ? "" : " _(not enough data yet)_")}");
        Pattern("Sleep", i.SleepTakeaway);
        Pattern("Energy through the day", i.HourlyTakeaway);
        Pattern("Short vs long nights", i.SleepVsEnergyTakeaway);
        Pattern("Caffeine timing vs sleep", i.CaffeineTakeaway);
        Pattern("Breakfast vs morning energy", i.BreakfastTakeaway);
        Pattern("Where the time goes", i.ActivityTakeaway);
        Pattern("Day rating", i.RatingTakeaway);
        Line();

        if (i.Hourly.Count > 0)
        {
            Line("Energy and sleepiness by hour of day (average of all check-ins in that hour):");
            Line();
            Line("| Hour | Energy | Sleepiness | Check-ins |");
            Line("|---|---|---|---|");
            foreach (var h in i.Hourly) Line($"| {h.Hour:00}:00 | {h.Energy:0.0} | {h.Sleepiness:0.0} | {h.CheckIns} |");
            Line();
        }

        // ---- Streaks
        Line("## Streaks");
        Line();
        Line("| Habit | Current | Longest | Days met |");
        Line("|---|---|---|---|");
        foreach (var s in r.Streaks)
        {
            var longest = s.Longest > 0 ? $"{s.Longest} ({s.LongestFrom:d MMM}–{s.LongestTo:d MMM})" : "0";
            Line($"| {s.Name} ({s.Description}) | {s.Current} | {longest} | {s.DaysMet} of {s.DaysCounted} |");
        }
        Line();

        // ---- Best and hardest days
        void Notable(string title, IReadOnlyList<NotableDay> list)
        {
            Line($"### {title}");
            Line();
            if (list.Count == 0) Line("_Not enough rated days yet._");
            foreach (var n in list)
            {
                Line($"- **{n.Day.Date:ddd d MMM}**: {n.Why}");
                if (n.Day.Reflection?.WentWell is { } well) Line($"  - Went well: {Inline(well)}");
                if (n.Day.Reflection?.DidntGoWell is { } bad) Line($"  - Didn't: {Inline(bad)}");
            }
            Line();
        }
        Line("## Best and hardest days");
        Line();
        Notable("Best days", r.BestDays);
        Notable("Hardest days", r.HardestDays);

        // ---- Day by day
        Line("## Day by day");
        Line();
        Line("| Date | Sleep | Bed–wake | Sleep Q | Energy | Energy before noon | Caffeine (last) | Breakfast | Meals skipped | Water | Exercise | Deep work | Screen time | Day rating |");
        Line("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
        foreach (var d in r.Days.Where(d => d.HasData))
        {
            var bedWake = d.BedTime is null ? "–" : $"{d.BedTime}–{d.WakeTime}";
            var caf = d.CaffeineDrinks == 0 ? "0" : $"{d.CaffeineDrinks} ({d.LastCaffeine:HH:mm})";
            var breakfast = d.AteBreakfast switch { true => "ate", false => "skipped", null => "–" };
            Line($"| {d.Date:ddd d MMM} | {Hm(d.SleepHours)} | {bedWake} | {d.SleepQuality?.ToString() ?? "–"} | {One(d.AvgEnergy)} | {One(d.MorningEnergy)} | {caf} | {breakfast} | {d.MealsSkipped} | {d.WaterGlasses} | {Min(d.ExerciseMinutes)} | {Min(d.DeepWorkMinutes)} | {Min(d.ScreenTimeMinutes)} | {d.DayRating?.ToString() ?? "–"} |");
        }
        Line();

        // ---- Reflections
        Line("## Daily reflections");
        Line();
        if (!r.Reflections.Any()) Line("_No reflections written in this period._");
        foreach (var d in r.Reflections)
        {
            var refl = d.Reflection!;
            Line($"### {d.Date:ddd d MMM}: day rating {refl.DayRating}/5");
            Line();
            if (refl.WentWell is { } a) Line($"- **Went well:** {Inline(a)}");
            if (refl.DidntGoWell is { } b) Line($"- **Didn't go well:** {Inline(b)}");
            if (refl.DoDifferently is { } c) Line($"- **Do differently tomorrow:** {Inline(c)}");
            Line();
        }

        Line("---");
        Line($"_Exported from Daywise. The raw entries for this period are in the matching CSV file._");
        return md.ToString();
    }

    private static string Hm(double? hours) => hours is { } h ? InsightsService.Hm(h) : "–";
    private static string One(double? value) => value is { } v ? v.ToString("0.0") : "–";
    private static string Min(int minutes) => minutes == 0 ? "–" : minutes >= 60 ? InsightsService.Hm(minutes / 60.0) : $"{minutes}m";

    /// <summary>Keeps free text on one markdown line and stops a stray "|" breaking a table.</summary>
    private static string Inline(string text) => text.ReplaceLineEndings(" ").Replace("|", "\\|").Trim();
}
