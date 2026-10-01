using DayLog.Web.Domain;
using DayLog.Web.Services;

namespace DayLog.Web.Pages;

/// <summary>
/// Data the entry sheets need, embedded in the page as JSON (see daylog.js):
/// which day the page shows, defaults for new entries, and the current values of every
/// entry so an edit sheet can open pre-filled without another request.
/// Property names match the sheets' form field names, so the script can fill forms generically.
/// </summary>
public sealed record DayClientState(
    string Date,
    bool IsToday,
    string TimeZone,
    int[] LastCheckIn,
    DayClientState.RunningActivity? Running,
    DayClientState.SleepValues? Sleep,
    DayClientState.ReflectionValues? Reflection,
    IReadOnlyDictionary<string, object> Entries)
{
    public sealed record RunningActivity(int Id, string Label, string StartTime);
    public sealed record SleepValues(int Id, string BedTime, string WakeTime, int Quality, int TimesWoken, string? Notes);
    public sealed record ReflectionValues(int Id, string? WentWell, string? DidntGoWell, string? DoDifferently, int DayRating);

    public static DayClientState From(DaySnapshot day, string timeZone) => new(
        day.Date.ToString("yyyy-MM-dd"),
        day.IsToday,
        timeZone,
        // Pre-fill a new check-in with your last values: usually only one of the three changed.
        day.LatestCheckIn is { } c ? [c.Energy, c.Sleepiness, c.Mood] : [3, 3, 3],
        day.RunningActivity is { } a
            ? new RunningActivity(a.Id, DisplayNames.For(a.Category), a.StartTime.ToString("yyyy-MM-ddTHH:mm:ss"))
            : null,
        day.Sleep is { } s
            ? new SleepValues(s.Id, Time(s.BedTime), Time(s.WakeTime), s.Quality, s.TimesWoken, s.Notes)
            : null,
        day.Reflection is { } r
            ? new ReflectionValues(r.Id, r.WentWell, r.DidntGoWell, r.DoDifferently, r.DayRating)
            : null,
        EntryValues(day));

    private static Dictionary<string, object> EntryValues(DaySnapshot day)
    {
        var entries = new Dictionary<string, object>();

        foreach (var m in day.Meals)
            entries[DayEntryList.Key("meal", m.Id)] = new
            {
                date = DateOf(m.Time), time = Time(m.Time), mealType = m.MealType, description = m.Description, size = m.Size, skipped = m.Skipped,
            };

        foreach (var c in day.Caffeine)
            entries[DayEntryList.Key("caffeine", c.Id)] = new
            {
                date = DateOf(c.Time), time = Time(c.Time), type = c.Type, servings = c.Servings, caffeineMg = c.CaffeineMg,
            };

        foreach (var w in day.Water)
            entries[DayEntryList.Key("water", w.Id)] = new { date = DateOf(w.Time), time = Time(w.Time), glasses = w.Glasses };

        foreach (var c in day.CheckIns)
            entries[DayEntryList.Key("checkin", c.Id)] = new
            {
                date = DateOf(c.Time), time = Time(c.Time), energy = c.Energy, sleepiness = c.Sleepiness, mood = c.Mood, note = c.Note,
            };

        // An activity keeps its own start date, which can be the previous day if it ran past midnight.
        foreach (var a in day.Activities)
            entries[DayEntryList.Key("activity", a.Id)] = new
            {
                date = DateOf(a.StartTime),
                startTime = Time(a.StartTime),
                endTime = a.EndTime is { } e ? Time(e) : null,
                finished = a.EndTime is not null,
                category = a.Category,
                notes = a.Notes,
            };

        return entries;
    }

    private static string DateOf(DateTime t) => t.ToString("yyyy-MM-dd");
    private static string Time(DateTime t) => t.ToString("HH:mm");
}
