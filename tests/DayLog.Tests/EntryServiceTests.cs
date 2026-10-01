using DayLog.Web.Domain;
using DayLog.Web.Services;
using Microsoft.EntityFrameworkCore;

namespace DayLog.Tests;

public class EntryServiceTests : IDisposable
{
    private readonly TestDatabase _testDb = new();
    private readonly Web.Data.DayLogDbContext _db;
    private readonly EntryService _service;
    private static readonly DateOnly Day = new(2026, 10, 1);

    public EntryServiceTests()
    {
        _db = _testDb.CreateContext();
        _service = new EntryService(_db, _testDb.Clock);
    }

    public void Dispose()
    {
        _db.Dispose();
        _testDb.Dispose();
    }

    private static DateTime At(int h, int m = 0) => Day.ToDateTime(new TimeOnly(h, m));

    [Fact]
    public async Task Entries_get_Dubai_offset()
    {
        var checkIn = await _service.AddCheckInAsync(new CheckInRequest(At(9), 4, 2, 4, "  "));

        Assert.Equal(240, checkIn.UtcOffsetMinutes);
        Assert.Null(checkIn.Note); // whitespace-only note is stored as null
    }

    [Fact]
    public async Task Invalid_rating_is_rejected_with_field_error()
    {
        var ex = await Assert.ThrowsAsync<EntryValidationException>(() =>
            _service.AddCheckInAsync(new CheckInRequest(At(9), 0, 2, 6, null)));

        Assert.Contains("energy", ex.Errors.Keys);
        Assert.Contains("mood", ex.Errors.Keys);
        Assert.DoesNotContain("sleepiness", ex.Errors.Keys);
    }

    [Fact]
    public async Task Skipped_meal_needs_no_description_and_drops_one_if_sent()
    {
        var meal = await _service.AddMealAsync(new MealRequest(At(7), MealType.Breakfast, "leftover text", MealSize.Normal, Skipped: true));

        Assert.True(meal.Skipped);
        Assert.Null(meal.Description);
        Assert.Null(meal.Size);
    }

    [Fact]
    public async Task Eaten_meal_needs_description()
    {
        var ex = await Assert.ThrowsAsync<EntryValidationException>(() =>
            _service.AddMealAsync(new MealRequest(At(13), MealType.Lunch, "", MealSize.Normal, Skipped: false)));

        Assert.Contains("description", ex.Errors.Keys);
    }

    [Fact]
    public async Task Caffeine_mg_defaults_from_type_and_servings()
    {
        var c = await _service.AddCaffeineAsync(new CaffeineRequest(At(8), CaffeineType.Espresso, 2, null));

        Assert.Equal(126, c.CaffeineMg);
    }

    [Fact]
    public async Task Starting_an_activity_stops_the_running_one()
    {
        var commute = await _service.StartActivityAsync(new ActivityRequest(At(7, 30), null, ActivityCategory.Commute, null));
        await _service.StartActivityAsync(new ActivityRequest(At(8, 20), null, ActivityCategory.Work, null));

        await _db.Entry(commute).ReloadAsync();
        Assert.Equal(At(8, 20), commute.EndTime);
        Assert.Equal(1, await _db.Activities.CountAsync(a => a.EndTime == null));
    }

    [Fact]
    public async Task Logging_a_finished_activity_leaves_the_running_one_alone()
    {
        await _service.StartActivityAsync(new ActivityRequest(At(9), null, ActivityCategory.DeepWork, null));
        await _service.StartActivityAsync(new ActivityRequest(At(7, 30), At(8, 15), ActivityCategory.Commute, null));

        Assert.Equal(1, await _db.Activities.CountAsync(a => a.EndTime == null));
    }

    [Fact]
    public async Task Cannot_start_before_the_running_activity_started()
    {
        await _service.StartActivityAsync(new ActivityRequest(At(10), null, ActivityCategory.Meetings, null));

        await Assert.ThrowsAsync<EntryValidationException>(() =>
            _service.StartActivityAsync(new ActivityRequest(At(9), null, ActivityCategory.Work, null)));
    }

    [Fact]
    public async Task Stop_rejects_end_before_start()
    {
        var a = await _service.StartActivityAsync(new ActivityRequest(At(10), null, ActivityCategory.Study, null));

        await Assert.ThrowsAsync<EntryValidationException>(() => _service.StopActivityAsync(a.Id, new StopActivityRequest(At(9))));
        Assert.NotNull(await _service.StopActivityAsync(a.Id, new StopActivityRequest(At(11))));
    }

    [Fact]
    public async Task Sleep_bedtime_after_wake_time_on_clock_is_previous_evening()
    {
        var sleep = await _service.UpsertSleepAsync(new SleepRequest(Day, new TimeOnly(23, 30), new TimeOnly(6, 45), 4, 1, null));

        Assert.Equal(new DateTime(2026, 9, 30, 23, 30, 0), sleep.BedTime);
        Assert.Equal(TimeSpan.FromMinutes(435), sleep.Duration);
    }

    [Fact]
    public async Task Sleep_after_midnight_is_same_day()
    {
        var sleep = await _service.UpsertSleepAsync(new SleepRequest(Day, new TimeOnly(0, 50), new TimeOnly(7, 0), 3, 0, null));

        Assert.Equal(At(0, 50), sleep.BedTime);
    }

    [Fact]
    public async Task Saving_sleep_twice_for_same_morning_updates_it()
    {
        await _service.UpsertSleepAsync(new SleepRequest(Day, new TimeOnly(23, 0), new TimeOnly(6, 30), 3, 0, null));
        await _service.UpsertSleepAsync(new SleepRequest(Day, new TimeOnly(23, 45), new TimeOnly(6, 30), 2, 3, "noisy"));

        var sleep = await _db.SleepLogs.SingleAsync();
        Assert.Equal(2, sleep.Quality);
        Assert.Equal("noisy", sleep.Notes);
    }

    [Fact]
    public async Task Reflection_upserts_by_date()
    {
        await _service.UpsertReflectionAsync(new ReflectionRequest(Day, "a", null, null, 3));
        await _service.UpsertReflectionAsync(new ReflectionRequest(Day, "b", "c", "d", 5));

        var reflection = await _db.DailyReflections.SingleAsync();
        Assert.Equal(("b", 5), (reflection.WentWell, reflection.DayRating));
    }

    [Fact]
    public async Task Delete_removes_only_that_entry()
    {
        var keep = await _service.AddWaterAsync(new WaterRequest(At(9)));
        var remove = await _service.AddWaterAsync(new WaterRequest(At(10)));

        Assert.True(await _service.DeleteAsync(EntryKind.Water, remove.Id));
        Assert.False(await _service.DeleteAsync(EntryKind.Water, remove.Id));
        Assert.Equal(keep.Id, (await _db.WaterIntakes.SingleAsync()).Id);
    }
}
