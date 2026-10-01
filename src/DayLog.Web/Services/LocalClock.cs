using Microsoft.Extensions.Options;

namespace DayLog.Web.Services;

/// <summary>
/// The single answer to "what time is it for the user?".
///
/// Using DateTime.Now directly would give the *server's* local time. That's fine on your laptop
/// in Dubai, but wrong once the app is deployed to a cloud server running in UTC. Everything goes
/// through this class instead, and TimeProvider can be swapped for a fake clock in tests.
///
/// The zone comes from your saved settings (Settings page) when there are any, otherwise from
/// appsettings.json. Changing it on the Settings page takes effect immediately.
/// </summary>
public sealed class LocalClock(TimeProvider timeProvider, IOptions<DayLogOptions> options, SettingsStore? settings = null)
{
    /// <summary>Last looked-up zone. A single reference, so swapping it is thread-safe.</summary>
    private sealed record ZoneCache(string Id, TimeZoneInfo Zone);
    private ZoneCache? _cache;

    /// <summary>The configured IANA id, e.g. "Asia/Dubai".</summary>
    public string TimeZoneId => settings?.TimeZoneId ?? options.Value.TimeZoneId;

    public TimeZoneInfo Zone
    {
        get
        {
            var id = TimeZoneId;
            var cache = _cache;
            if (cache?.Id != id) _cache = cache = new ZoneCache(id, TimeZoneInfo.FindSystemTimeZoneById(id));
            return cache.Zone;
        }
    }

    /// <summary>Current local time with its offset, e.g. 2026-10-01 11:30 +04:00.</summary>
    public DateTimeOffset NowWithOffset => TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), Zone);

    /// <summary>Current local wall-clock time (Kind = Unspecified), which is the form we store.</summary>
    public DateTime Now => NowWithOffset.DateTime;

    public DateOnly Today => DateOnly.FromDateTime(Now);

    /// <summary>UTC offset in minutes for a given local time. Dubai has no DST, but other zones would.</summary>
    public int OffsetMinutesAt(DateTime local) => (int)Zone.GetUtcOffset(local).TotalMinutes;
}
