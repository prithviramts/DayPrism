using System.Reflection;
using DayLog.Web.Data;
using DayLog.Web.Domain;
using DayLog.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace DayLog.Web.Pages;

/// <summary>The Settings form's fields (bound from the POST).</summary>
public sealed class SettingsInput
{
    public string? DisplayName { get; set; }
    public string TimeZoneId { get; set; } = "Asia/Dubai";
    public ThemePreference Theme { get; set; }
    public double SleepTargetHours { get; set; }
    public int WaterTargetGlasses { get; set; }
    public int MealsTarget { get; set; }
    public int CaffeineLimitMg { get; set; }

    public static SettingsInput From(UserSettings s) => new()
    {
        DisplayName = s.DisplayName, TimeZoneId = s.TimeZoneId, Theme = s.Theme,
        SleepTargetHours = s.SleepTargetHours, WaterTargetGlasses = s.WaterTargetGlasses,
        MealsTarget = s.MealsTarget, CaffeineLimitMg = s.CaffeineLimitMg,
    };

    public SettingsRequest ToRequest() => new(DisplayName, TimeZoneId, Theme,
        SleepTargetHours, WaterTargetGlasses, MealsTarget, CaffeineLimitMg);
}

public class SettingsModel(
    SeedService seedService, SettingsService settingsService, SettingsStore store, LocalClock clock, DayLogDbContext db)
    : PageModel
{
    public const string DeleteConfirmWord = "DELETE";

    [BindProperty] public SettingsInput Input { get; set; } = new();

    /// <summary>What you typed to confirm "Delete all entries".</summary>
    [BindProperty] public string? ConfirmDelete { get; set; }

    public IReadOnlyList<TableCount> Counts { get; private set; } = [];
    public string DatabasePath { get; private set; } = "";
    public string LocalTime { get; private set; } = "";
    public IReadOnlyList<(string Id, string Label)> TimeZones { get; private set; } = [];

    public static string Version { get; } =
        typeof(SettingsModel).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? "1.0";

    /// <summary>Survives the redirect after a POST (Post/Redirect/Get), so refreshing doesn't resubmit.</summary>
    [TempData] public string? StatusMessage { get; set; }

    public async Task OnGetAsync()
    {
        Input = SettingsInput.From(store.Current);
        await LoadAsync();
    }

    // Razor Pages checks the anti-forgery token on POST handlers automatically, so another
    // website can't submit these forms from your browser.
    public async Task<IActionResult> OnPostSaveAsync()
    {
        try
        {
            await settingsService.SaveAsync(Input.ToRequest());
            StatusMessage = "Settings saved.";
            return RedirectToPage();
        }
        catch (EntryValidationException ex)
        {
            // Show each message next to its field: "sleepTargetHours" → "Input.SleepTargetHours".
            foreach (var (field, messages) in ex.Errors)
                foreach (var message in messages)
                    ModelState.AddModelError($"Input.{char.ToUpperInvariant(field[0])}{field[1..]}", message);
            await LoadAsync();
            return Page();
        }
    }

    public async Task<IActionResult> OnPostDeleteAllAsync()
    {
        if (ConfirmDelete?.Trim() != DeleteConfirmWord)
        {
            ModelState.AddModelError(nameof(ConfirmDelete), $"Type {DeleteConfirmWord} in capitals to confirm.");
            Input = SettingsInput.From(store.Current);
            await LoadAsync();
            return Page();
        }

        var deleted = await settingsService.DeleteAllEntriesAsync();
        StatusMessage = $"Deleted {deleted} entries. Your settings were kept.";
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostWipeSeedAsync()
    {
        var deleted = await seedService.WipeSeedDataAsync();
        StatusMessage = $"Deleted {deleted} demo rows. Your real entries were not touched.";
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostReseedAsync()
    {
        var added = await seedService.SeedAsync();
        StatusMessage = $"Replaced demo data: {added} rows added.";
        return RedirectToPage();
    }

    private async Task LoadAsync()
    {
        Counts = await seedService.GetCountsAsync();
        DatabasePath = new SqliteConnectionStringBuilder(db.Database.GetConnectionString()).DataSource;
        LocalTime = clock.NowWithOffset.ToString("ddd d MMM, HH:mm 'UTC'zzz");

        // Common zones, plus the saved one if it isn't in the list. Labelled with today's UTC offset.
        var ids = SettingsService.CommonTimeZones.ToList();
        if (!ids.Contains(Input.TimeZoneId) && SettingsService.IsValidTimeZone(Input.TimeZoneId)) ids.Insert(0, Input.TimeZoneId);
        var nowUtc = DateTimeOffset.UtcNow;
        TimeZones = ids.Select(id =>
        {
            var offset = TimeZoneInfo.FindSystemTimeZoneById(id).GetUtcOffset(nowUtc);
            var sign = offset < TimeSpan.Zero ? "−" : "+";
            return (id, $"{id.Replace('_', ' ')} (UTC{sign}{offset.Duration():hh\\:mm})");
        }).ToList();
    }
}
