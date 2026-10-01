using DayLog.Web.Domain;

namespace DayLog.Web.Data.Seed;

/// <summary>All rows produced by one run of <see cref="SeedDataGenerator"/>.</summary>
public sealed class SeedData
{
    public List<SleepLog> Sleep { get; } = [];
    public List<Meal> Meals { get; } = [];
    public List<CaffeineIntake> Caffeine { get; } = [];
    public List<WaterIntake> Water { get; } = [];
    public List<EnergyCheckIn> CheckIns { get; } = [];
    public List<Activity> Activities { get; } = [];
    public List<DailyReflection> Reflections { get; } = [];

    public int TotalRows =>
        Sleep.Count + Meals.Count + Caffeine.Count + Water.Count + CheckIns.Count + Activities.Count + Reflections.Count;
}

/// <summary>
/// Produces believable demo data with real cause-and-effect built in, so the Insights charts
/// have patterns to show rather than random noise:
///   - short sleep lowers next-day energy and raises sleepiness
///   - short sleep makes afternoon/late caffeine more likely
///   - caffeine after ~15:30 pushes bedtime later and lowers sleep quality
///   - skipped breakfast lowers energy before noon; a heavy lunch deepens the afternoon dip
///   - energy follows a daily curve: morning peak, post-lunch dip, evening decline
///
/// It is a pure function of (today, days, random seed), so tests can check its output exactly.
/// Workdays follow the UAE week: Monday to Friday, with Saturday and Sunday off.
/// </summary>
public sealed class SeedDataGenerator(int randomSeed = 42)
{
    private readonly Random _rng = new(randomSeed);
    private Func<DateTime, int> _offsetAt = _ => 0;

    // Energy baseline at each check-in slot (hour of day -> typical energy before adjustments).
    private static readonly (double Hour, double Energy)[] CheckInSlots =
    [
        (8.75, 3.3), (10.75, 3.9), (13.5, 3.3), (15.25, 2.6), (18.25, 3.2), (21.5, 2.7),
    ];

    private static readonly string[] Breakfasts =
        ["Oats with banana", "Eggs on toast", "Greek yogurt and granola", "Manakish", "Avocado toast", "Shakshuka"];
    private static readonly string[] Lunches =
        ["Chicken shawarma plate", "Grilled chicken salad", "Biryani", "Sushi box", "Burger and fries", "Lentil soup and bread", "Pasta"];
    private static readonly string[] Dinners =
        ["Salmon with rice", "Homemade curry", "Stir-fry noodles", "Grilled fish and veg", "Pizza", "Chicken wrap", "Omelette and salad"];
    private static readonly string[] Snacks = ["Dates and almonds", "Protein bar", "Fruit", "Crisps", "Chocolate"];

    public SeedData Generate(DateOnly today, int days, Func<DateTime, int> offsetAt)
    {
        _offsetAt = offsetAt;
        var data = new SeedData();
        var first = today.AddDays(-days);

        // The night before the first seeded day has no previous day to influence it.
        var lastNight = MakeSleep(first, lastCaffeineHour: 10);
        data.Sleep.Add(lastNight);

        for (var day = first; day < today; day = day.AddDays(1))
        {
            var lastCaffeineHour = GenerateDay(day, lastNight, data);

            // Tonight's sleep (waking up tomorrow) depends on today's caffeine. The loop
            // ends with the sleep that woke up *today*, so the Today page has "last night".
            lastNight = MakeSleep(day.AddDays(1), lastCaffeineHour);
            data.Sleep.Add(lastNight);
        }

        return data;
    }

