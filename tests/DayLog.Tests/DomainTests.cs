using DayLog.Web.Domain;
using DayLog.Web.Services;
using Microsoft.Extensions.Options;

namespace DayLog.Tests;

public class DomainTests
{
    [Fact]
    public void Sleep_duration_spans_midnight()
    {
        var sleep = new SleepLog { BedTime = new(2026, 9, 30, 23, 40, 0), WakeTime = new(2026, 10, 1, 6, 25, 0) };

        Assert.Equal(new TimeSpan(6, 45, 0), sleep.Duration);
    }

    [Fact]
    public void Running_activity_has_no_duration()
    {
        var activity = new Activity { StartTime = new(2026, 10, 1, 9, 0, 0) };

        Assert.True(activity.IsRunning);
        Assert.Null(activity.Duration);
    }

    [Fact]
    public void WithOffset_attaches_stored_offset()
    {
        var meal = new Meal { UtcOffsetMinutes = 240 };

        var value = meal.WithOffset(new DateTime(2026, 10, 1, 13, 0, 0));

        Assert.Equal(new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero), value.ToUniversalTime());
    }

    [Fact]
    public void Clock_uses_Dubai_date_not_UTC_date()
    {
        // 21:30 UTC on 30 Sep is already 01:30 on 1 Oct in Dubai.
        var clock = new LocalClock(
            new FixedTimeProvider(new DateTimeOffset(2026, 9, 30, 21, 30, 0, TimeSpan.Zero)),
            Options.Create(new DayLogOptions { TimeZoneId = "Asia/Dubai" }));

        Assert.Equal(new DateOnly(2026, 10, 1), clock.Today);
        Assert.Equal(new DateTime(2026, 10, 1, 1, 30, 0), clock.Now);
        Assert.Equal(240, clock.OffsetMinutesAt(clock.Now));
    }
}
