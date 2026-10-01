using DayLog.Web.Data.Seed;

namespace DayLog.Tests;

public class SeedDataGeneratorTests
{
    private static readonly DateOnly Today = new(2026, 10, 1);
    private static SeedData Generate(int seed = 42) => new SeedDataGenerator(seed).Generate(Today, 14, _ => 240);

    [Fact]
    public void Generates_one_sleep_per_night_including_last_night()
    {
        var data = Generate();

        Assert.Equal(15, data.Sleep.Count); // 14 days + the night that woke up today
        Assert.Equal(Today, DateOnly.FromDateTime(data.Sleep[^1].WakeTime));
        Assert.All(data.Sleep, s => Assert.InRange(s.Duration.TotalHours, 4, 11));
    }

    [Fact]
    public void Generates_one_reflection_per_past_day_and_nothing_for_today()
    {
        var data = Generate();

        Assert.Equal(14, data.Reflections.Select(r => r.Date).Distinct().Count());
        Assert.DoesNotContain(data.CheckIns, c => DateOnly.FromDateTime(c.Time) >= Today);
    }

    [Fact]
    public void All_ratings_are_within_1_to_5()
    {
        var data = Generate();

        Assert.All(data.Sleep, s => Assert.InRange(s.Quality, 1, 5));
        Assert.All(data.CheckIns, c =>
        {
            Assert.InRange(c.Energy, 1, 5);
            Assert.InRange(c.Sleepiness, 1, 5);
            Assert.InRange(c.Mood, 1, 5);
        });
        Assert.All(data.Reflections, r => Assert.InRange(r.DayRating, 1, 5));
    }

    [Fact]
    public void Activities_never_overlap()
    {
        var ordered = Generate().Activities.OrderBy(a => a.StartTime).ToList();

        Assert.All(ordered, a => Assert.True(a.EndTime > a.StartTime));
        for (var i = 1; i < ordered.Count; i++)
            Assert.True(ordered[i].StartTime >= ordered[i - 1].EndTime, $"Overlap at {ordered[i].StartTime}");
    }

    [Fact]
    public void Every_row_is_flagged_as_seed_with_offset()
    {
        var data = Generate();

        Assert.All(data.Meals.Cast<Web.Domain.TimedEntry>().Concat(data.Activities).Concat(data.Sleep), e =>
        {
            Assert.True(e.IsSeed);
            Assert.Equal(240, e.UtcOffsetMinutes);
        });
        Assert.All(data.Reflections, r => Assert.True(r.IsSeed));
    }

    [Fact]
    public void Same_seed_gives_same_data()
    {
        Assert.Equal(
            Generate().CheckIns.Select(c => (c.Time, c.Energy)),
            Generate().CheckIns.Select(c => (c.Time, c.Energy)));
    }

    [Fact]
    public void Short_sleep_days_have_lower_average_energy()
    {
        // This is the main pattern the Insights page should find, so check the demo data contains it.
        // Use a longer run so both groups have enough days.
        var data = new SeedDataGenerator().Generate(Today, 60, _ => 240);
        var sleepByDay = data.Sleep.ToDictionary(s => DateOnly.FromDateTime(s.WakeTime), s => s.Duration.TotalHours);
        var energyByDay = data.CheckIns.GroupBy(c => DateOnly.FromDateTime(c.Time)).ToDictionary(g => g.Key, g => g.Average(c => c.Energy));

        var shortNights = energyByDay.Where(e => sleepByDay[e.Key] < 6).Select(e => e.Value).ToList();
        var longNights = energyByDay.Where(e => sleepByDay[e.Key] >= 7).Select(e => e.Value).ToList();

        Assert.NotEmpty(shortNights);
        Assert.NotEmpty(longNights);
        Assert.True(shortNights.Average() < longNights.Average() - 0.5,
            $"short={shortNights.Average():F2} long={longNights.Average():F2}");
    }
}
