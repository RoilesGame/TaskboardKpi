namespace TaskboardKpi.API.Models;

public class TaskFile
{
    public Guid Id { get; set; }
    public Guid TaskId { get; set; }
    public TaskItem Task { get; set; } = null!;
    public string FileName { get; set; } = string.Empty;
    public string StoredName { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public long? FileSize { get; set; }
    public Guid UploadedBy { get; set; }
    public User Uploader { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}