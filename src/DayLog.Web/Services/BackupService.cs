using DayLog.Web.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace DayLog.Web.Services;

/// <summary>
/// Produces a consistent copy of the SQLite database for download.
///
/// Copying daylog.db with File.Copy while the app is running risks a half-written or locked file.
/// SQLite's online backup API copies a consistent snapshot even while the app is reading and writing.
/// </summary>
public sealed class BackupService(DayLogDbContext db, LocalClock clock)
{
    public async Task<(byte[] Content, string FileName)> CreateBackupAsync(CancellationToken ct = default)
    {
        var tempPath = Path.Combine(Path.GetTempPath(), $"daylog-backup-{Guid.NewGuid():N}.db");
        try
        {
            await using (var source = new SqliteConnection(db.Database.GetConnectionString()))
            // Pooling=False so the temp file's handle is really closed and the file can be deleted below.
            await using (var target = new SqliteConnection($"Data Source={tempPath};Pooling=False"))
            {
                await source.OpenAsync(ct);
                await target.OpenAsync(ct);
                source.BackupDatabase(target);
            }

            var bytes = await File.ReadAllBytesAsync(tempPath, ct);
            return (bytes, $"daywise-backup-{clock.Now:yyyy-MM-dd-HHmm}.db");
        }
        finally
        {
            File.Delete(tempPath);
        }
    }
}
