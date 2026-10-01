using DayLog.Web.Data;
using DayLog.Web.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace DayLog.Tests;

/// <summary>A clock frozen at a chosen UTC instant.</summary>
public sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => utcNow;
}

/// <summary>
/// A real SQLite database held in memory, with the app's real migrations applied, so tests
/// exercise the actual schema (check constraints, indexes) rather than a fake provider.
/// The database lives as long as the open connection does.
/// </summary>
public sealed class TestDatabase : IDisposable
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    public TimeProvider Time { get; }
    public LocalClock Clock { get; }
    public IOptions<DayLogOptions> Options { get; } = Microsoft.Extensions.Options.Options.Create(new DayLogOptions());

    public TestDatabase(DateTimeOffset? utcNow = null)
    {
        _connection.Open();
        Time = new FixedTimeProvider(utcNow ?? new DateTimeOffset(2026, 10, 1, 8, 0, 0, TimeSpan.Zero));
        Clock = new LocalClock(Time, Options);
        using var db = CreateContext();
        db.Database.Migrate();
    }

    public DayLogDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<DayLogDbContext>().UseSqlite(_connection).Options, Time);

    public void Dispose() => _connection.Dispose();
}
