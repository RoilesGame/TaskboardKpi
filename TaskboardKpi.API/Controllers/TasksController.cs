using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskboardKpi.API.Data;
using TaskboardKpi.API.Models;

namespace TaskboardKpi.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class TasksController : ControllerBase
{
    private readonly AppDbContext _db;
    public TasksController(AppDbContext db) => _db = db;

    // GET api/tasks/board – teamId из токена
    [HttpGet("board")]
    public async Task<IActionResult> GetBoard()
    {
        var teamIdClaim = User.Claims.FirstOrDefault(c => c.Type == "teamId");
        if (teamIdClaim == null) return Unauthorized();
        var teamId = Guid.Parse(teamIdClaim.Value);

        var tasks = await _db.Tasks
            .Where(t => t.TeamId == teamId)
            .OrderBy(t => t.Status)
            .ThenBy(t => t.Position)
            .ToListAsync();

        var board = new
        {
            Backlog = tasks.Where(t => t.Status == "backlog"),
            InProgress = tasks.Where(t => t.Status == "in_progress"),
            Review = tasks.Where(t => t.Status == "review"),
            Done = tasks.Where(t => t.Status == "done")
        };
        return Ok(board);
    }

    // PUT api/tasks/move/{taskId}
    [HttpPut("move/{taskId:guid}")]
    public async Task<IActionResult> MoveTask(Guid taskId, [FromBody] MoveTaskDto dto)
    {
        var task = await _db.Tasks.FindAsync(taskId);
        if (task == null) return NotFound();

        task.Status = dto.NewStatus;
        task.Position = dto.NewPosition;
        task.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(task);
    }

    // POST api/tasks
    [HttpPost]
    public async Task<IActionResult> CreateTask([FromBody] CreateTaskDto dto)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        var teamIdClaim = User.Claims.FirstOrDefault(c => c.Type == "teamId");
        if (userIdClaim == null || teamIdClaim == null) return Unauthorized();

        var userId = Guid.Parse(userIdClaim.Value);
        var teamId = Guid.Parse(teamIdClaim.Value);

        // Проверяем права: владелец команды или (участник и разрешено allowMemberEditing)
        var team = await _db.Teams.FindAsync(teamId);
        if (team == null) return NotFound("Команда не найдена");
        if (team.OwnerId != userId && !team.AllowMemberEditing)
            return Forbid("Недостаточно прав для создания задач");

        var task = new TaskItem
        {
            TeamId = teamId,
            Title = dto.Title,
            Description = dto.Description,
            Status = dto.Status ?? "backlog",
            Priority = dto.Priority ?? "medium",
            CreatedBy = userId,
            Position = await _db.Tasks.CountAsync(t => t.TeamId == teamId && t.Status == (dto.Status ?? "backlog"))
        };

        _db.Tasks.Add(task);
        await _db.SaveChangesAsync();

        return Ok(new { id = task.Id });
    }
}

// DTO
public class MoveTaskDto
{
    public string NewStatus { get; set; } = string.Empty;
    public int NewPosition { get; set; }
}

public class CreateTaskDto
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Status { get; set; }
    public string? Priority { get; set; }
}