namespace DayLog.Web.Domain;

// All enums are stored in the database as their names (e.g. "DeepWork"), see DayLogDbContext.ConfigureConventions.
// That means members can be reordered safely, but renaming one needs a data migration.

public enum MealType { Breakfast, Lunch, Dinner, Snack }

public enum MealSize { Light, Normal, Heavy }

public enum CaffeineType { Espresso, DoubleEspresso, Coffee, Tea, EnergyDrink }

public enum ActivityCategory
{
    Commute,
    Work,
    DeepWork,
    Meetings,
    Study,
    Exercise,
    YouTubeWork,
    SideProject,
    Social,
    ScreenTime,
    Rest,
    Other,
}

public static class CaffeineDefaults
{
    /// <summary>
    /// Typical caffeine per serving, used to pre-fill <see cref="CaffeineIntake.CaffeineMg"/>.
    /// Rough averages only; the user can override the value per entry.
    /// </summary>
    public static int MgPerServing(CaffeineType type) => type switch
    {
        CaffeineType.Espresso => 63,
        CaffeineType.DoubleEspresso => 126,
        CaffeineType.Coffee => 95,
        CaffeineType.Tea => 47,
        CaffeineType.EnergyDrink => 80,
        _ => 0,
    };
}
