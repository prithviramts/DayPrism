using DayLog.Web.Data;
using DayLog.Web.Data.Seed;
using DayLog.Web.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace DayLog.Web.Services;

public sealed record TableCount(string Table, int Total, int Seed)
{
    public int Real => Total - Seed;
}

/// <summary>Adds and removes demo data. Every seeded row has IsSeed = true; real entries never do.</summary>
public sealed class SeedService(DayLogDbContext db, LocalClock clock, IOptions<DayLogOptions> options)
{
    /// <summary>Replaces any existing demo data with a fresh set ending today. Returns rows added.</summary>
    public async Task<int> SeedAsync(CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await WipeSeedDataAsync(ct);

        var data = new SeedDataGenerator().Generate(clock.Today, options.Value.SeedDays, clock.OffsetMinutesAt);

        // Reflections are unique per date. If you've already written a real one for a date, keep yours.
        var takenDates = await db.DailyReflections.Select(r => r.Date).ToListAsync(ct);
        var reflections = data.Reflections.Where(r => !takenDates.Contains(r.Date)).ToList();

        db.SleepLogs.AddRange(data.Sleep);
        db.Meals.AddRange(data.Meals);
        db.CaffeineIntakes.AddRange(data.Caffeine);
        db.WaterIntakes.AddRange(data.Water);
        db.EnergyCheckIns.AddRange(data.CheckIns);
        db.Activities.AddRange(data.Activities);
        db.DailyReflections.AddRange(reflections);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return data.TotalRows - (data.Reflections.Count - reflections.Count);
    }

    /// <summary>Deletes every demo row and leaves real entries alone. Returns rows deleted.</summary>
    public async Task<int> WipeSeedDataAsync(CancellationToken ct = default)
    {
        // ExecuteDeleteAsync runs one DELETE ... WHERE IsSeed = 1 per table, without loading rows into memory.
        return await DeleteSeed(db.SleepLogs, ct)
             + await DeleteSeed(db.Meals, ct)
             + await DeleteSeed(db.CaffeineIntakes, ct)
             + await DeleteSeed(db.WaterIntakes, ct)
             + await DeleteSeed(db.EnergyCheckIns, ct)
             + await DeleteSeed(db.Activities, ct)
             + await DeleteSeed(db.DailyReflections, ct);
    }

    public async Task<IReadOnlyList<TableCount>> GetCountsAsync(CancellationToken ct = default) =>
    [
        await Count("Sleep", db.SleepLogs, ct),
        await Count("Meals", db.Meals, ct),
        await Count("Caffeine", db.CaffeineIntakes, ct),
        await Count("Water", db.WaterIntakes, ct),
        await Count("Energy check-ins", db.EnergyCheckIns, ct),
        await Count("Activities", db.Activities, ct),
        await Count("Reflections", db.DailyReflections, ct),
    ];

    private static Task<int> DeleteSeed<T>(IQueryable<T> set, CancellationToken ct) where T : EntityBase =>
        set.Where(x => x.IsSeed).ExecuteDeleteAsync(ct);

    private static async Task<TableCount> Count<T>(string name, IQueryable<T> set, CancellationToken ct) where T : EntityBase =>
        new(name, await set.CountAsync(ct), await set.CountAsync(x => x.IsSeed, ct));
}
