using DayLog.Web.Domain;
using DayLog.Web.Services;

namespace DayLog.Tests;

public class TimelineBuilderTests
{
    private static readonly DateOnly Day = new(2026, 10, 1);
    private static DateTime At(int h, int m = 0) => Day.ToDateTime(new TimeOnly(h, m));

    private static DaySnapshot Snapshot(
        SleepLog? sleep = null,
        IReadOnlyList<Meal>? meals = null,
        IReadOnlyList<CaffeineIntake>? caffeine = null,
        IReadOnlyList<EnergyCheckIn>? checkIns = null,
        IReadOnlyList<Activity>? activities = null,
        DateTime? now = null) =>
        new(Day, IsToday: now is not null, now ?? At(23, 59), sleep,
            meals ?? [], caffeine ?? [], [], checkIns ?? [], activities ?? [], null, null);

    [Fact]
    public void Range_starts_an_hour_before_waking()
    {
        var sleep = new SleepLog { Id = 1, BedTime = At(0).AddMinutes(-30), WakeTime = At(6, 30), Quality = 4 };

        var timeline = TimelineBuilder.Build(Snapshot(sleep: sleep));

        Assert.Equal(5, timeline.StartHour);
        var item = Assert.Single(timeline.Items);
        Assert.Equal(EntryKind.Sleep, item.Kind);
        Assert.True(item.ClippedTop);           // bedtime was yesterday
        Assert.Equal(0, item.Top, 3);           // so it starts at the top of the timeline
        Assert.Equal(1.5, item.Height, 3);      // 05:00 → 06:30
    }

    [Fact]
    public void Range_covers_late_entries_and_now()
    {
        var timeline = TimelineBuilder.Build(Snapshot(
            meals: [new Meal { Id = 1, Time = At(22, 40), MealType = MealType.Snack, Description = "x", Size = MealSize.Light }],
            now: At(10)));

        Assert.Equal(7, timeline.StartHour);  // default when nothing earlier
        Assert.Equal(24, timeline.EndHour);   // 22:40 + padding, rounded up
        Assert.Equal(3, timeline.NowOffset!.Value, 3);
    }

    [Fact]
    public void Markers_logged_close_together_go_side_by_side()
    {
        var timeline = TimelineBuilder.Build(Snapshot(
            meals: [new Meal { Id = 1, Time = At(7, 30), MealType = MealType.Breakfast, Description = "Oats", Size = MealSize.Light }],
            caffeine:
            [
                new CaffeineIntake { Id = 2, Time = At(7, 35), Type = CaffeineType.Espresso },
                new CaffeineIntake { Id = 3, Time = At(10, 0), Type = CaffeineType.Coffee },
            ]));

        var columns = timeline.Items.Where(i => i.Lane == TimelineLane.Intake).ToDictionary(i => i.Id, i => i.Column);
        Assert.Equal(0, columns[1]);
        Assert.Equal(1, columns[2]); // 5 minutes later would overlap, so next column
        Assert.Equal(0, columns[3]); // far enough apart to reuse column 0
    }

    [Fact]
    public void Running_activity_extends_to_now()
    {
        var timeline = TimelineBuilder.Build(Snapshot(
            activities: [new Activity { Id = 1, StartTime = At(9), Category = ActivityCategory.DeepWork }],
            now: At(10, 30)));

        var block = Assert.Single(timeline.Items);
        Assert.True(block.Running);
        Assert.Equal(1.5, block.Height, 3);
        Assert.Equal("fam-work", block.CssClass);
    }

    [Fact]
    public void Activity_from_previous_evening_is_clipped_at_midnight()
    {
        var timeline = TimelineBuilder.Build(Snapshot(
            activities: [new Activity { Id = 1, StartTime = At(0).AddHours(-1), EndTime = At(1), Category = ActivityCategory.ScreenTime }]));

        Assert.Equal(0, timeline.StartHour);
        var block = Assert.Single(timeline.Items);
        Assert.True(block.ClippedTop);
        Assert.Equal(0, block.Top, 3);
        Assert.Equal(1, block.Height, 3);
    }

    [Fact]
    public void Check_in_shows_energy_and_level_class()
    {
        var timeline = TimelineBuilder.Build(Snapshot(
            checkIns: [new EnergyCheckIn { Id = 7, Time = At(15), Energy = 2, Sleepiness = 4, Mood = 3, Note = "slump" }]));

        var dot = Assert.Single(timeline.Items);
        Assert.Equal("2", dot.Label);
        Assert.Contains("lvl-2", dot.CssClass);
        Assert.Contains("slump", dot.Detail);
    }
}
