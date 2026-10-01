using System.IO.Compression;
using System.Text;
using DayLog.Web.Domain;
using DayLog.Web.Services;
using Microsoft.Extensions.Options;

namespace DayLog.Tests;

public class ReviewTests : IDisposable
{
    // TestDatabase's clock: Thu 2026-10-01, 12:00 Dubai.
    private readonly TestDatabase _testDb = new();
    private readonly Web.Data.DayLogDbContext _db;
    private readonly EntryService _entries;
    private readonly ReviewService _reviews;
    private static readonly DateOnly Today = new(2026, 10, 1);

    public ReviewTests()
    {
        _db = _testDb.CreateContext();
        _entries = new EntryService(_db, _testDb.Clock);
        _reviews = new ReviewService(_db, new InsightsService(_db, _testDb.Clock), _testDb.Clock);
    }

    public void Dispose()
    {
        _db.Dispose();
        _testDb.Dispose();
    }

    private static DateTime At(DateOnly d, int h, int m = 0) => d.ToDateTime(new TimeOnly(h, m));

    /// <summary>A DayRow with just the fields a test cares about.</summary>
    private static DayRow Row(DateOnly date, bool hasData = true, double? sleep = null, int? rating = null, double? energy = null,
        bool? ateBreakfast = null, int exercise = 0, TimeOnly? lastCaffeine = null) =>
        new(date, hasData, sleep, null, null, null, 0, energy, null, null, null, lastCaffeine is null ? 0 : 1, 0, lastCaffeine,
            0, 0, ateBreakfast, 0, exercise, 0, 0, rating,
            rating is { } r ? new DailyReflection { Date = date, DayRating = r } : null);

    // ---------------------------------------------------------------- range

