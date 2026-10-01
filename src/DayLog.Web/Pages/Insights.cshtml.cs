using DayLog.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace DayLog.Web.Pages;

public class InsightsModel(InsightsService insights, LocalClock clock) : PageModel
{
    public static readonly int[] RangeOptions = [7, 14, 30, 90];

    /// <summary>How many days back from today (inclusive): /Insights?days=14. Defaults to 30.</summary>
    [BindProperty(SupportsGet = true)]
    public int Days { get; set; } = 30;

    public InsightsReport Report { get; private set; } = null!;

    public async Task OnGetAsync(CancellationToken ct)
    {
        if (!RangeOptions.Contains(Days)) Days = 30;
        var to = clock.Today;
        Report = await insights.BuildAsync(to.AddDays(-(Days - 1)), to, ct);
    }

    public static string Hm(double? hours) => hours is { } h ? InsightsService.Hm(h) : "–";
    public static string One(double? value) => value is { } v ? v.ToString("0.0") : "–";
}
