using System.Text.Json.Serialization;
using DayLog.Web.Api;
using DayLog.Web.Data;
using DayLog.Web.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---- Configuration & time ----
builder.Services.Configure<DayLogOptions>(builder.Configuration.GetSection(DayLogOptions.SectionName));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<SettingsStore>();
builder.Services.AddSingleton<LocalClock>();

// ---- Database ----
// The connection string comes from config, so a deployment can point elsewhere via the
// ConnectionStrings__DayLog environment variable without code changes.
var connectionString = DatabaseSetup.ResolveSqliteConnectionString(
    builder.Configuration.GetConnectionString("DayLog") ?? "Data Source=App_Data/daylog.db",
    builder.Environment.ContentRootPath);
builder.Services.AddDbContext<DayLogDbContext>(options => options.UseSqlite(connectionString));

// ---- App services ----
builder.Services.AddScoped<SeedService>();
builder.Services.AddScoped<BackupService>();
builder.Services.AddScoped<DayService>();
builder.Services.AddScoped<EntryService>();
builder.Services.AddScoped<CalendarService>();
builder.Services.AddScoped<InsightsService>();
builder.Services.AddScoped<ReviewService>();
builder.Services.AddScoped<ExportService>();
builder.Services.AddScoped<SettingsService>();

// Enums travel as names ("DeepWork") in JSON, both in the API and in data embedded in pages.
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddRazorPages()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

await app.InitialiseDatabaseAsync();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseRouting();

// No auth in v1. When login is added, AddAuthentication/AddAuthorization go above and this
// middleware already sits in the right place in the pipeline.
app.UseAuthorization();

app.MapStaticAssets();
app.MapRazorPages().WithStaticAssets();
app.MapBackupEndpoints();
app.MapEntryEndpoints();
app.MapExportEndpoints();

app.Run();
