namespace DayLog.Web.Domain;

// Properties with only a getter (Duration etc.) are calculated, so EF does not map them to columns.

/// <summary>One night's sleep. It belongs to the day you woke up (WakeTime's date).</summary>
public class SleepLog : TimedEntry
{
    public DateTime BedTime { get; set; }
    public DateTime WakeTime { get; set; }

    /// <summary>1 (terrible) to 5 (great).</summary>
    public int Quality { get; set; }
    public int TimesWoken { get; set; }
    public string? Notes { get; set; }

    /// <summary>Works across midnight because both values are full date-times, not just times of day.</summary>
    public TimeSpan Duration => WakeTime - BedTime;
}

public class Meal : TimedEntry
{
    public DateTime Time { get; set; }
    public MealType MealType { get; set; }

    /// <summary>What you ate. Null when <see cref="Skipped"/> is true.</summary>
    public string? Description { get; set; }

    /// <summary>Null when <see cref="Skipped"/> is true.</summary>
    public MealSize? Size { get; set; }

    /// <summary>
    /// A skipped meal is still logged as a row, so "skipped breakfast" means you actually recorded
    /// skipping it, which is different from forgetting to log it.
    /// </summary>
    public bool Skipped { get; set; }
}

public class CaffeineIntake : TimedEntry
{
    public DateTime Time { get; set; }
    public CaffeineType Type { get; set; }
    public double Servings { get; set; } = 1;

    /// <summary>Estimated caffeine. Pre-filled from <see cref="CaffeineDefaults"/>, editable.</summary>
    public int CaffeineMg { get; set; }
}

public class WaterIntake : TimedEntry
{
    public DateTime Time { get; set; }
    public int Glasses { get; set; } = 1;
}

public class EnergyCheckIn : TimedEntry
{
    public DateTime Time { get; set; }

    /// <summary>All three are 1 (low) to 5 (high).</summary>
    public int Energy { get; set; }
    public int Sleepiness { get; set; }
    public int Mood { get; set; }
    public string? Note { get; set; }
}

public class Activity : TimedEntry
{
    public DateTime StartTime { get; set; }

    /// <summary>Null while the activity is still running (started from the Today page, not yet stopped).</summary>
    public DateTime? EndTime { get; set; }
    public ActivityCategory Category { get; set; }
    public string? Notes { get; set; }

    public bool IsRunning => EndTime is null;
    public TimeSpan? Duration => EndTime - StartTime;
}

/// <summary>End-of-day reflection. At most one per calendar date (unique index).</summary>
public class DailyReflection : EntityBase
{
    public DateOnly Date { get; set; }
    public string? WentWell { get; set; }
    public string? DidntGoWell { get; set; }
    public string? DoDifferently { get; set; }

    /// <summary>1 (bad day) to 5 (great day).</summary>
    public int DayRating { get; set; }
}
