namespace TaskboardKpi.API.Models;

public class TaskEvent : BaseEntity
{
    public Guid TaskId { get; set; }
    public TaskItem Task { get; set; } = null!;
    public Guid TeamId { get; set; }
    public Team Team { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public string EventType { get; set; } = string.Empty;
    public string? Description { get; set; }
}