    private SleepLog MakeSleep(DateOnly wakeDate, double lastCaffeineHour)
    {
        var workdayMorning = IsWorkday(wakeDate);
        var lateCaffeine = lastCaffeineHour >= 15.5;

        // Bedtime as hours after midnight of the previous day (24.5 = 00:30).
        var bedHour = 23.25 + Normal(0, 0.4);
        if (!workdayMorning) bedHour += 1.0;                                  // later on weekend nights
        if (lateCaffeine) bedHour += 0.5 + (lastCaffeineHour - 15.5) * 0.4;   // wired from caffeine
        // "One more episode": a scheduled late night roughly every third night, so every 14-day
        // window has some short nights to compare against (pure randomness sometimes gave none).
        if (IsStoryDay(wakeDate, 0) || _rng.NextDouble() < 0.1) bedHour += 1.5;
        bedHour = Math.Clamp(bedHour, 22.0, 26.75);

        var wakeHour = workdayMorning ? 6.5 + Normal(0, 0.15) : 8.75 + Normal(0, 0.6);

        var bed = At(wakeDate.AddDays(-1), bedHour);
        var wake = At(wakeDate, wakeHour);
        var hours = (wake - bed).TotalHours;

        var quality = 4 + _rng.Next(-1, 2);
        if (lateCaffeine) quality--;
        if (hours < 6) quality--;
        if (hours >= 7.5) quality++;

        var woken = _rng.Next(0, 2) + (lateCaffeine ? _rng.Next(0, 3) : 0);

        string? notes = null;
        if (lateCaffeine && _rng.NextDouble() < 0.5) notes = "Mind racing, took ages to fall asleep";
        else if (hours >= 8 && _rng.NextDouble() < 0.5) notes = "Slept like a log";
        else if (_rng.NextDouble() < 0.15) notes = "Scrolled on phone in bed";

        return Stamp(new SleepLog
        {
            BedTime = bed,
            WakeTime = wake,
            Quality = Rating(quality),
            TimesWoken = woken,
            Notes = notes,
        }, bed);
    }

