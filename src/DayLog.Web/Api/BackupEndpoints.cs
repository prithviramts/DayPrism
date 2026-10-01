using DayLog.Web.Services;

namespace DayLog.Web.Api;

public static class BackupEndpoints
{
    public static IEndpointRouteBuilder MapBackupEndpoints(this IEndpointRouteBuilder app)
    {
        // GET so a plain link or bookmark downloads it. It only reads data.
        app.MapGet("/backup", async (BackupService backup, CancellationToken ct) =>
        {
            var (content, fileName) = await backup.CreateBackupAsync(ct);
            return Results.File(content, "application/vnd.sqlite3", fileName);
        });

        return app;
    }
}
