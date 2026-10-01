using DayLog.Web.Domain;
using DayLog.Web.Services;
using Microsoft.EntityFrameworkCore;

namespace DayLog.Tests;

public class SettingsTests : IDisposable
{
    // 2026-10-01 08:00 UTC = 12:00 in Dubai, 09:00 in London (BST).
    private readonly TestDatabase _testDb = new();
    private readonly Web.Data.DayLogDbContext _db;
    private readonly SettingsStore _store;
    private readonly SettingsService _service;

    public SettingsTests()
    {
        _db = _testDb.CreateContext();
        _store = new SettingsStore(_testDb.Options);
        _service = new SettingsService(_db, _store, _testDb.Time);
    }

    public void Dispose()
    {
        _db.Dispose();
        _testDb.Dispose();
    }

    private static SettingsRequest Valid(string tz = "Asia/Dubai", double sleep = 8) =>
        new("Sam", tz, ThemePreference.Dark, sleep, 8, 3, 400);

    [Fact]
    public void Defaults_come_from_appsettings_until_first_save()
    {
        var s = _store.Current;

        Assert.Equal("Asia/Dubai", s.TimeZoneId);
        Assert.Equal(ThemePreference.System, s.Theme);
        Assert.Equal((8.0, 8, 3, 400), (s.SleepTargetHours, s.WaterTargetGlasses, s.MealsTarget, s.CaffeineLimitMg));
        Assert.Null(s.DisplayName);
    }

    [Fact]
    public async Task Save_persists_and_updates_the_in_memory_store()
    {
        await _service.SaveAsync(Valid() with { DisplayName = "  Sam  " });

        var row = await _db.UserSettings.AsNoTracking().SingleAsync();
        Assert.Equal(("Sam", ThemePreference.Dark), (row.DisplayName, row.Theme)); // trimmed
        Assert.Equal("Sam", _store.Current.DisplayName);

        await _service.SaveAsync(Valid() with { DisplayName = "" });
        Assert.Null((await _db.UserSettings.AsNoTracking().SingleAsync()).DisplayName); // still one row
    }

    [Fact]
    public async Task Invalid_values_are_rejected_per_field()
    {
        var ex = await Assert.ThrowsAsync<EntryValidationException>(() =>
            _service.SaveAsync(new SettingsRequest(new string('x', 41), "Mars/Olympus", ThemePreference.Light, 20, 0, 9, 5000)));

        Assert.Equal(
            ["caffeineLimitMg", "displayName", "mealsTarget", "sleepTargetHours", "timeZoneId", "waterTargetGlasses"],
            ex.Errors.Keys.Order());
        Assert.Empty(await _db.UserSettings.ToListAsync());
    }

    [Fact]
    public async Task Changing_time_zone_moves_the_clock_immediately()
    {
        var clock = new LocalClock(_testDb.Time, _testDb.Options, _store);
        Assert.Equal(new DateTime(2026, 10, 1, 12, 0, 0), clock.Now);

        await _service.SaveAsync(Valid(tz: "Europe/London"));

        Assert.Equal(new DateTime(2026, 10, 1, 9, 0, 0), clock.Now);
        Assert.Equal(60, clock.OffsetMinutesAt(clock.Now));
        Assert.Equal("Europe/London", clock.TimeZoneId);
    }

    [Fact]
    public async Task Saved_settings_are_loaded_at_startup()
    {
        await _service.SaveAsync(Valid(sleep: 7.5));
        var freshStore = new SettingsStore(_testDb.Options); // as after an app restart

        await new SettingsService(_db, freshStore, _testDb.Time).LoadAsync();

        Assert.Equal(7.5, freshStore.Current.SleepTargetHours);
    }

    [Fact]
    public async Task Delete_all_removes_every_entry_but_keeps_settings()
    {
        await _service.SaveAsync(Valid());
        await new SeedService(_db, _testDb.Clock, _testDb.Options).SeedAsync();
        _db.WaterIntakes.Add(new WaterIntake { Time = _testDb.Clock.Now, UtcOffsetMinutes = 240 }); // a real one too
        await _db.SaveChangesAsync();

        var deleted = await _service.DeleteAllEntriesAsync();

        Assert.True(deleted > 300);
        var counts = await new SeedService(_db, _testDb.Clock, _testDb.Options).GetCountsAsync();
        Assert.All(counts, c => Assert.Equal(0, c.Total));
        Assert.Single(await _db.UserSettings.ToListAsync());
    }

    [Fact]
    public void Every_offered_time_zone_is_valid_on_this_machine()
    {
        Assert.All(SettingsService.CommonTimeZones, id => Assert.True(SettingsService.IsValidTimeZone(id), id));
    }
}
