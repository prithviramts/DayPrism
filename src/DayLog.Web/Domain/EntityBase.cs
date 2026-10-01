namespace DayLog.Web.Domain;

/// <summary>
/// Columns shared by every table. The base class is not an EF entity itself,
/// so each subclass gets its own table with these columns copied in (no inheritance mapping).
/// </summary>
public abstract class EntityBase
{
    public int Id { get; set; }

    /// <summary>Audit timestamps in UTC, set automatically by <c>DayLogDbContext.SaveChanges</c>.</summary>
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }

    /// <summary>True for rows created by the seed generator, so they can be wiped without touching real data.</summary>
    public bool IsSeed { get; set; }
}

/// <summary>
/// An entry that happens at a point (or span) in time.
///
/// Times are stored as local wall-clock <see cref="DateTime"/> values (what you saw on your watch),
/// plus the UTC offset that was in effect. SQLite can't sort or filter EF's DateTimeOffset type
/// in queries, but it can do both with local DateTimes, and "show me 3 Oct" is the query we run most.
/// The offset keeps the exact instant recoverable (e.g. if you travel or the app moves to a server).
/// </summary>
public abstract class TimedEntry : EntityBase
{
    /// <summary>Minutes east of UTC when the entry was logged, e.g. 240 for Dubai (UTC+4).</summary>
    public int UtcOffsetMinutes { get; set; }

    /// <summary>Attaches this entry's offset to one of its local times.</summary>
    public DateTimeOffset WithOffset(DateTime local) =>
        new(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), TimeSpan.FromMinutes(UtcOffsetMinutes));
}
