using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace DayLog.Tests;

/// <summary>
/// Runs the real app in memory (WebApplicationFactory) against a throwaway SQLite file,
/// and talks to it over HTTP, exactly like the Today page's JavaScript does.
/// </summary>
public sealed class ApiTests : IClassFixture<ApiTests.AppFactory>
{
    private readonly HttpClient _client;

    public ApiTests(AppFactory factory) => _client = factory.CreateClient();

    public sealed class AppFactory : WebApplicationFactory<Program>
    {
        private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"daylog-test-{Guid.NewGuid():N}.db");

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseSetting("ConnectionStrings:DayLog", $"Data Source={_dbPath};Pooling=False");
            builder.UseSetting("DayLog:SeedNewDatabase", "false");
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            File.Delete(_dbPath);
        }
    }

    [Fact]
    public async Task Invalid_check_in_returns_validation_problem()
    {
        var response = await _client.PostAsJsonAsync("/api/checkins",
            new { time = "2026-10-01T09:00:00", energy = 9, sleepiness = 2, mood = 3 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("errors").TryGetProperty("energy", out _));
    }

    [Fact]
    public async Task Meal_with_enum_names_is_saved_and_shown_on_today_page()
    {
        // Enum values are sent as names, exactly like the browser does.
        var response = await _client.PostAsJsonAsync("/api/meals", new
        {
            time = $"{TodayInDubai():yyyy-MM-dd}T12:34:00",
            mealType = "Lunch",
            description = "Test falafel wrap",
            size = "Heavy",
            skipped = false,
        });
        response.EnsureSuccessStatusCode();

        var html = await _client.GetStringAsync("/?handler=Content");
        Assert.Contains("Test falafel wrap", html);
    }

    [Fact]
    public async Task Put_updates_an_entry_and_404s_for_unknown_id()
    {
        var created = await _client.PostAsJsonAsync("/api/water", new { time = "2026-09-20T10:00:00", glasses = 1 });
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var update = await _client.PutAsJsonAsync($"/api/water/{id}", new { time = "2026-09-20T11:00:00", glasses = 3 });
        var missing = await _client.PutAsJsonAsync("/api/water/999999", new { time = "2026-09-20T11:00:00", glasses = 3 });

        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Contains("3 glasses", await _client.GetStringAsync("/History?date=2026-09-20"));
    }

    [Fact]
    public async Task History_page_renders_calendar_and_ignores_future_dates()
    {
        var html = await _client.GetStringAsync($"/History?date={TodayInDubai().AddDays(5):yyyy-MM-dd}");

        Assert.Contains("cal-grid", html);
        Assert.Contains(TodayInDubai().ToString("dddd d MMMM"), html); // fell back to today
    }

    [Fact]
    public async Task Export_downloads_have_the_right_types_and_names()
    {
        var zip = await _client.GetAsync("/export/review.zip?from=2026-09-01&to=2026-09-30");
        var csv = await _client.GetAsync("/export/data.csv");
        var inlineMd = await _client.GetAsync("/export/review.md?from=2026-09-01&to=2026-09-30&download=false");

        Assert.Equal("application/zip", zip.Content.Headers.ContentType!.MediaType);
        Assert.Equal("daywise-2026-09-01_to_2026-09-30-review.zip", zip.Content.Headers.ContentDisposition!.FileName);
        Assert.Equal("daywise-all-data-data.csv", csv.Content.Headers.ContentDisposition!.FileName);
        Assert.Null(inlineMd.Content.Headers.ContentDisposition); // shown, not downloaded (Copy summary)
        Assert.StartsWith("# Daywise review", await inlineMd.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Review_page_renders()
    {
        var html = await _client.GetStringAsync("/Review");

        Assert.Contains("Export for review", html);
        Assert.Contains("Streaks", html);
    }

    [Fact]
    public async Task Manifest_is_valid_and_every_icon_exists_at_its_stated_size()
    {
        var manifest = await _client.GetFromJsonAsync<JsonElement>("/manifest.json");

        Assert.Equal("Daywise", manifest.GetProperty("name").GetString());
        Assert.Equal("standalone", manifest.GetProperty("display").GetString());
        Assert.Equal("/", manifest.GetProperty("start_url").GetString());
        var icons = manifest.GetProperty("icons").EnumerateArray().ToList();
        Assert.Contains(icons, i => i.GetProperty("purpose").GetString() == "maskable");
        Assert.Contains(icons, i => i.GetProperty("sizes").GetString() == "512x512");

        foreach (var icon in icons)
        {
            var bytes = await _client.GetByteArrayAsync(icon.GetProperty("src").GetString());
            // PNG signature, then width/height as big-endian ints at bytes 16–23 of the IHDR chunk.
            Assert.Equal([0x89, 0x50, 0x4E, 0x47], bytes[..4]);
            var width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
            var height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
            Assert.Equal(icon.GetProperty("sizes").GetString(), $"{width}x{height}");
        }

        Assert.Equal(4, manifest.GetProperty("shortcuts").GetArrayLength());
    }

    [Fact]
    public async Task Service_worker_and_offline_page_are_served_from_the_root()
    {
        // A service worker only controls pages at or below its own path, so it must live at "/".
        var sw = await _client.GetAsync("/sw.js");
        var offline = await _client.GetStringAsync("/offline.html");

        Assert.Equal(HttpStatusCode.OK, sw.StatusCode);
        Assert.Contains("javascript", sw.Content.Headers.ContentType!.MediaType);
        Assert.Contains("You're offline", offline);
    }

    [Fact]
    public async Task Every_page_links_the_manifest_and_registers_the_service_worker()
    {
        foreach (var path in new[] { "/", "/History", "/Insights", "/Review", "/Settings" })
        {
            var html = await _client.GetStringAsync(path);
            Assert.Contains("rel=\"manifest\" href=\"/manifest.json\"", html);
            Assert.Contains("apple-touch-icon", html);
            Assert.Matches(@"/js/pwa(\.[a-z0-9]+)?\.js", html);
        }
    }

    [Fact]
    public async Task Settings_page_has_preferences_data_and_danger_zone()
    {
        var html = await _client.GetStringAsync("/Settings");

        Assert.Contains("Save settings", html);
        Assert.Contains("Asia/Dubai (UTC", html); // "+04:00" follows, HTML-encoded as &#x2B;
        Assert.Contains("Delete all entries", html);
        Assert.Contains("Download backup", html);
        Assert.Contains("data-theme=\"light\"", html); // default theme "System" renders light until the script checks the phone
    }

    [Fact]
    public async Task Delete_all_without_typing_DELETE_deletes_nothing()
    {
        // Get the form's anti-forgery token and cookie, as a browser would.
        var page = await _client.GetStringAsync("/Settings");
        var token = System.Text.RegularExpressions.Regex.Match(page, "name=\"__RequestVerificationToken\" type=\"hidden\" value=\"([^\"]+)\"").Groups[1].Value;
        await _client.PostAsJsonAsync("/api/water", new { time = "2026-09-21T10:00:00", glasses = 1 });

        var response = await _client.PostAsync("/Settings?handler=DeleteAll", new FormUrlEncodedContent(
            [new("__RequestVerificationToken", token), new("ConfirmDelete", "delete")]));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode); // form shown again with an error, not a redirect
        Assert.Contains("Type DELETE in capitals", await response.Content.ReadAsStringAsync());
        Assert.Contains("glass", await _client.GetStringAsync("/History?date=2026-09-21"));
    }

    [Fact]
    public async Task Non_json_post_is_rejected()
    {
        // A plain HTML form post from another site would look like this; it must not be accepted.
        var response = await _client.PostAsync("/api/water", new FormUrlEncodedContent([new("glasses", "1")]));

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
    }

    [Fact]
    public async Task Delete_unknown_kind_is_404()
    {
        var response = await _client.DeleteAsync("/api/entries/banana/1");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static DateOnly TodayInDubai() =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Asia/Dubai")).DateTime);
}
