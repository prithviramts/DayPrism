using System.Globalization;
using System.IO.Compression;
using System.Text;
using DayLog.Web.Data;
using DayLog.Web.Domain;
using Microsoft.EntityFrameworkCore;

namespace DayLog.Web.Services;

/// <summary>
/// Builds the downloadable exports: a CSV of raw entries, the review markdown, and a zip of both.
///
/// The CSV is one table for every entry type ("long" format): a <c>kind</c> column says what
/// each row is, and columns that don't apply to that kind are empty. One file is easier to filter
/// in Excel or hand to Claude than seven separate ones.
/// </summary>
public sealed class ExportService(DayLogDbContext db, ReviewService reviews, LocalClock clock)
{
    private static readonly string[] Columns =
    [
        "kind", "date", "start_time", "end_time", "start_iso", "end_iso", "duration_min",
        "type", "description", "size", "skipped", "servings", "caffeine_mg", "glasses",
        "energy", "sleepiness", "mood", "sleep_quality", "times_woken", "day_rating",
        "went_well", "didnt_go_well", "do_differently", "notes", "is_demo",
    ];

    public static string FileStem(DateOnly? from, DateOnly? to) =>
        from is { } f && to is { } t ? $"daywise-{f:yyyy-MM-dd}_to_{t:yyyy-MM-dd}" : "daywise-all-data";

