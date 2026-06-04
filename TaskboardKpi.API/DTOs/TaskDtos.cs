namespace TaskboardKpi.API.DTOs;

public class CreateTaskDto
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Status { get; set; }
    public string? Priority { get; set; }
    public DateOnly? DueDate { get; set; }
    public DateOnly? StartDate { get; set; }
}

public class UpdateTaskDto
{
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string? Status { get; set; }
    public string? Priority { get; set; }
    public DateOnly? DueDate { get; set; }
    public DateOnly? StartDate { get; set; }
}

public class MoveTaskDto
{
    public string NewStatus { get; set; } = string.Empty;
    public int NewPosition { get; set; }
}

public class AssignTaskDto
{
    public Guid AssigneeId { get; set; }
}