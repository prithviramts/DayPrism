using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DayLog.Web.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Activities",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    StartTime = table.Column<DateTime>(type: "TEXT", nullable: false),
                    EndTime = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Category = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsSeed = table.Column<bool>(type: "INTEGER", nullable: false),
                    UtcOffsetMinutes = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Activities", x => x.Id);
                    table.CheckConstraint("CK_Activities_EndAfterStart", "\"EndTime\" IS NULL OR \"EndTime\" > \"StartTime\"");
                });

            migrationBuilder.CreateTable(
                name: "CaffeineIntakes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Time = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Type = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Servings = table.Column<double>(type: "REAL", nullable: false),
                    CaffeineMg = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsSeed = table.Column<bool>(type: "INTEGER", nullable: false),
                    UtcOffsetMinutes = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CaffeineIntakes", x => x.Id);
                    table.CheckConstraint("CK_CaffeineIntakes_Servings", "\"Servings\" > 0");
                });

            migrationBuilder.CreateTable(
                name: "DailyReflections",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Date = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    WentWell = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    DidntGoWell = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    DoDifferently = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    DayRating = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsSeed = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyReflections", x => x.Id);
                    table.CheckConstraint("CK_DailyReflections_DayRating", "\"DayRating\" BETWEEN 1 AND 5");
                });

            migrationBuilder.CreateTable(
                name: "EnergyCheckIns",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Time = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Energy = table.Column<int>(type: "INTEGER", nullable: false),
                    Sleepiness = table.Column<int>(type: "INTEGER", nullable: false),
                    Mood = table.Column<int>(type: "INTEGER", nullable: false),
                    Note = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsSeed = table.Column<bool>(type: "INTEGER", nullable: false),
                    UtcOffsetMinutes = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EnergyCheckIns", x => x.Id);
                    table.CheckConstraint("CK_EnergyCheckIns_Energy", "\"Energy\" BETWEEN 1 AND 5");
                    table.CheckConstraint("CK_EnergyCheckIns_Mood", "\"Mood\" BETWEEN 1 AND 5");
                    table.CheckConstraint("CK_EnergyCheckIns_Sleepiness", "\"Sleepiness\" BETWEEN 1 AND 5");
                });

            migrationBuilder.CreateTable(
                name: "Meals",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Time = table.Column<DateTime>(type: "TEXT", nullable: false),
                    MealType = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    Size = table.Column<string>(type: "TEXT", maxLength: 32, nullable: true),
                    Skipped = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsSeed = table.Column<bool>(type: "INTEGER", nullable: false),
                    UtcOffsetMinutes = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Meals", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SleepLogs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    BedTime = table.Column<DateTime>(type: "TEXT", nullable: false),
                    WakeTime = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Quality = table.Column<int>(type: "INTEGER", nullable: false),
                    TimesWoken = table.Column<int>(type: "INTEGER", nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsSeed = table.Column<bool>(type: "INTEGER", nullable: false),
                    UtcOffsetMinutes = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SleepLogs", x => x.Id);
                    table.CheckConstraint("CK_SleepLogs_Quality", "\"Quality\" BETWEEN 1 AND 5");
                    table.CheckConstraint("CK_SleepLogs_TimesWoken", "\"TimesWoken\" >= 0");
                    table.CheckConstraint("CK_SleepLogs_WakeAfterBed", "\"WakeTime\" > \"BedTime\"");
                });

            migrationBuilder.CreateTable(
                name: "WaterIntakes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Time = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Glasses = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsSeed = table.Column<bool>(type: "INTEGER", nullable: false),
                    UtcOffsetMinutes = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WaterIntakes", x => x.Id);
                    table.CheckConstraint("CK_WaterIntakes_Glasses", "\"Glasses\" > 0");
                });

            migrationBuilder.CreateIndex(
                name: "IX_Activities_StartTime",
                table: "Activities",
                column: "StartTime");

            migrationBuilder.CreateIndex(
                name: "IX_CaffeineIntakes_Time",
                table: "CaffeineIntakes",
                column: "Time");

            migrationBuilder.CreateIndex(
                name: "IX_DailyReflections_Date",
                table: "DailyReflections",
                column: "Date",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EnergyCheckIns_Time",
                table: "EnergyCheckIns",
                column: "Time");

            migrationBuilder.CreateIndex(
                name: "IX_Meals_Time",
                table: "Meals",
                column: "Time");

            migrationBuilder.CreateIndex(
                name: "IX_SleepLogs_WakeTime",
                table: "SleepLogs",
                column: "WakeTime");

            migrationBuilder.CreateIndex(
                name: "IX_WaterIntakes_Time",
                table: "WaterIntakes",
                column: "Time");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Activities");

            migrationBuilder.DropTable(
                name: "CaffeineIntakes");

            migrationBuilder.DropTable(
                name: "DailyReflections");

            migrationBuilder.DropTable(
                name: "EnergyCheckIns");

            migrationBuilder.DropTable(
                name: "Meals");

            migrationBuilder.DropTable(
                name: "SleepLogs");

            migrationBuilder.DropTable(
                name: "WaterIntakes");
        }
    }
}
