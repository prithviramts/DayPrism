using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DayLog.Web.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUserSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "UserSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false),
                    DisplayName = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    TimeZoneId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Theme = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    SleepTargetHours = table.Column<double>(type: "REAL", nullable: false),
                    WaterTargetGlasses = table.Column<int>(type: "INTEGER", nullable: false),
                    MealsTarget = table.Column<int>(type: "INTEGER", nullable: false),
                    CaffeineLimitMg = table.Column<int>(type: "INTEGER", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserSettings", x => x.Id);
                    table.CheckConstraint("CK_UserSettings_Singleton", "\"Id\" = 1");
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserSettings");
        }
    }
}
