namespace DayLog.Web.Services;

/// <summary>Bound from the "DayLog" section of appsettings.json.</summary>
public sealed class DayLogOptions
{
    public const string SectionName = "DayLog";

    /// <summary>IANA time zone id. Every "now" in the app is computed in this zone.</summary>
    public string TimeZoneId { get; set; } = "Asia/Dubai";

    /// <summary>
    /// When true, a brand-new database (no migrations applied yet) is filled with demo data on startup.
    /// It only fires on creation, so wiping the seed data later doesn't bring it back on the next restart.
    /// </summary>
    public bool SeedNewDatabase { get; set; } = true;

    /// <summary>How many days of demo data to generate.</summary>
    public int SeedDays { get; set; } = 14;

    /// <summary>Daily targets drawn as progress rings on the totals. Change them in appsettings.json.</summary>
    public DailyTargets Targets { get; set; } = new();
}

public sealed class DailyTargets
{
    public double SleepHours { get; set; } = 8;
    public int WaterGlasses { get; set; } = 8;
    public int Meals { get; set; } = 3;

    /// <summary>A limit, not a goal: 400 mg is the commonly cited daily maximum for healthy adults. The ring turns red past it.</summary>
    public int CaffeineMgLimit { get; set; } = 400;
}
