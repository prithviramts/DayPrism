using DayLog.Web.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace DayLog.Web.Data;

public class DayLogDbContext(DbContextOptions<DayLogDbContext> options, TimeProvider timeProvider)
    : DbContext(options)
{
    public DbSet<SleepLog> SleepLogs => Set<SleepLog>();
    public DbSet<Meal> Meals => Set<Meal>();
    public DbSet<CaffeineIntake> CaffeineIntakes => Set<CaffeineIntake>();
    public DbSet<WaterIntake> WaterIntakes => Set<WaterIntake>();
    public DbSet<EnergyCheckIn> EnergyCheckIns => Set<EnergyCheckIn>();
    public DbSet<Activity> Activities => Set<Activity>();
    public DbSet<DailyReflection> DailyReflections => Set<DailyReflection>();
    public DbSet<UserSettings> UserSettings => Set<UserSettings>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Store every enum as its name ("DeepWork") rather than a number (2). The DB file and
        // CSV exports stay readable, and reordering enum members can't corrupt existing rows.
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(32);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Indexes are on the time column each table is queried by ("everything on date X").
        // EF stores DateTime as ISO-8601 text in SQLite, which sorts correctly as a string,
        // so range queries and these check constraints compare correctly.

        modelBuilder.Entity<SleepLog>(e =>
        {
            e.HasIndex(x => x.WakeTime);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_SleepLogs_Quality", "\"Quality\" BETWEEN 1 AND 5");
                t.HasCheckConstraint("CK_SleepLogs_TimesWoken", "\"TimesWoken\" >= 0");
                t.HasCheckConstraint("CK_SleepLogs_WakeAfterBed", "\"WakeTime\" > \"BedTime\"");
            });
        });

        modelBuilder.Entity<Meal>(e =>
        {
            e.HasIndex(x => x.Time);
            e.Property(x => x.Description).HasMaxLength(1000);
        });

        modelBuilder.Entity<CaffeineIntake>(e =>
        {
            e.HasIndex(x => x.Time);
            e.ToTable(t => t.HasCheckConstraint("CK_CaffeineIntakes_Servings", "\"Servings\" > 0"));
        });

        modelBuilder.Entity<WaterIntake>(e =>
        {
            e.HasIndex(x => x.Time);
            e.ToTable(t => t.HasCheckConstraint("CK_WaterIntakes_Glasses", "\"Glasses\" > 0"));
        });

        modelBuilder.Entity<EnergyCheckIn>(e =>
        {
            e.HasIndex(x => x.Time);
            e.Property(x => x.Note).HasMaxLength(1000);
            e.ToTable(t =>
            {
                AddRatingCheck(t, "EnergyCheckIns", "Energy");
                AddRatingCheck(t, "EnergyCheckIns", "Sleepiness");
                AddRatingCheck(t, "EnergyCheckIns", "Mood");
            });
        });

        modelBuilder.Entity<Activity>(e =>
        {
            e.HasIndex(x => x.StartTime);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.ToTable(t => t.HasCheckConstraint(
                "CK_Activities_EndAfterStart", "\"EndTime\" IS NULL OR \"EndTime\" > \"StartTime\""));
        });

        modelBuilder.Entity<DailyReflection>(e =>
        {
            e.HasIndex(x => x.Date).IsUnique();
            e.Property(x => x.WentWell).HasMaxLength(2000);
            e.Property(x => x.DidntGoWell).HasMaxLength(2000);
            e.Property(x => x.DoDifferently).HasMaxLength(2000);
            e.ToTable(t => AddRatingCheck(t, "DailyReflections", "DayRating"));
        });

        modelBuilder.Entity<UserSettings>(e =>
        {
            // Exactly one row: the id is always 1, never auto-generated.
            e.Property(x => x.Id).ValueGeneratedNever();
            e.Property(x => x.DisplayName).HasMaxLength(40);
            e.Property(x => x.TimeZoneId).HasMaxLength(64);
            e.ToTable(t => t.HasCheckConstraint("CK_UserSettings_Singleton", "\"Id\" = 1"));
        });
    }

    private static void AddRatingCheck<T>(TableBuilder<T> table, string tableName, string column) where T : class =>
        table.HasCheckConstraint($"CK_{tableName}_{column}", $"\"{column}\" BETWEEN 1 AND 5");

    // Both sync and async SaveChanges route through these two overloads.
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampAuditColumns();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        StampAuditColumns();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    /// <summary>Fills CreatedAtUtc/UpdatedAtUtc centrally so no page or service has to remember to.</summary>
    private void StampAuditColumns()
    {
        var now = timeProvider.GetUtcNow().UtcDateTime;
        foreach (var entry in ChangeTracker.Entries<EntityBase>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAtUtc = now;
                entry.Entity.UpdatedAtUtc = now;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAtUtc = now;
            }
        }
    }
}
