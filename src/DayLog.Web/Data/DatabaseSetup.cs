using DayLog.Web.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace DayLog.Web.Data;

public static class DatabaseSetup
{
    /// <summary>
    /// Turns a relative SQLite path ("App_Data/daylog.db") into an absolute one under the app's
    /// content root, and makes sure the folder exists. Without this, the DB would land wherever
    /// the process happened to be started from.
    /// </summary>
    public static string ResolveSqliteConnectionString(string connectionString, string contentRoot)
    {
        var builder = new SqliteConnectionStringBuilder(connectionString);
        if (builder.DataSource != ":memory:" && !Path.IsPathRooted(builder.DataSource))
            builder.DataSource = Path.GetFullPath(Path.Combine(contentRoot, builder.DataSource));

        var folder = Path.GetDirectoryName(builder.DataSource);
        if (!string.IsNullOrEmpty(folder)) Directory.CreateDirectory(folder);
        return builder.ToString();
    }

    /// <summary>
    /// Applies pending migrations on startup and seeds demo data if the database was just created.
    /// Auto-migrating is fine for a single-user SQLite app. For a shared cloud database you'd
    /// run migrations as a deployment step instead.
    /// </summary>
    public static async Task InitialiseDatabaseAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<DayLogDbContext>();
        var options = scope.ServiceProvider.GetRequiredService<IOptions<DayLogOptions>>().Value;
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<DayLogDbContext>>();

        var isNewDatabase = !(await db.Database.GetAppliedMigrationsAsync()).Any();
        await db.Database.MigrateAsync();

        // Saved preferences (time zone, targets, theme) into memory before the first request.
        await scope.ServiceProvider.GetRequiredService<SettingsService>().LoadAsync();

        if (isNewDatabase && options.SeedNewDatabase)
        {
            var rows = await scope.ServiceProvider.GetRequiredService<SeedService>().SeedAsync();
            logger.LogInformation("New database created and seeded with {Rows} demo rows", rows);
        }
    }
}
