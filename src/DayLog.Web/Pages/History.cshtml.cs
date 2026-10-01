using DayLog.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace DayLog.Web.Pages;

public class HistoryModel(DayService days, CalendarService calendar, LocalClock clock) : PageModel
{
    /// <summary>The selected day, from the URL: /History?date=2026-09-28. Defaults to today.</summary>
    [BindProperty(SupportsGet = true)]
    public DateOnly? Date { get; set; }

    public DateOnly SelectedDate { get; private set; }
    public DateOnly Today { get; private set; }
    public CalendarMonth Month { get; private set; } = null!;
    public DaySnapshot Day { get; private set; } = null!;
    public TimelineModel Timeline { get; private set; } = null!;
    public IReadOnlyList<DayEntry> Entries { get; private set; } = [];
    public DayClientState ClientState { get; private set; } = null!;

    /// <summary>Same day number in the previous / next month (clamped, so 31 Mar → 28 Feb).</summary>
    public DateOnly PreviousMonthDate => SelectedDate.AddMonths(-1);
    public DateOnly? NextMonthDate
    {
        get
        {
            var next = SelectedDate.AddMonths(1);
            if (new DateOnly(next.Year, next.Month, 1) > Today) return null; // no future months
            return next > Today ? Today : next;
        }
    }

    public async Task OnGetAsync(CancellationToken ct) => await LoadAsync(ct);

    /// <summary>Re-rendered calendar + day, fetched by daylog.js after an edit (same idea as the Today page).</summary>
    public async Task<IActionResult> OnGetContentAsync(CancellationToken ct)
    {
        await LoadAsync(ct);
        return Partial("_HistoryContent", this);
    }

    private async Task LoadAsync(CancellationToken ct)
    {
        Today = clock.Today;
        // Future days can't have entries yet, so a future date in the URL falls back to today.
        SelectedDate = Date is { } d && d <= Today ? d : Today;

        Month = await calendar.GetMonthAsync(SelectedDate.Year, SelectedDate.Month, ct);
        Day = await days.GetDayAsync(SelectedDate, ct);
        Timeline = TimelineBuilder.Build(Day);
        Entries = DayEntryList.Build(Day);
        ClientState = DayClientState.From(Day, clock.TimeZoneId);
    }
}
