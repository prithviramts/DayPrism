using DayLog.Web.Domain;
using DayLog.Web.Services;
using Microsoft.EntityFrameworkCore;

namespace DayLog.Tests;

public class SeedServiceTests
{
    [Fact]
    public async Task Wipe_removes_demo_rows_and_keeps_real_ones()
    {
        using var testDb = new TestDatabase();
        await using var db = testDb.CreateContext();
        var service = new SeedService(db, testDb.Clock, testDb.Options);

        await service.SeedAsync();
        db.EnergyCheckIns.Add(new EnergyCheckIn { Time = testDb.Clock.Now, Energy = 4, Sleepiness = 2, Mood = 4, UtcOffsetMinutes = 240 });
        await db.SaveChangesAsync();

        var deleted = await service.WipeSeedDataAsync();

        Assert.True(deleted > 100);
        var counts = await service.GetCountsAsync();
        Assert.All(counts, c => Assert.Equal(0, c.Seed));
        Assert.Equal(1, counts.Single(c => c.Table == "Energy check-ins").Real);
    }

    [Fact]
    public async Task Reseeding_replaces_rather_than_duplicates()
    {
        using var testDb = new TestDatabase();
        await using var db = testDb.CreateContext();
        var service = new SeedService(db, testDb.Clock, testDb.Options);

        var first = await service.SeedAsync();
        var second = await service.SeedAsync();

        Assert.Equal(first, second);
        Assert.Equal(first, (await service.GetCountsAsync()).Sum(c => c.Total));
    }

    [Fact]
    public async Task Reseeding_keeps_real_reflection_for_same_date()
    {
        using var testDb = new TestDatabase();
        await using var db = testDb.CreateContext();
        var yesterday = testDb.Clock.Today.AddDays(-1);
        db.DailyReflections.Add(new DailyReflection { Date = yesterday, DayRating = 5, WentWell = "mine" });
        await db.SaveChangesAsync();

        await new SeedService(db, testDb.Clock, testDb.Options).SeedAsync();

        var forYesterday = await db.DailyReflections.Where(r => r.Date == yesterday).ToListAsync();
        Assert.Equal("mine", Assert.Single(forYesterday).WentWell);
    }

    [Fact]
    public async Task Audit_timestamps_are_set_on_save()
    {
        using var testDb = new TestDatabase();
        await using var db = testDb.CreateContext();

        var water = new WaterIntake { Time = testDb.Clock.Now, UtcOffsetMinutes = 240 };
        db.WaterIntakes.Add(water);
        await db.SaveChangesAsync();

        Assert.Equal(testDb.Time.GetUtcNow().UtcDateTime, water.CreatedAtUtc);
    }

    [Fact]
    public async Task Database_rejects_out_of_range_rating()
    {
        using var testDb = new TestDatabase();
        await using var db = testDb.CreateContext();

        db.EnergyCheckIns.Add(new EnergyCheckIn { Time = testDb.Clock.Now, Energy = 7, Sleepiness = 1, Mood = 1 });

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Database_rejects_activity_ending_before_it_starts()
    {
        using var testDb = new TestDatabase();
        await using var db = testDb.CreateContext();
        var now = testDb.Clock.Now;

        db.Activities.Add(new Activity { StartTime = now, EndTime = now.AddHours(-1), Category = ActivityCategory.Work });

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }
}