    /// <summary>Generates one day's entries and returns the hour of the day's last caffeine.</summary>
    private double GenerateDay(DateOnly day, SleepLog lastNight, SeedData data)
    {
        var weekend = !IsWorkday(day);
        var sleepHours = lastNight.Duration.TotalHours;
        var wakeHour = lastNight.WakeTime.TimeOfDay.TotalHours;

        // How much last night's sleep drags today's energy down (negative = boost).
        var sleepPenalty = sleepHours switch { < 6 => 1.1, < 7 => 0.5, >= 7.5 => -0.3, _ => 0 };

        // ---- Meals ----
        // Skipped breakfast on roughly every third workday (scheduled), plus the odd random one.
        var skippedBreakfast = !weekend && (IsStoryDay(day, 1) || _rng.NextDouble() < 0.2);
        var heavyLunch = _rng.NextDouble() < 0.3;
        var lunchHour = (weekend ? 13.75 : 13.0) + Normal(0, 0.2);
        var dinnerHour = 20.0 + Normal(0, 0.35);

        data.Meals.Add(skippedBreakfast
            ? Stamp(new Meal { Time = At(day, wakeHour + 0.5), MealType = MealType.Breakfast, Skipped = true }, day, wakeHour + 0.5)
            : Stamp(new Meal
            {
                Time = At(day, wakeHour + 0.5),
                MealType = MealType.Breakfast,
                Description = Pick(Breakfasts),
                Size = _rng.NextDouble() < 0.5 ? MealSize.Light : MealSize.Normal,
            }, day, wakeHour + 0.5));

        data.Meals.Add(Stamp(new Meal
        {
            Time = At(day, lunchHour),
            MealType = MealType.Lunch,
            Description = Pick(Lunches),
            Size = heavyLunch ? MealSize.Heavy : MealSize.Normal,
        }, day, lunchHour));

        if (_rng.NextDouble() < 0.5)
        {
            var snackHour = 16.25 + Normal(0, 0.3);
            data.Meals.Add(Stamp(new Meal
            {
                Time = At(day, snackHour), MealType = MealType.Snack, Description = Pick(Snacks), Size = MealSize.Light,
            }, day, snackHour));
        }

        data.Meals.Add(Stamp(new Meal
        {
            Time = At(day, dinnerHour),
            MealType = MealType.Dinner,
            Description = Pick(Dinners),
            Size = _rng.NextDouble() < 0.25 ? MealSize.Heavy : MealSize.Normal,
        }, day, dinnerHour));

        // ---- Caffeine ---- (tired days -> more and later caffeine, which feeds into tonight's sleep)
        var caffeine = new List<(double Hour, CaffeineType Type)>
        {
            (wakeHour + 0.6 + Normal(0, 0.1), weekend ? CaffeineType.Coffee : Pick([CaffeineType.Espresso, CaffeineType.DoubleEspresso, CaffeineType.Coffee])),
        };
        if (!weekend && _rng.NextDouble() < 0.6)
            caffeine.Add((10.5 + Normal(0, 0.25), Pick([CaffeineType.Espresso, CaffeineType.Coffee, CaffeineType.Tea])));
        if (_rng.NextDouble() < (sleepHours < 6.5 ? 0.75 : 0.3))
            caffeine.Add((14.75 + Normal(0, 0.35), Pick([CaffeineType.Espresso, CaffeineType.Coffee, CaffeineType.Tea])));
        // After a short night you always reach for a late coffee, which feeds into tonight's sleep.
        if (sleepHours < 6 || _rng.NextDouble() < 0.12)
            caffeine.Add((16.75 + Math.Abs(Normal(0, 0.6)), Pick([CaffeineType.Coffee, CaffeineType.EnergyDrink])));

        foreach (var (hour, type) in caffeine)
        {
            data.Caffeine.Add(Stamp(new CaffeineIntake
            {
                Time = At(day, hour), Type = type, Servings = 1, CaffeineMg = CaffeineDefaults.MgPerServing(type),
            }, day, hour));
        }
        var lastCaffeineHour = caffeine.Max(c => c.Hour);

        // ---- Activities ---- (sequential, never overlapping)
        var cursor = 0.0;
        var did = new HashSet<ActivityCategory>();
        void Block(ActivityCategory category, double start, double hours, string? notes = null)
        {
            start = Math.Max(start, cursor);
            cursor = start + hours;
            did.Add(category);
            data.Activities.Add(Stamp(new Activity
            {
                StartTime = At(day, start), EndTime = At(day, cursor), Category = category, Notes = notes,
            }, day, start));
        }

        if (!weekend)
        {
            Block(ActivityCategory.Commute, wakeHour + 0.9, 0.8 + Normal(0, 0.08));
            if (_rng.NextDouble() < 0.6) Block(ActivityCategory.DeepWork, cursor + 0.1, 1.75, "Focused block, notifications off");
            else Block(ActivityCategory.Work, cursor + 0.1, 1.75);
            Block(ActivityCategory.Meetings, cursor, 1.25);
            Block(ActivityCategory.Work, cursor, Math.Max(0.25, lunchHour - cursor - 0.05));
            var afternoon = lunchHour + 0.75;
            if (_rng.NextDouble() < 0.5) Block(ActivityCategory.Meetings, afternoon, 1.0);
            Block(ActivityCategory.Work, Math.Max(afternoon, cursor), Math.Max(0.5, 17.25 - Math.Max(afternoon, cursor)));
            Block(ActivityCategory.Commute, 17.4, 0.85 + Normal(0, 0.1));
            if (_rng.NextDouble() < (sleepHours < 6 ? 0.25 : 0.55)) Block(ActivityCategory.Exercise, 18.6, 1.0, "Gym");
            if (_rng.NextDouble() < 0.7)
                Block(Pick([ActivityCategory.YouTubeWork, ActivityCategory.SideProject, ActivityCategory.Study]), dinnerHour + 0.6, 1.0 + _rng.NextDouble() * 0.5);
            Block(ActivityCategory.ScreenTime, Math.Max(cursor, 21.5), 0.75 + _rng.NextDouble() * 0.75);
        }
        else
        {
            Block(ActivityCategory.Rest, wakeHour + 0.25, 1.25);
            if (_rng.NextDouble() < 0.5) Block(ActivityCategory.Exercise, cursor + 0.25, 1.0, "Run along the Marina");
            Block(Pick([ActivityCategory.SideProject, ActivityCategory.YouTubeWork]), cursor + 0.25, Math.Max(1.0, lunchHour - cursor - 0.5));
            if (_rng.NextDouble() < 0.6) Block(ActivityCategory.Social, 15.5, 2.5, "Out with friends");
            else Block(ActivityCategory.Rest, 15.5, 2.0);
            Block(ActivityCategory.ScreenTime, 21.0, 1.5);
        }

        // ---- Energy check-ins ----
        var energies = new List<int>();
        foreach (var (slotHour, baseline) in CheckInSlots)
        {
            if (_rng.NextDouble() < 0.15) continue; // forgot to log this one
            var hour = slotHour + Normal(0, 0.2);
            if (hour < wakeHour + 0.5) hour = wakeHour + 0.75;

            var e = baseline - sleepPenalty + Normal(0, 0.45);
            if (hour < 12 && skippedBreakfast) e -= 0.9;
            if (slotHour is > 15 and < 16 && heavyLunch) e -= 0.6;
            if (weekend) e += 0.3;
            if (caffeine.Any(c => hour - c.Hour is > 0 and < 1.5)) e += 0.4; // short caffeine lift

            string? note = null;
            if (slotHour is > 15 and < 16 && heavyLunch) note = "Post-lunch crash";
            else if (hour < 12 && skippedBreakfast && _rng.NextDouble() < 0.5) note = "Hungry and foggy";
            else if (_rng.NextDouble() < 0.08) note = Pick(["Back-to-back calls", "Feeling good", "Headache", "In the zone"]);

            var energy = Rating(e);
            energies.Add(energy);
            data.CheckIns.Add(Stamp(new EnergyCheckIn
            {
                Time = At(day, hour),
                Energy = energy,
                Sleepiness = Rating(6 - e + sleepPenalty * 0.3 + Normal(0, 0.5)),
                Mood = Rating(3.1 + (e - 3) * 0.6 + (weekend ? 0.4 : 0) + Normal(0, 0.5)),
                Note = note,
            }, day, hour));
        }

        // ---- Water ----
        var glasses = _rng.Next(4, 9);
        foreach (var hour in Enumerable.Range(0, glasses).Select(_ => wakeHour + 0.3 + _rng.NextDouble() * (22 - wakeHour)).Order())
            data.Water.Add(Stamp(new WaterIntake { Time = At(day, hour), Glasses = 1 }, day, hour));

        // ---- Reflection ---- (written from what actually happened in the generated day)
        var avgEnergy = energies.Count > 0 ? energies.Average() : 3;
        var issues = new List<(string What, string Fix)>();
        if (sleepHours < 6) issues.Add(("Running on too little sleep, everything felt harder.", "Lights out by 23:00."));
        if (skippedBreakfast) issues.Add(("Skipped breakfast and was foggy before lunch.", "Eat something before leaving home."));
        if (lastCaffeineHour >= 15.5) issues.Add(("Had caffeine too late in the afternoon.", "No caffeine after 15:00."));
        if (heavyLunch) issues.Add(("Heavy lunch, big afternoon slump.", "Lighter lunch and a short walk after."));
        if (issues.Count == 0) issues.Add(("Too much scrolling in the evening.", "Phone out of the bedroom."));

        var wentWell =
            did.Contains(ActivityCategory.Exercise) ? "Got a workout in and felt sharper after."
            : did.Contains(ActivityCategory.DeepWork) ? "Solid deep-work block in the morning."
            : did.Contains(ActivityCategory.Social) ? "Good time with friends."
            : did.Contains(ActivityCategory.YouTubeWork) ? "Made progress on the YouTube channel."
            : did.Contains(ActivityCategory.SideProject) ? "Moved the side project forward."
            : "Stayed on top of work tasks.";

        data.Reflections.Add(new DailyReflection
        {
            Date = day,
            WentWell = wentWell,
            DidntGoWell = issues[0].What,
            DoDifferently = issues[0].Fix,
            DayRating = Rating(avgEnergy + (weekend ? 0.4 : 0) - (sleepHours < 6 ? 0.4 : 0) + Normal(0, 0.4)),
            IsSeed = true,
        });

        return lastCaffeineHour;
    }

