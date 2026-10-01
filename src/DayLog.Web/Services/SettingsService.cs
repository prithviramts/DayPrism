using DayLog.Web.Data;
using DayLog.Web.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace DayLog.Web.Services;

/// <summary>
/// Holds the current settings in memory for the whole app (a singleton), so things that run on
/// every request, like the clock and the layout, don't query the database each time.
/// <see cref="SettingsService"/> keeps it in sync: it's loaded at startup and replaced on save.
/// </summary>
public sealed class SettingsStore(IOptions<DayLogOptions> options)
{
    private volatile UserSettings _current = Defaults(options.Value);

    /// <summary>A copy, so callers can't change the shared instance by accident.</summary>
    public UserSettings Current => _current.Clone();

    /// <summary>Read on every clock tick, so it skips the copy.</summary>
    public string TimeZoneId => _current.TimeZoneId;

    internal void Set(UserSettings settings) => _current = settings.Clone();

    /// <summary>What you get before ever saving the Settings page: the appsettings.json values.</summary>
    public static UserSettings Defaults(DayLogOptions o) => new()
    {
        TimeZoneId = o.TimeZoneId,
        SleepTargetHours = o.Targets.SleepHours,
        WaterTargetGlasses = o.Targets.WaterGlasses,
        MealsTarget = o.Targets.Meals,
        CaffeineLimitMg = o.Targets.CaffeineMgLimit,
    };
}

/// <summary>Values from the Settings form.</summary>
public sealed record SettingsRequest(
    string? DisplayName, string TimeZoneId, ThemePreference Theme,
    double SleepTargetHours, int WaterTargetGlasses, int MealsTarget, int CaffeineLimitMg) : IValidatable
{
    public void Validate(ValidationErrors errors) => errors
        .MaxLength(DisplayName, 40, nameof(DisplayName))
        .Require(SettingsService.IsValidTimeZone(TimeZoneId), nameof(TimeZoneId), "That time zone isn't recognised.")
        .Require(SleepTargetHours is >= 4 and <= 12, nameof(SleepTargetHours), "Sleep goal must be between 4 and 12 hours.")
        .Require(WaterTargetGlasses is >= 1 and <= 20, nameof(WaterTargetGlasses), "Water goal must be between 1 and 20 glasses.")
        .Require(MealsTarget is >= 1 and <= 6, nameof(MealsTarget), "Meals goal must be between 1 and 6.")
        .Require(CaffeineLimitMg is >= 50 and <= 1000, nameof(CaffeineLimitMg), "Caffeine limit must be between 50 and 1000 mg.");
}

public sealed class SettingsService(DayLogDbContext db, SettingsStore store, TimeProvider time)
{
    /// <summary>Time zones offered in the picker. Any valid IANA id also works if typed into config.</summary>
    public static readonly IReadOnlyList<string> CommonTimeZones =
    [
        "Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka",
        "Asia/Bangkok", "Asia/Singapore", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney",
        "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos",
        "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Istanbul", "Europe/Moscow",
        "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo",
        "UTC",
    ];

    public static bool IsValidTimeZone(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return false;
        try { TimeZoneInfo.FindSystemTimeZoneById(id); return true; }
        catch (TimeZoneNotFoundException) { return false; }
        catch (InvalidTimeZoneException) { return false; }
    }

    /// <summary>Called once at startup: puts the saved settings (if any) into the in-memory store.</summary>
    public async Task LoadAsync(CancellationToken ct = default)
    {
        if (await db.UserSettings.AsNoTracking().FirstOrDefaultAsync(ct) is { } saved) store.Set(saved);
    }

    public async Task<UserSettings> SaveAsync(SettingsRequest r, CancellationToken ct = default)
    {
        var errors = new ValidationErrors();
        r.Validate(errors);
        errors.ThrowIfAny();

        var row = await db.UserSettings.FirstOrDefaultAsync(ct);
        if (row is null) db.UserSettings.Add(row = store.Current);

        row.DisplayName = string.IsNullOrWhiteSpace(r.DisplayName) ? null : r.DisplayName.Trim();
        row.TimeZoneId = r.TimeZoneId;
        row.Theme = r.Theme;
        row.SleepTargetHours = r.SleepTargetHours;
        row.WaterTargetGlasses = r.WaterTargetGlasses;
        row.MealsTarget = r.MealsTarget;
        row.CaffeineLimitMg = r.CaffeineLimitMg;
        row.UpdatedAtUtc = time.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync(ct);

        store.Set(row);
        return row;
    }

    /// <summary>
    /// Deletes every entry, demo and real, and keeps your settings. Returns rows deleted.
    /// Runs in a transaction, so it's all or nothing.
    /// </summary>
    public async Task<int> DeleteAllEntriesAsync(CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var deleted = await db.SleepLogs.ExecuteDeleteAsync(ct)
                    + await db.Meals.ExecuteDeleteAsync(ct)
                    + await db.CaffeineIntakes.ExecuteDeleteAsync(ct)
                    + await db.WaterIntakes.ExecuteDeleteAsync(ct)
                    + await db.EnergyCheckIns.ExecuteDeleteAsync(ct)
                    + await db.Activities.ExecuteDeleteAsync(ct)
                    + await db.DailyReflections.ExecuteDeleteAsync(ct);
        await tx.CommitAsync(ct);
        return deleted;
    }
}
