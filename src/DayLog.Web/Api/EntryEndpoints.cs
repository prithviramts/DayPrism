using DayLog.Web.Domain;
using DayLog.Web.Services;

namespace DayLog.Web.Api;

/// <summary>
/// Small JSON endpoints behind the Today page's quick-add buttons.
///
/// About CSRF: these endpoints only accept JSON bodies (anything else gets a 415), and DELETE
/// can't be sent cross-site without a CORS preflight, which we don't allow. So another website
/// can't trigger them from your browser. The Razor Page forms (Settings) use anti-forgery tokens instead.
/// </summary>
public static class EntryEndpoints
{
    public static IEndpointRouteBuilder MapEntryEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api");

        // Turn validation failures from EntryService into a standard 400 ValidationProblem
        // response: { "errors": { "energy": ["Energy must be between 1 and 5."] } }.
        api.AddEndpointFilter(async (context, next) =>
        {
            try { return await next(context); }
            catch (EntryValidationException ex) { return Results.ValidationProblem(ex.Errors); }
        });

        api.MapPost("/checkins", async (CheckInRequest r, EntryService s, CancellationToken ct) =>
            Created(await s.AddCheckInAsync(r, ct)));

        api.MapPost("/meals", async (MealRequest r, EntryService s, CancellationToken ct) =>
            Created(await s.AddMealAsync(r, ct)));

        api.MapPost("/caffeine", async (CaffeineRequest r, EntryService s, CancellationToken ct) =>
            Created(await s.AddCaffeineAsync(r, ct)));

        api.MapPost("/water", async (WaterRequest r, EntryService s, CancellationToken ct) =>
            Created(await s.AddWaterAsync(r, ct)));

        api.MapPost("/activities", async (ActivityRequest r, EntryService s, CancellationToken ct) =>
            Created(await s.StartActivityAsync(r, ct)));

        api.MapPost("/activities/{id:int}/stop", async (int id, StopActivityRequest r, EntryService s, CancellationToken ct) =>
            await s.StopActivityAsync(id, r, ct) is { } a ? Results.Ok(new { a.Id }) : Results.NotFound());

        // ---- Edits (History page): PUT replaces the entry's fields. 404 if it was deleted meanwhile.
        api.MapPut("/checkins/{id:int}", async (int id, CheckInRequest r, EntryService s, CancellationToken ct) =>
            OkOrNotFound(await s.UpdateCheckInAsync(id, r, ct)));

        api.MapPut("/meals/{id:int}", async (int id, MealRequest r, EntryService s, CancellationToken ct) =>
            OkOrNotFound(await s.UpdateMealAsync(id, r, ct)));

        api.MapPut("/caffeine/{id:int}", async (int id, CaffeineRequest r, EntryService s, CancellationToken ct) =>
            OkOrNotFound(await s.UpdateCaffeineAsync(id, r, ct)));

        api.MapPut("/water/{id:int}", async (int id, WaterRequest r, EntryService s, CancellationToken ct) =>
            OkOrNotFound(await s.UpdateWaterAsync(id, r, ct)));

        api.MapPut("/activities/{id:int}", async (int id, ActivityRequest r, EntryService s, CancellationToken ct) =>
            OkOrNotFound(await s.UpdateActivityAsync(id, r, ct)));

        // PUT without an id: these replace "the sleep for this morning" / "the reflection for this date".
        api.MapPut("/sleep", async (SleepRequest r, EntryService s, CancellationToken ct) =>
            Results.Ok(new { (await s.UpsertSleepAsync(r, ct)).Id }));

        api.MapPut("/reflections", async (ReflectionRequest r, EntryService s, CancellationToken ct) =>
            Results.Ok(new { (await s.UpsertReflectionAsync(r, ct)).Id }));

        api.MapDelete("/entries/{kind}/{id:int}", async (string kind, int id, EntryService s, CancellationToken ct) =>
        {
            if (!Enum.TryParse<EntryKind>(kind, ignoreCase: true, out var entryKind)) return Results.NotFound();
            return await s.DeleteAsync(entryKind, id, ct) ? Results.NoContent() : Results.NotFound();
        });

        return app;
    }

    private static IResult Created(EntityBase entry) => Results.Ok(new { entry.Id });

    private static IResult OkOrNotFound(EntityBase? entry) => entry is null ? Results.NotFound() : Results.Ok(new { entry.Id });
}