    // ---- helpers ----

    /// <summary>
    /// Deterministic "this happens today" schedule: true on every third day, shifted by
    /// <paramref name="offset"/> so different events land on different days. Based on the date
    /// itself, so it holds whatever "today" the data is generated for.
    /// </summary>
    private static bool IsStoryDay(DateOnly date, int offset) => (date.DayNumber + offset) % 3 == 0;

    /// <summary>UAE work week: Monday to Friday.</summary>
    public static bool IsWorkday(DateOnly date) => date.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday);

    /// <summary>A local time on <paramref name="day"/>, rounded to the minute. Hours ≥ 24 roll into the next day.</summary>
    private static DateTime At(DateOnly day, double hour) =>
        day.ToDateTime(TimeOnly.MinValue).AddMinutes(Math.Round(hour * 60));

    private T Stamp<T>(T entry, DateOnly day, double hour) where T : TimedEntry => Stamp(entry, At(day, hour));

    private T Stamp<T>(T entry, DateTime local) where T : TimedEntry
    {
        entry.IsSeed = true;
        entry.UtcOffsetMinutes = _offsetAt(local);
        return entry;
    }

    private static int Rating(double value) => (int)Math.Clamp(Math.Round(value), 1, 5);

    private T Pick<T>(T[] options) => options[_rng.Next(options.Length)];

    /// <summary>Normally distributed random number (Box–Muller transform).</summary>
    private double Normal(double mean, double stdDev)
    {
        var u1 = 1.0 - _rng.NextDouble();
        var u2 = _rng.NextDouble();
        return mean + stdDev * Math.Sqrt(-2.0 * Math.Log(u1)) * Math.Cos(2.0 * Math.PI * u2);
    }
}