    [Fact]
    public void Range_defaults_to_last_30_days_and_never_passes_today()
    {
        Assert.Equal((Today.AddDays(-29), Today), ReviewRange.Resolve(null, null, Today));
        Assert.Equal((Today.AddDays(-29), Today), ReviewRange.Resolve(null, Today.AddDays(10), Today));
        Assert.Equal((new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 10)),
            ReviewRange.Resolve(new DateOnly(2026, 9, 10), new DateOnly(2026, 9, 1), Today)); // swapped
        var (from, to) = ReviewRange.Resolve(new DateOnly(2006, 1, 1), Today, Today);
        Assert.Equal(ReviewService.MaxRangeDays, to.DayNumber - from.DayNumber + 1);
    }

    [Fact]
    public void Presets_include_last_full_month()
    {
        var presets = ReviewRange.Presets(Today);

        Assert.Contains(presets, p => p.Label == "September" && p.From == new DateOnly(2026, 9, 1) && p.To == new DateOnly(2026, 9, 30));
    }

    // ---------------------------------------------------------------- streaks

    [Fact]
    public void Streaks_skip_days_where_a_habit_does_not_apply()
    {
        var d = new DateOnly(2026, 9, 20);
        DayRow[] days =
        [
            Row(d, ateBreakfast: true),
            Row(d.AddDays(1), ateBreakfast: null),   // breakfast not logged: doesn't break the run
            Row(d.AddDays(2), ateBreakfast: true),
            Row(d.AddDays(3), ateBreakfast: false),  // skipped: breaks it
            Row(d.AddDays(4), ateBreakfast: true),
        ];

        var breakfast = ReviewService.BuildStreaks(days, Today).Single(s => s.Name == "Breakfast");

        Assert.Equal(2, breakfast.Longest);
        Assert.Equal((d, d.AddDays(2)), (breakfast.LongestFrom!.Value, breakfast.LongestTo!.Value));
        Assert.Equal(1, breakfast.Current);
        Assert.Equal((3, 4), (breakfast.DaysMet, breakfast.DaysCounted));
    }

    [Fact]
    public void Current_streak_is_not_broken_by_today_still_in_progress()
    {
        DayRow[] days =
        [
            Row(Today.AddDays(-2), rating: 3),
            Row(Today.AddDays(-1), rating: 4),
            Row(Today, rating: null), // no reflection yet: it's only midday
        ];

        var reflection = ReviewService.BuildStreaks(days, Today).Single(s => s.Name == "Reflection");

        Assert.Equal(2, reflection.Current);
    }

    [Fact]
    public void Caffeine_streak_counts_days_without_caffeine_as_met()
    {
        DayRow[] days =
        [
            Row(Today.AddDays(-3), lastCaffeine: new TimeOnly(9, 0)),
            Row(Today.AddDays(-2)),                                    // no caffeine at all: fine
            Row(Today.AddDays(-1), lastCaffeine: new TimeOnly(16, 30)), // too late
        ];

        var caffeine = ReviewService.BuildStreaks(days, Today).Single(s => s.Name == "Caffeine before 15:00");

        Assert.Equal(2, caffeine.Longest);
        Assert.Equal(0, caffeine.Current);
    }

    // ---------------------------------------------------------------- best & hardest

    [Fact]
    public void Best_and_hardest_never_overlap_and_tie_break_on_energy()
    {
        var d = new DateOnly(2026, 9, 20);
        DayRow[] days =
        [
            Row(d, rating: 5, energy: 3.0),
            Row(d.AddDays(1), rating: 5, energy: 4.0), // same rating, more energy: ranks first
            Row(d.AddDays(2), rating: 2, energy: 2.0),
            Row(d.AddDays(3), rating: 1, energy: 2.5),
            Row(d.AddDays(4), rating: null),            // unrated: ignored
        ];

        var (best, hardest) = ReviewService.PickNotableDays(days);

        Assert.Equal([d.AddDays(1), d], best.Select(b => b.Day.Date));
        Assert.Equal([d.AddDays(3), d.AddDays(2)], hardest.Select(h => h.Day.Date));
        Assert.Contains("rated 5/5", best[0].Why);
    }

    // ---------------------------------------------------------------- the full report

    [Fact]
    public async Task Day_rows_summarise_each_day()
    {
        var d = Today.AddDays(-1);
        await _entries.UpsertSleepAsync(new SleepRequest(d, new TimeOnly(23, 0), new TimeOnly(6, 30), 4, 1, null));
        await _entries.AddCheckInAsync(new CheckInRequest(At(d, 9), 2, 4, 3, null));
        await _entries.AddCheckInAsync(new CheckInRequest(At(d, 15), 4, 2, 4, null));
        await _entries.AddMealAsync(new MealRequest(At(d, 7), MealType.Breakfast, null, null, true));
        await _entries.AddCaffeineAsync(new CaffeineRequest(At(d, 16, 45), CaffeineType.Coffee, 1, null));
        await _entries.StartActivityAsync(new ActivityRequest(At(d, 18), At(d, 19), ActivityCategory.Exercise, null));
        await _entries.UpsertReflectionAsync(new ReflectionRequest(d, "gym", "tired", "sleep earlier", 3));

        var report = await _reviews.BuildAsync(d, d);
        var row = Assert.Single(report.Days);

        Assert.Equal(7.5, row.SleepHours!.Value, 3);
        Assert.Equal(3.0, row.AvgEnergy);
        Assert.Equal(2.0, row.MorningEnergy);
        Assert.False(row.AteBreakfast);
        Assert.Equal(new TimeOnly(16, 45), row.LastCaffeine);
        Assert.Equal(60, row.ExerciseMinutes);
        Assert.Equal(3, row.DayRating);
        Assert.Equal(0, report.DemoRows);
    }

    [Fact]
    public async Task Markdown_has_the_request_context_data_and_reflections()
    {
        var d = Today.AddDays(-1);
        await _entries.AddCheckInAsync(new CheckInRequest(At(d, 9), 3, 3, 3, null));
        await _entries.UpsertReflectionAsync(new ReflectionRequest(d, "Shipped | the feature", null, "Bed by 23:00\nno phone", 4));

        var md = ReviewMarkdown.Build(await _reviews.BuildAsync(d.AddDays(-6), Today), "Asia/Dubai");

        Assert.StartsWith("# Daywise review: 24 Sep – 1 Oct 2026", md);
        Assert.Contains("## What I'd like from you", md);
        Assert.Contains("**What to change**", md);
        Assert.Contains("Asia/Dubai", md);
        Assert.Contains("5 is very sleepy", md);
        Assert.Contains("still in progress", md);                 // range ends today
        Assert.Contains("## Day by day", md);
        Assert.Contains("### Wed 30 Sep: day rating 4/5", md);
        Assert.Contains(@"Shipped \| the feature", md);           // pipe escaped
        Assert.Contains("Bed by 23:00 no phone", md);             // kept on one line
        Assert.DoesNotContain("demo data, not real", md);
    }

    [Fact]
    public async Task Markdown_warns_about_demo_data()
    {
        await new SeedService(_db, _testDb.Clock, _testDb.Options).SeedAsync();

        var md = ReviewMarkdown.Build(await _reviews.BuildAsync(Today.AddDays(-29), Today), "Asia/Dubai");

        Assert.Contains("generated demo data, not real", md);
        Assert.Contains("### Best days", md);
        Assert.DoesNotContain("Not enough rated days", md);
    }

    // ---------------------------------------------------------------- CSV

    [Theory]
    [InlineData(null, "")]
    [InlineData("plain", "plain")]
    [InlineData("a, b", "\"a, b\"")]
    [InlineData("say \"hi\"", "\"say \"\"hi\"\"\"")]
    [InlineData("line1\nline2", "\"line1\nline2\"")]
    [InlineData("=HYPERLINK(\"x\")", "\"'=HYPERLINK(\"\"x\"\")\"")] // formula defused
    [InlineData("-5", "-5")]                                       // real numbers untouched
    public void Csv_escaping(string? input, string expected) => Assert.Equal(expected, ExportService.Escape(input));

    [Fact]
    public async Task Csv_has_one_row_per_entry_in_time_order_with_offsets()
    {
        var d = Today.AddDays(-1);
        await _entries.AddCheckInAsync(new CheckInRequest(At(d, 15), 4, 2, 4, "after lunch, ok"));
        await _entries.UpsertSleepAsync(new SleepRequest(d, new TimeOnly(23, 30), new TimeOnly(6, 30), 3, 0, null));
        await _entries.UpsertReflectionAsync(new ReflectionRequest(d, "x", null, null, 4));
        await _entries.AddWaterAsync(new WaterRequest(At(Today.AddDays(-5), 9))); // outside the range below
        var exports = new ExportService(_db, _reviews, _testDb.Clock);

        var csv = Encoding.UTF8.GetString(await exports.BuildCsvAsync(d, d)).TrimStart('﻿');
        var lines = csv.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);

        Assert.StartsWith("kind,date,start_time,end_time,start_iso", lines[0]);
        Assert.Equal(4, lines.Length); // header + sleep + check-in + reflection
        Assert.StartsWith("sleep,2026-09-30,23:30,06:30,2026-09-29T23:30:00+04:00,2026-09-30T06:30:00+04:00,420", lines[1]);
        Assert.StartsWith("checkin,2026-09-30,15:00", lines[2]);
        Assert.Contains("\"after lunch, ok\"", lines[2]);
        Assert.StartsWith("reflection,2026-09-30", lines[3]);
    }

    [Fact]
    public async Task Zip_contains_markdown_and_csv()
    {
        var exports = new ExportService(_db, _reviews, _testDb.Clock);

        var bytes = await exports.BuildZipAsync(Today.AddDays(-6), Today);
        using var zip = new ZipArchive(new MemoryStream(bytes));

        Assert.Equal(
            ["daywise-2026-09-25_to_2026-10-01-data.csv", "daywise-2026-09-25_to_2026-10-01-review.md"],
            zip.Entries.Select(e => e.FullName).Order());
    }
}
