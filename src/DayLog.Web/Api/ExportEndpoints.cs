using System.Text;
using DayLog.Web.Services;

namespace DayLog.Web.Api;

/// <summary>
/// File downloads for the Monthly Review. Plain GETs (they only read data), so they work as
/// ordinary links. from/to are optional dates (yyyy-MM-dd); see <see cref="ReviewRange"/>.
/// </summary>
public static class ExportEndpoints
{
    public static IEndpointRouteBuilder MapExportEndpoints(this IEndpointRouteBuilder app)
    {
        var export = app.MapGroup("/export");

        // Summary + raw data together: the "Export for review" button.
        export.MapGet("/review.zip", async (DateOnly? from, DateOnly? to, ExportService exports, LocalClock clock, CancellationToken ct) =>
        {
            var (f, t) = ReviewRange.Resolve(from, to, clock.Today);
            return Results.File(await exports.BuildZipAsync(f, t, ct), "application/zip", $"{ExportService.FileStem(f, t)}-review.zip");
        });

        // ?download=false returns it inline as text, which the "Copy summary" button uses.
        export.MapGet("/review.md", async (DateOnly? from, DateOnly? to, bool? download, ExportService exports, LocalClock clock, CancellationToken ct) =>
        {
            var (f, t) = ReviewRange.Resolve(from, to, clock.Today);
            var bytes = Encoding.UTF8.GetBytes(await exports.BuildMarkdownAsync(f, t, ct));
            return download == false
                ? Results.Bytes(bytes, "text/markdown; charset=utf-8")
                : Results.File(bytes, "text/markdown; charset=utf-8", $"{ExportService.FileStem(f, t)}-review.md");
        });

        // Without from/to this exports everything ever logged (linked from Settings).
        export.MapGet("/data.csv", async (DateOnly? from, DateOnly? to, ExportService exports, LocalClock clock, CancellationToken ct) =>
        {
            (DateOnly?, DateOnly?) range = from is null && to is null ? (null, null) : ReviewRange.Resolve(from, to, clock.Today);
            var csv = await exports.BuildCsvAsync(range.Item1, range.Item2, ct);
            return Results.File(csv, "text/csv; charset=utf-8", $"{ExportService.FileStem(range.Item1, range.Item2)}-data.csv");
        });

        return app;
    }
}
