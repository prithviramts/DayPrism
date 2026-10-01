namespace DayLog.Web.Domain;

public enum ThemePreference { System, Light, Dark }

/// <summary>
/// Your preferences, edited on the Settings page. A single row (Id = 1). Stored in the database
/// rather than appsettings.json so they travel with backups and can be changed from the phone.
/// Until you first save, the defaults come from appsettings.json (DayLog:* section).
/// </summary>
public class UserSettings
{
    public const int SingletonId = 1;

    public int Id { get; set; } = SingletonId;

    /// <summary>Used in the greeting ("Good morning, Sam"). Optional.</summary>
    public string? DisplayName { get; set; }

    /// <summary>IANA time zone id, e.g. "Asia/Dubai". Every "now" in the app uses it.</summary>
    public string TimeZoneId { get; set; } = "Asia/Dubai";

    public ThemePreference Theme { get; set; } = ThemePreference.System;

    // Daily targets, drawn as progress rings on the totals.
    public double SleepTargetHours { get; set; } = 8;
    public int WaterTargetGlasses { get; set; } = 8;
    public int MealsTarget { get; set; } = 3;
    public int CaffeineLimitMg { get; set; } = 400;

    public DateTime UpdatedAtUtc { get; set; }

    public UserSettings Clone() => (UserSettings)MemberwiseClone();
}
