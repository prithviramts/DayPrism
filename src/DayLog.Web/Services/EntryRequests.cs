using DayLog.Web.Domain;

namespace DayLog.Web.Services;

// The shapes the quick-add forms send as JSON. Times are local wall-clock values
// ("2026-10-01T13:05:00", no offset); the server attaches the UTC offset itself.
// Each request validates itself; EntryService calls Validate() before saving.

public sealed record CheckInRequest(DateTime Time, int Energy, int Sleepiness, int Mood, string? Note) : IValidatable
{
    public void Validate(ValidationErrors errors) => errors
        .Rating(Energy, nameof(Energy))
        .Rating(Sleepiness, nameof(Sleepiness))
        .Rating(Mood, nameof(Mood))
        .MaxLength(Note, 1000, nameof(Note));
}

public sealed record MealRequest(DateTime Time, MealType MealType, string? Description, MealSize? Size, bool Skipped) : IValidatable
{
    public void Validate(ValidationErrors errors) => errors
        .Require(Skipped || !string.IsNullOrWhiteSpace(Description), nameof(Description), "Say what you ate, or mark the meal as skipped.")
        .Require(Skipped || Size is not null, nameof(Size), "Pick a size.")
        .MaxLength(Description, 1000, nameof(Description));
}

public sealed record CaffeineRequest(DateTime Time, CaffeineType Type, double Servings, int? CaffeineMg) : IValidatable
{
    public void Validate(ValidationErrors errors) => errors
        .Require(Servings is > 0 and <= 10, nameof(Servings), "Servings must be between 0 and 10.")
        .Require(CaffeineMg is null or >= 0 and <= 2000, nameof(CaffeineMg), "Caffeine must be between 0 and 2000 mg.");
}

public sealed record WaterRequest(DateTime Time, int Glasses = 1) : IValidatable
{
    public void Validate(ValidationErrors errors) =>
        errors.Require(Glasses is > 0 and <= 10, nameof(Glasses), "Glasses must be between 1 and 10.");
}

/// <summary>An activity: running if EndTime is null, finished otherwise. Used for starting, logging and editing.</summary>
public sealed record ActivityRequest(DateTime StartTime, DateTime? EndTime, ActivityCategory Category, string? Notes) : IValidatable
{
    public void Validate(ValidationErrors errors) => errors
        .Require(EndTime is null || EndTime > StartTime, nameof(EndTime), "End time must be after the start time.")
        .MaxLength(Notes, 1000, nameof(Notes));
}

public sealed record StopActivityRequest(DateTime EndTime);

/// <summary>
/// Sleep is entered as two clock times plus the date you woke up. If the bedtime is later
/// than the wake time on the clock (23:30 vs 06:30) it must have been the previous evening.
/// </summary>
public sealed record SleepRequest(DateOnly WakeDate, TimeOnly BedTime, TimeOnly WakeTime, int Quality, int TimesWoken, string? Notes) : IValidatable
{
    public DateTime WakeDateTime => WakeDate.ToDateTime(WakeTime);
    public DateTime BedDateTime => (BedTime > WakeTime ? WakeDate.AddDays(-1) : WakeDate).ToDateTime(BedTime);

    public void Validate(ValidationErrors errors) => errors
        .Rating(Quality, nameof(Quality))
        .Require(TimesWoken is >= 0 and <= 30, nameof(TimesWoken), "Times woken must be between 0 and 30.")
        .Require(BedTime != WakeTime, nameof(WakeTime), "Bed time and wake time can't be the same.")
        .Require(WakeDateTime - BedDateTime <= TimeSpan.FromHours(16), nameof(BedTime), "That's more than 16 hours of sleep. Check the times.")
        .MaxLength(Notes, 2000, nameof(Notes));
}

public sealed record ReflectionRequest(DateOnly Date, string? WentWell, string? DidntGoWell, string? DoDifferently, int DayRating) : IValidatable
{
    public void Validate(ValidationErrors errors) => errors
        .Rating(DayRating, nameof(DayRating))
        .MaxLength(WentWell, 2000, nameof(WentWell))
        .MaxLength(DidntGoWell, 2000, nameof(DidntGoWell))
        .MaxLength(DoDifferently, 2000, nameof(DoDifferently));
}

public interface IValidatable
{
    void Validate(ValidationErrors errors);
}

/// <summary>Collects field errors in the shape ASP.NET's ValidationProblem response expects.</summary>
public sealed class ValidationErrors
{
    private readonly Dictionary<string, List<string>> _errors = new(StringComparer.OrdinalIgnoreCase);

    public bool Any => _errors.Count > 0;

    public ValidationErrors Require(bool condition, string field, string message)
    {
        if (!condition) Add(field, message);
        return this;
    }

    public ValidationErrors Rating(int value, string field) =>
        Require(value is >= 1 and <= 5, field, $"{field} must be between 1 and 5.");

    public ValidationErrors MaxLength(string? value, int max, string field) =>
        Require(value is null || value.Length <= max, field, $"{field} must be {max} characters or fewer.");

    public void Add(string field, string message)
    {
        // camelCase field names to match the JSON the browser sent.
        var key = char.ToLowerInvariant(field[0]) + field[1..];
        if (!_errors.TryGetValue(key, out var list)) _errors[key] = list = [];
        list.Add(message);
    }

    public Dictionary<string, string[]> ToDictionary() => _errors.ToDictionary(e => e.Key, e => e.Value.ToArray());

    public void ThrowIfAny()
    {
        if (Any) throw new EntryValidationException(ToDictionary());
    }
}

public sealed class EntryValidationException(Dictionary<string, string[]> errors)
    : Exception("The entry is not valid.")
{
    public Dictionary<string, string[]> Errors { get; } = errors;
}
