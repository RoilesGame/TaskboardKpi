using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskboardKpi.API.Data;

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
}

public class MoveTaskDto
{
    public string NewStatus { get; set; } = string.Empty;
    public int NewPosition { get; set; }
}