using DayLog.Web.Domain;
using DayLog.Web.Services;

namespace DayLog.Tests;

public class InsightsServiceTests : IDisposable
{
    // TestDatabase's clock: 2026-10-01 12:00 Dubai.
    private readonly TestDatabase _testDb = new();
    private readonly Web.Data.DayLogDbContext _db;
    private readonly EntryService _entries;
    private readonly InsightsService _insights;
    private static readonly DateOnly D1 = new(2026, 9, 21); // a Monday

    public InsightsServiceTests()
    {
        _db = _testDb.CreateContext();
        _entries = new EntryService(_db, _testDb.Clock);
        _insights = new InsightsService(_db, _testDb.Clock);
    }

    public void Dispose()
    {
        _db.Dispose();
        _testDb.Dispose();
    }

    private static DateTime At(DateOnly d, int h, int m = 0) => d.ToDateTime(new TimeOnly(h, m));

    private Task Sleep(DateOnly wake, int bedH, int bedM, int wakeH, int quality = 3) =>
        _entries.UpsertSleepAsync(new SleepRequest(wake, new TimeOnly(bedH, bedM), new TimeOnly(wakeH, 0), quality, 0, null));

    private Task CheckIn(DateOnly d, int h, int energy, int sleepiness = 3) =>
        _entries.AddCheckInAsync(new CheckInRequest(At(d, h), energy, sleepiness, 3, null));

    [Fact]
    public void Clock_conversion_handles_midnight()
    {
        Assert.Equal("23:30", InsightsService.ClockFromSixPm(5.5));
        Assert.Equal("00:15", InsightsService.ClockFromSixPm(6.25));
        Assert.Equal("06:30", InsightsService.ClockFromSixPm(12.5));
    }

    [Fact]
    public async Task Average_bedtime_across_midnight_is_correct()
    {
        // 23:30 and 00:30 should average to 00:00, not noon (the classic wrap-around bug).
        await Sleep(D1, 23, 30, 7);
        await Sleep(D1.AddDays(1), 0, 30, 7);

        var r = await _insights.BuildAsync(D1, D1.AddDays(1));

        Assert.Equal("00:00", r.Sleep.AvgBedTime);
        Assert.Equal(2, r.Nights.Count);
        Assert.Equal(5.5, r.Nights[0].Bed, 3);
    }

    [Fact]
    public async Task Sleep_buckets_use_one_value_per_day()
    {
        // Two short nights followed by low energy, two long nights followed by high energy.
        await Sleep(D1, 1, 0, 6);                // 5h
        await Sleep(D1.AddDays(1), 1, 30, 7);    // 5.5h
        await Sleep(D1.AddDays(2), 22, 30, 7);   // 8.5h
        await Sleep(D1.AddDays(3), 23, 0, 7);    // 8h
        // Day 1 has many check-ins; it must still count as a single day.
        foreach (var h in new[] { 9, 10, 11, 12, 13, 14 }) await CheckIn(D1, h, 2, 4);
        await CheckIn(D1.AddDays(1), 10, 2, 4);
        await CheckIn(D1.AddDays(2), 10, 4, 2);
        await CheckIn(D1.AddDays(3), 10, 5, 1);

        var r = await _insights.BuildAsync(D1, D1.AddDays(3));

        var (shortNights, longNights) = (r.SleepBuckets[0], r.SleepBuckets[2]);
        Assert.Equal((2, 2.0), (shortNights.Days, shortNights.Energy!.Value));
        Assert.Equal((2, 4.5), (longNights.Days, longNights.Energy!.Value));
        Assert.True(r.SleepVsEnergyTakeaway.Enough);
        Assert.Contains("2.0", r.SleepVsEnergyTakeaway.Text);
    }

    [Fact]
    public async Task Comparisons_say_not_enough_data_below_minimum()
    {
        await Sleep(D1, 1, 0, 6);
        await CheckIn(D1, 10, 2);

        var r = await _insights.BuildAsync(D1, D1);

        Assert.False(r.SleepVsEnergyTakeaway.Enough);
        Assert.Contains("have 1 and 0", r.SleepVsEnergyTakeaway.Text);
        Assert.False(r.CaffeineTakeaway.Enough);
        Assert.False(r.BreakfastTakeaway.Enough);
    }

    [Fact]
    public async Task Caffeine_is_matched_with_the_following_night()
    {
        await _entries.AddCaffeineAsync(new CaffeineRequest(At(D1, 8), CaffeineType.Coffee, 1, null));
        await _entries.AddCaffeineAsync(new CaffeineRequest(At(D1, 17, 30), CaffeineType.Coffee, 1, null));
        await Sleep(D1, 22, 0, 6, quality: 5);            // the night BEFORE: must not be used
        await Sleep(D1.AddDays(1), 1, 0, 7, quality: 2);  // that night: 6h, poor

        var r = await _insights.BuildAsync(D1, D1);

        var p = Assert.Single(r.CaffeinePoints);
        Assert.Equal("17:30", p.LastCaffeineTime);
        Assert.Equal(6, p.NightSleepHours, 3);
        Assert.Equal(2, p.NightQuality);
        Assert.Equal(1, r.CaffeineBuckets[2].Days); // "After 16:00"
    }

