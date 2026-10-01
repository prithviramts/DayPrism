using DayLog.Web.Domain;
using DayLog.Web.Services;
using Microsoft.EntityFrameworkCore;

namespace DayLog.Tests;

/// <summary>Phase 3: editing entries, the calendar, and day loading for the History page.</summary>
public class HistoryTests : IDisposable
{
    // TestDatabase's clock is frozen at 2026-10-01 08:00 UTC = 12:00 in Dubai, a Thursday.
    private readonly TestDatabase _testDb = new();
    private readonly Web.Data.DayLogDbContext _db;
    private readonly EntryService _entries;
    private static readonly DateOnly Day = new(2026, 9, 24);

    public HistoryTests()
    {
        _db = _testDb.CreateContext();
        _entries = new EntryService(_db, _testDb.Clock);
    }

    public void Dispose()
    {
        _db.Dispose();
        _testDb.Dispose();
    }

    private static DateTime At(DateOnly day, int h, int m = 0) => day.ToDateTime(new TimeOnly(h, m));

    // ---------------------------------------------------------------- updates

    [Fact]
    public async Task Update_changes_fields_and_keeps_id()
    {
        var c = await _entries.AddCheckInAsync(new CheckInRequest(At(Day, 9), 2, 4, 3, "before"));

        var updated = await _entries.UpdateCheckInAsync(c.Id, new CheckInRequest(At(Day, 9, 30), 5, 1, 4, "after"));

        Assert.NotNull(updated);
        var stored = await _db.EnergyCheckIns.AsNoTracking().SingleAsync();
        Assert.Equal((c.Id, 5, "after", At(Day, 9, 30)), (stored.Id, stored.Energy, stored.Note, stored.Time));
    }

    [Fact]
    public async Task Update_of_missing_entry_returns_null()
    {
        Assert.Null(await _entries.UpdateMealAsync(999, new MealRequest(At(Day, 13), MealType.Lunch, "x", MealSize.Light, false)));
    }

    [Fact]
    public async Task Update_is_validated_like_add()
    {
        var w = await _entries.AddWaterAsync(new WaterRequest(At(Day, 10)));

        await Assert.ThrowsAsync<EntryValidationException>(() => _entries.UpdateWaterAsync(w.Id, new WaterRequest(At(Day, 10), 0)));
    }

    [Fact]
    public async Task Editing_a_demo_row_makes_it_real()
    {
        var c = await _entries.AddCaffeineAsync(new CaffeineRequest(At(Day, 8), CaffeineType.Tea, 1, null));
        c.IsSeed = true;
        await _db.SaveChangesAsync();

        await _entries.UpdateCaffeineAsync(c.Id, new CaffeineRequest(At(Day, 8), CaffeineType.Coffee, 1, null));

        var stored = await _db.CaffeineIntakes.AsNoTracking().SingleAsync();
        Assert.False(stored.IsSeed);
        Assert.Equal(95, stored.CaffeineMg); // re-estimated for the new type
    }

    [Fact]
    public async Task Editing_cannot_create_a_second_running_activity()
    {
        await _entries.StartActivityAsync(new ActivityRequest(At(Day, 9), null, ActivityCategory.Work, null));
        var finished = await _entries.StartActivityAsync(new ActivityRequest(At(Day, 7), At(Day, 8), ActivityCategory.Commute, null));

        var ex = await Assert.ThrowsAsync<EntryValidationException>(() =>
            _entries.UpdateActivityAsync(finished.Id, new ActivityRequest(At(Day, 7), null, ActivityCategory.Commute, null)));
        Assert.Contains("endTime", ex.Errors.Keys);
    }

    [Fact]
    public async Task Running_activity_can_be_edited_and_stay_running()
    {
        var running = await _entries.StartActivityAsync(new ActivityRequest(At(Day, 9), null, ActivityCategory.Work, null));

        var updated = await _entries.UpdateActivityAsync(running.Id, new ActivityRequest(At(Day, 9, 15), null, ActivityCategory.DeepWork, "focus"));

        Assert.True(updated!.IsRunning);
        Assert.Equal(ActivityCategory.DeepWork, updated.Category);
    }

