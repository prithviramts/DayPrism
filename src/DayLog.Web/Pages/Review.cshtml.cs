using DayLog.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace DayLog.Web.Pages;

public class ReviewModel(ReviewService reviews, LocalClock clock) : PageModel
{
    /// <summary>/Review?from=2026-09-01&amp;to=2026-09-30. Both optional; default is the last 30 days.</summary>
    [BindProperty(SupportsGet = true)] public DateOnly? From { get; set; }
    [BindProperty(SupportsGet = true)] public DateOnly? To { get; set; }

    public ReviewReport Report { get; private set; } = null!;
    public IReadOnlyList<(string Label, DateOnly From, DateOnly To)> Presets { get; private set; } = [];

    /// <summary>Query string for the export links, so downloads use exactly the range on screen.</summary>
    public string RangeQuery => $"from={Report.From:yyyy-MM-dd}&to={Report.To:yyyy-MM-dd}";

    public async Task OnGetAsync(CancellationToken ct)
    {
        var (from, to) = ReviewRange.Resolve(From, To, clock.Today);
        Report = await reviews.BuildAsync(from, to, ct);
        Presets = ReviewRange.Presets(clock.Today);
    }

    public static string Hm(double? hours) => hours is { } h ? InsightsService.Hm(h) : "–";
    public static string One(double? value) => value is { } v ? v.ToString("0.0") : "–";
}
