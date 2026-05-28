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

    private async Task<bool> CanEditTask(Guid teamId, Guid userId)
    {
        var team = await _db.Teams.FindAsync(teamId);
        if (team == null) return false;
        return team.OwnerId == userId || team.AllowMemberEditing;
    }
    
    // GET api/tasks/gantt
    [HttpGet("gantt")]
    public async Task<IActionResult> GetGantt()
    {
        var teamIdClaim = User.Claims.FirstOrDefault(c => c.Type == "teamId");
        if (teamIdClaim == null) return Unauthorized();
        var teamId = Guid.Parse(teamIdClaim.Value);

        var tasks = await _db.Tasks
            .Where(t => t.TeamId == teamId)
            .Select(t => new
            {
                t.Id,
                t.Title,
                t.Status,
                t.Priority,
                t.DueDate,
                assigneeName = t.Assignee != null ? t.Assignee.FullName : "Не назначен"
            })
            .ToListAsync();

        return Ok(tasks);
    }
    
// GET api/tasks/my
    [HttpGet("my")]
    public async Task<IActionResult> GetMyTasks()
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        var teamIdClaim = User.Claims.FirstOrDefault(c => c.Type == "teamId");
        if (userIdClaim == null || teamIdClaim == null) return Unauthorized();

        var userId = Guid.Parse(userIdClaim.Value);
        var teamId = Guid.Parse(teamIdClaim.Value);

        var tasks = await _db.Tasks
            .Where(t => t.AssigneeId == userId && t.TeamId == teamId && t.DueDate != null)
            .OrderBy(t => t.DueDate)
            .Select(t => new
            {
                t.Id,
                t.Title,
                t.DueDate,
                t.Status,
                t.Priority
            })
            .ToListAsync();

        return Ok(tasks);
    }

    // GET api/tasks/board
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
            .Select(t => new
            {
                t.Id,
                t.Title,
                t.Description,
                t.Status,
                t.Priority,
                t.DueDate,
                t.Position,
                t.AssigneeId,
                AssigneeName = t.Assignee != null ? t.Assignee.FullName : null
            })
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
            DueDate = dto.DueDate,
            CreatedBy = userId,
            Position = await _db.Tasks.CountAsync(t => t.TeamId == teamId && t.Status == (dto.Status ?? "backlog"))
        };
        _db.Tasks.Add(task);
        await _db.SaveChangesAsync();

        return Ok(new { id = task.Id });
    }

    // GET api/tasks/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetTask(Guid id)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var task = await _db.Tasks
            .Include(t => t.Assignee)
            .FirstOrDefaultAsync(t => t.Id == id);
        if (task == null) return NotFound();

        var isMember = await _db.TeamMembers.AnyAsync(tm => tm.TeamId == task.TeamId && tm.UserId == userId);
        if (!isMember) return Forbid("Вы не участник этой команды");

        var canEdit = await CanEditTask(task.TeamId, userId);

        return Ok(new
        {
            task.Id,
            task.Title,
            task.Description,
            task.Status,
            task.Priority,
            task.DueDate,
            task.TeamId,
            task.CreatedBy,
            task.AssigneeId,
            assigneeName = task.Assignee?.FullName,
            canEdit
        });
    }

    // PUT api/tasks/{id}
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateTask(Guid id, [FromBody] UpdateTaskDto dto)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var task = await _db.Tasks.FindAsync(id);
        if (task == null) return NotFound();

        if (!await CanEditTask(task.TeamId, userId))
            return Forbid("Недостаточно прав для редактирования");

        if (dto.Title != null) task.Title = dto.Title;
        if (dto.Description != null) task.Description = dto.Description;
        if (dto.Status != null) task.Status = dto.Status;
        if (dto.Priority != null) task.Priority = dto.Priority;
        if (dto.DueDate != null) task.DueDate = dto.DueDate;

        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Задача обновлена" });
    }

    // PUT api/tasks/{id}/assign
    [HttpPut("{id:guid}/assign")]
    public async Task<IActionResult> AssignTask(Guid id, [FromBody] AssignTaskDto dto)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var task = await _db.Tasks.FindAsync(id);
        if (task == null) return NotFound();

        if (!await CanEditTask(task.TeamId, userId))
            return Forbid("Недостаточно прав для назначения");

        var isMember = await _db.TeamMembers.AnyAsync(tm => tm.TeamId == task.TeamId && tm.UserId == dto.AssigneeId);
        if (!isMember) return BadRequest("Пользователь не в команде");

        task.AssigneeId = dto.AssigneeId;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Назначено" });
    }

    // DELETE api/tasks/{id}/assign
    [HttpDelete("{id:guid}/assign")]
    public async Task<IActionResult> UnassignTask(Guid id)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var task = await _db.Tasks.FindAsync(id);
        if (task == null) return NotFound();

        if (!await CanEditTask(task.TeamId, userId))
            return Forbid("Недостаточно прав");

        task.AssigneeId = null;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Назначение снято" });
    }

    // POST api/tasks/{id}/self-assign
    [HttpPost("{id:guid}/self-assign")]
    public async Task<IActionResult> SelfAssign(Guid id)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var task = await _db.Tasks.FindAsync(id);
        if (task == null) return NotFound();

        var isMember = await _db.TeamMembers.AnyAsync(tm => tm.TeamId == task.TeamId && tm.UserId == userId);
        if (!isMember) return Forbid("Вы не участник команды");

        task.AssigneeId = userId;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Задача взята на себя" });
    }

    // DELETE api/tasks/{id}/self-assign
    [HttpDelete("{id:guid}/self-assign")]
    public async Task<IActionResult> SelfUnassign(Guid id)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var task = await _db.Tasks.FindAsync(id);
        if (task == null) return NotFound();

        if (task.AssigneeId != userId)
            return Forbid("Задача не назначена на вас");

        task.AssigneeId = null;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Назначение снято" });
    }
}

// DTOs
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
    public DateOnly? DueDate { get; set; }
}

public class UpdateTaskDto
{
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string? Status { get; set; }
    public string? Priority { get; set; }
    public DateOnly? DueDate { get; set; }
}

public class AssignTaskDto
{
    public Guid AssigneeId { get; set; }
}