    // ---------------------------------------------------------------- day loading

    [Fact]
    public async Task Activity_crossing_midnight_shows_on_both_days()
    {
        await _entries.StartActivityAsync(new ActivityRequest(At(Day, 23, 30), At(Day.AddDays(1), 0, 30), ActivityCategory.ScreenTime, null));
        var days = new DayService(_db, _testDb.Clock);

        Assert.Single((await days.GetDayAsync(Day)).Activities);
        Assert.Single((await days.GetDayAsync(Day.AddDays(1))).Activities);
        Assert.Empty((await days.GetDayAsync(Day.AddDays(2))).Activities);
    }

    [Fact]
    public async Task Entry_list_is_in_time_order_across_types()
    {
        await _entries.AddWaterAsync(new WaterRequest(At(Day, 15)));
        await _entries.AddMealAsync(new MealRequest(At(Day, 8), MealType.Breakfast, null, null, Skipped: true));
        await _entries.AddCheckInAsync(new CheckInRequest(At(Day, 11), 3, 3, 3, null));
        var day = await new DayService(_db, _testDb.Clock).GetDayAsync(Day);

        var list = DayEntryList.Build(day);

        Assert.Equal(["meal", "checkin", "water"], list.Select(e => e.Sheet));
        Assert.Equal("Skipped breakfast", list[0].Title);
        Assert.StartsWith("meal-", list[0].Key);
    }

    // ---------------------------------------------------------------- calendar

    [Fact]
    public async Task Calendar_grid_is_full_weeks_starting_monday()
    {
        var month = await new CalendarService(_db, _testDb.Clock).GetMonthAsync(2026, 9);

        Assert.Equal(new DateOnly(2026, 8, 31), month.Days[0].Date);  // Monday before 1 Sep
        Assert.Equal(DayOfWeek.Sunday, month.Days[^1].Date.DayOfWeek);
        Assert.Equal(0, month.Days.Count % 7);
        Assert.False(month.Days[0].InMonth);
        Assert.Equal(30, month.Days.Count(d => d.InMonth));
    }

    [Fact]
    public async Task Calendar_day_summarises_rating_energy_and_sleep()
    {
        await _entries.UpsertReflectionAsync(new ReflectionRequest(Day, null, null, null, 4));
        await _entries.AddCheckInAsync(new CheckInRequest(At(Day, 9), 2, 3, 3, null));
        await _entries.AddCheckInAsync(new CheckInRequest(At(Day, 15), 4, 3, 3, null));
        await _entries.UpsertSleepAsync(new SleepRequest(Day, new TimeOnly(23, 0), new TimeOnly(6, 30), 3, 0, null));
        await _entries.AddWaterAsync(new WaterRequest(At(Day.AddDays(1), 10)));

        var month = await new CalendarService(_db, _testDb.Clock).GetMonthAsync(2026, 9);
        var cell = month.Days.Single(d => d.Date == Day);
        var next = month.Days.Single(d => d.Date == Day.AddDays(1));

        Assert.Equal(4, cell.DayRating);
        Assert.Equal(3, cell.AverageEnergy);
        Assert.Equal(TimeSpan.FromHours(7.5), cell.Sleep);
        Assert.True(next.HasData);           // only water, but still "something logged"
        Assert.Null(next.DayRating);
        Assert.Contains("rating 4/5", cell.Summary);
    }

    [Fact]
    public async Task Calendar_marks_today_and_future()
    {
        var month = await new CalendarService(_db, _testDb.Clock).GetMonthAsync(2026, 10);

        Assert.True(month.Days.Single(d => d.Date == new DateOnly(2026, 10, 1)).IsToday);
        Assert.True(month.Days.Single(d => d.Date == new DateOnly(2026, 10, 2)).IsFuture);
        Assert.False(month.Days.Single(d => d.Date == new DateOnly(2026, 9, 30)).IsFuture);
    }
}
