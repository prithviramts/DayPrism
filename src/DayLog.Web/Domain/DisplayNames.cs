namespace DayLog.Web.Domain;

/// <summary>Which kind of entry a row is. Used in API routes (/api/entries/{kind}/{id}) and the timeline.</summary>
public enum EntryKind { Sleep, Meal, Caffeine, Water, CheckIn, Activity, Reflection }

/// <summary>Human-readable names and formatting, kept in one place so every page says the same thing.</summary>
public static class DisplayNames
{
    public static string For(ActivityCategory category) => category switch
    {
        ActivityCategory.DeepWork => "Deep work",
        ActivityCategory.YouTubeWork => "YouTube work",
        ActivityCategory.SideProject => "Side project",
        ActivityCategory.ScreenTime => "Screen time",
        _ => category.ToString(),
    };

    public static string For(CaffeineType type) => type switch
    {
        CaffeineType.DoubleEspresso => "Double espresso",
        CaffeineType.EnergyDrink => "Energy drink",
        _ => type.ToString(),
    };

    public static string IconFor(CaffeineType type) => type switch
    {
        CaffeineType.Tea => "🍵",
        CaffeineType.EnergyDrink => "🥤",
        _ => "☕",
    };

    public static string IconFor(MealType type) => type switch
    {
        MealType.Breakfast => "🥣",
        MealType.Snack => "🍎",
        _ => "🍽️",
    };

    /// <summary>
    /// Groups the 12 activity categories into 6 colour families for the timeline. Twelve distinct
    /// colours can't be told apart reliably (especially with colour-blindness), so related
    /// categories share a colour and every block also shows its category name.
    /// </summary>
    public static string FamilyOf(ActivityCategory category) => category switch
    {
        ActivityCategory.Work or ActivityCategory.DeepWork or ActivityCategory.Meetings => "work",
        ActivityCategory.Study or ActivityCategory.YouTubeWork or ActivityCategory.SideProject => "growth",
        ActivityCategory.Exercise => "exercise",
        ActivityCategory.Commute => "commute",
        ActivityCategory.Social => "social",
        _ => "neutral", // Rest, Screen time, Other
    };

    /// <summary>"6h 59m", "45m".</summary>
    public static string Duration(TimeSpan span)
    {
        if (span < TimeSpan.Zero) span = TimeSpan.Zero;
        var hours = (int)span.TotalHours;
        return hours > 0 ? $"{hours}h {span.Minutes:00}m" : $"{span.Minutes}m";
    }
}