    [Fact]
    public async Task Breakfast_compares_only_logged_days_and_only_morning_check_ins()
    {
        var ate = D1;
        var skipped = D1.AddDays(1);
        var notLogged = D1.AddDays(2);
        await _entries.AddMealAsync(new MealRequest(At(ate, 7), MealType.Breakfast, "Oats", MealSize.Normal, false));
        await _entries.AddMealAsync(new MealRequest(At(skipped, 7), MealType.Breakfast, null, null, true));
        await CheckIn(ate, 10, 4);
        await CheckIn(ate, 15, 1);       // afternoon: ignored
        await CheckIn(skipped, 10, 2);
        await CheckIn(notLogged, 10, 5); // no breakfast entry: ignored

        var r = await _insights.BuildAsync(D1, D1.AddDays(2));

        Assert.Equal((1, 4.0), (r.Breakfast[0].Days, r.Breakfast[0].MorningEnergy!.Value));
        Assert.Equal((1, 2.0), (r.Breakfast[1].Days, r.Breakfast[1].MorningEnergy!.Value));
    }

    [Fact]
    public async Task Weekly_hours_are_clipped_to_week_and_range()
    {
        // Sunday 23:00 → Monday 01:00 splits across two weeks.
        var sunday = D1.AddDays(-1);
        await _entries.StartActivityAsync(new ActivityRequest(At(sunday, 23), At(D1, 1), ActivityCategory.ScreenTime, null));
        await _entries.StartActivityAsync(new ActivityRequest(At(D1, 9), At(D1, 12), ActivityCategory.DeepWork, null));

        var r = await _insights.BuildAsync(sunday, D1.AddDays(6));

        Assert.Equal(2, r.Weeks.Count);
        Assert.Equal(1, r.Weeks[0].HoursByCategory["ScreenTime"], 3);
        Assert.True(r.Weeks[0].Partial);       // only Sunday of that week is in range
        Assert.Equal(1, r.Weeks[1].HoursByCategory["ScreenTime"], 3);
        Assert.Equal(3, r.Weeks[1].HoursByFamily["work"], 3);
        Assert.False(r.Weeks[1].Partial);
    }

    [Fact]
    public async Task Rating_rolling_average_needs_three_ratings()
    {
        for (var i = 0; i < 4; i++)
            await _entries.UpsertReflectionAsync(new ReflectionRequest(D1.AddDays(i), null, null, null, i + 2)); // 2,3,4,5

        var r = await _insights.BuildAsync(D1, D1.AddDays(3));

        Assert.Null(r.Ratings[1].RollingAverage);
        Assert.Equal(3.0, r.Ratings[2].RollingAverage);
        Assert.Equal(3.5, r.Ratings[3].RollingAverage);
        Assert.Contains("Average day rating 3.5", r.RatingTakeaway.Text);
    }

    [Theory]
    [InlineData("2026-10-01")]
    [InlineData("2026-10-02")]
    [InlineData("2026-10-03")]
    [InlineData("2026-11-15")]
    [InlineData("2027-01-04")]
    [InlineData("2027-03-20")]
    public async Task Demo_data_has_enough_of_every_pattern_for_the_charts(string today)
    {
        // The seed exists so the Insights page has something to show. Every comparison should
        // have enough days on both sides with the default 14 days, whatever day you seed on.
        var utcNow = new DateTimeOffset(DateOnly.Parse(today).ToDateTime(new TimeOnly(8, 0)), TimeSpan.Zero);
        using var testDb = new TestDatabase(utcNow);
        await using var db = testDb.CreateContext();
        await new SeedService(db, testDb.Clock, testDb.Options).SeedAsync();

        var r = await new InsightsService(db, testDb.Clock).BuildAsync(testDb.Clock.Today.AddDays(-29), testDb.Clock.Today);

        Assert.True(r.SleepVsEnergyTakeaway.Enough, r.SleepVsEnergyTakeaway.Text);
        Assert.True(r.CaffeineTakeaway.Enough, r.CaffeineTakeaway.Text);
        Assert.True(r.BreakfastTakeaway.Enough, r.BreakfastTakeaway.Text);
        Assert.True(r.HourlyTakeaway.Enough, r.HourlyTakeaway.Text);
        Assert.True(r.RatingTakeaway.Enough, r.RatingTakeaway.Text);
        // And the built-in effects point the right way.
        Assert.True(r.SleepBuckets[0].Energy < r.SleepBuckets[2].Energy);
        Assert.True(r.Breakfast[1].MorningEnergy < r.Breakfast[0].MorningEnergy);
    }
}
