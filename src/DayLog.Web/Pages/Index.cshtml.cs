using DayLog.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace DayLog.Web.Pages;

public class IndexModel(DayService days, LocalClock clock, SettingsStore settings) : PageModel
{
    public DaySnapshot Day { get; private set; } = null!;
    public TimelineModel Timeline { get; private set; } = null!;
    public DayClientState ClientState { get; private set; } = null!;

    /// <summary>Hero greeting by time of day (in your time zone), with your name if you set one in Settings.</summary>
    public string Greeting
    {
        get
        {
            var greeting = clock.Now.Hour switch
            {
                >= 5 and < 12 => "Good morning",
                >= 12 and < 17 => "Good afternoon",
                >= 17 and < 22 => "Good evening",
                _ => "Hello, night owl",
            };
            return settings.Current.DisplayName is { } name ? $"{greeting}, {name}" : greeting;
        }
    }

    public async Task OnGetAsync(CancellationToken ct) => await LoadAsync(ct);

    /// <summary>
    /// GET /?handler=Content returns just the dynamic part of the page (totals, buttons, timeline).
    /// daylog.js calls it after each save and swaps the HTML in, so the timeline is only
    /// ever rendered in one place: the server.
    /// </summary>
    public async Task<IActionResult> OnGetContentAsync(CancellationToken ct)
    {
        await LoadAsync(ct);
        return Partial("_TodayContent", this);
    }

    private async Task LoadAsync(CancellationToken ct)
    {
        Day = await days.GetDayAsync(clock.Today, ct);
        Timeline = TimelineBuilder.Build(Day);
        ClientState = DayClientState.From(Day, clock.TimeZoneId);
    }
}