    /// <summary>CSV of every entry in the range (or all time when no range is given), in time order.</summary>
    public async Task<byte[]> BuildCsvAsync(DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var start = from?.ToDateTime(TimeOnly.MinValue) ?? DateTime.MinValue;
        var end = to?.AddDays(1).ToDateTime(TimeOnly.MinValue) ?? DateTime.MaxValue;
        var rows = new List<(DateTime Sort, Dictionary<string, string?> Values)>();

        void Add(DateTime sort, string kind, DateOnly date, TimedEntry? timed, DateTime? startTime, DateTime? endTime, Dictionary<string, string?> values)
        {
            values["kind"] = kind;
            values["date"] = date.ToString("yyyy-MM-dd");
            if (startTime is { } s)
            {
                values["start_time"] = s.ToString("HH:mm");
                values["start_iso"] = timed?.WithOffset(s).ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture);
            }
            if (endTime is { } e)
            {
                values["end_time"] = e.ToString("HH:mm");
                values["end_iso"] = timed?.WithOffset(e).ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture);
                if (startTime is { } s2) values["duration_min"] = ((int)Math.Round((e - s2).TotalMinutes)).ToString(CultureInfo.InvariantCulture);
            }
            rows.Add((sort, values));
        }

        static string N(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
        static string B(bool v) => v ? "true" : "false";

        foreach (var s in await db.SleepLogs.AsNoTracking().Where(x => x.WakeTime >= start && x.WakeTime < end).ToListAsync(ct))
            Add(s.BedTime, "sleep", DateOnly.FromDateTime(s.WakeTime), s, s.BedTime, s.WakeTime, new()
            {
                ["sleep_quality"] = s.Quality.ToString(), ["times_woken"] = s.TimesWoken.ToString(), ["notes"] = s.Notes, ["is_demo"] = B(s.IsSeed),
            });

        foreach (var m in await db.Meals.AsNoTracking().Where(x => x.Time >= start && x.Time < end).ToListAsync(ct))
            Add(m.Time, "meal", DateOnly.FromDateTime(m.Time), m, m.Time, null, new()
            {
                ["type"] = m.MealType.ToString(), ["description"] = m.Description, ["size"] = m.Size?.ToString(),
                ["skipped"] = B(m.Skipped), ["is_demo"] = B(m.IsSeed),
            });

        foreach (var c in await db.CaffeineIntakes.AsNoTracking().Where(x => x.Time >= start && x.Time < end).ToListAsync(ct))
            Add(c.Time, "caffeine", DateOnly.FromDateTime(c.Time), c, c.Time, null, new()
            {
                ["type"] = c.Type.ToString(), ["servings"] = N(c.Servings), ["caffeine_mg"] = c.CaffeineMg.ToString(), ["is_demo"] = B(c.IsSeed),
            });

        foreach (var w in await db.WaterIntakes.AsNoTracking().Where(x => x.Time >= start && x.Time < end).ToListAsync(ct))
            Add(w.Time, "water", DateOnly.FromDateTime(w.Time), w, w.Time, null, new()
            {
                ["glasses"] = w.Glasses.ToString(), ["is_demo"] = B(w.IsSeed),
            });

        foreach (var c in await db.EnergyCheckIns.AsNoTracking().Where(x => x.Time >= start && x.Time < end).ToListAsync(ct))
            Add(c.Time, "checkin", DateOnly.FromDateTime(c.Time), c, c.Time, null, new()
            {
                ["energy"] = c.Energy.ToString(), ["sleepiness"] = c.Sleepiness.ToString(), ["mood"] = c.Mood.ToString(),
                ["notes"] = c.Note, ["is_demo"] = B(c.IsSeed),
            });

        foreach (var a in await db.Activities.AsNoTracking().Where(x => x.StartTime >= start && x.StartTime < end).ToListAsync(ct))
            Add(a.StartTime, "activity", DateOnly.FromDateTime(a.StartTime), a, a.StartTime, a.EndTime, new()
            {
                ["type"] = a.Category.ToString(), ["notes"] = a.Notes, ["is_demo"] = B(a.IsSeed),
            });

        var fromDate = from ?? DateOnly.MinValue;
        var toDate = to ?? DateOnly.MaxValue;
        foreach (var r in await db.DailyReflections.AsNoTracking().Where(x => x.Date >= fromDate && x.Date <= toDate).ToListAsync(ct))
            // Reflections sort at the end of their day, after everything else that happened.
            Add(r.Date.ToDateTime(new TimeOnly(23, 59, 59)), "reflection", r.Date, null, null, null, new()
            {
                ["day_rating"] = r.DayRating.ToString(), ["went_well"] = r.WentWell, ["didnt_go_well"] = r.DidntGoWell,
                ["do_differently"] = r.DoDifferently, ["is_demo"] = B(r.IsSeed),
            });

        var csv = new StringBuilder();
        csv.Append(string.Join(',', Columns)).Append("\r\n");
        foreach (var (_, values) in rows.OrderBy(r => r.Sort))
            csv.Append(string.Join(',', Columns.Select(c => Escape(values.GetValueOrDefault(c))))).Append("\r\n");

        // UTF-8 with a byte-order mark, so Excel shows accents, Arabic and emoji correctly.
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray();
    }

    public async Task<string> BuildMarkdownAsync(DateOnly from, DateOnly to, CancellationToken ct = default) =>
        ReviewMarkdown.Build(await reviews.BuildAsync(from, to, ct), clock.TimeZoneId);

    /// <summary>The "Export for review" bundle: summary.md + raw data.csv in one zip.</summary>
    public async Task<byte[]> BuildZipAsync(DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var stem = FileStem(from, to);
        var markdown = await BuildMarkdownAsync(from, to, ct);
        var csv = await BuildCsvAsync(from, to, ct);

        using var buffer = new MemoryStream();
        using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            await using (var entry = zip.CreateEntry($"{stem}-review.md").Open())
                await entry.WriteAsync(Encoding.UTF8.GetBytes(markdown), ct);
            await using (var entry = zip.CreateEntry($"{stem}-data.csv").Open())
                await entry.WriteAsync(csv, ct);
        }
        return buffer.ToArray();
    }

    /// <summary>
    /// RFC 4180 CSV escaping. Also defuses "formula injection": text that starts with = + - @
    /// would be run as a formula by Excel, so it gets a leading apostrophe.
    /// </summary>
    public static string Escape(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        if (value[0] is '=' or '+' or '-' or '@' && !double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out _))
            value = "'" + value;
        return value.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    }
}
