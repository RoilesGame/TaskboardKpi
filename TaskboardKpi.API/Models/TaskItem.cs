namespace TaskboardKpi.API.Models;

public class TaskItem
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Company Company { get; set; } = null!;
    public Guid? TeamId { get; set; }
    public Team? Team { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Status { get; set; } = "backlog";
    public string Priority { get; set; } = "medium";
    public Guid? AssigneeId { get; set; }
    public User? Assignee { get; set; }
    public Guid CreatedBy { get; set; }
    public User CreatedByUser { get; set; } = null!;
    public DateOnly? DueDate { get; set; }
    public int Position { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}