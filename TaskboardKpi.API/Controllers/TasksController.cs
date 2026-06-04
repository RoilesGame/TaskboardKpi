using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskboardKpi.API.Data;
using TaskboardKpi.API.Models;
using TaskboardKpi.API.Services;
using TaskboardKpi.API.DTOs;

namespace TaskboardKpi.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class TasksController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAccessControl _access;

    public TasksController(AppDbContext db, IAccessControl access)
    {
        _db = db;
        _access = access;
    }

    private async Task LogEvent(Guid taskId, Guid teamId, Guid userId, string type, string? description = null)
    {
        var ev = new TaskEvent
        {
            TaskId = taskId,
            TeamId = teamId,
            UserId = userId,
            EventType = type,
            Description = description
        };
        _db.TaskEvents.Add(ev);
        await _db.SaveChangesAsync();
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
                t.StartDate,
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
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var task = await _db.Tasks.FindAsync(taskId);
        if (task == null) return NotFound();

        if (!await _access.CanAct(task.TeamId, userId))
            return Forbid("Недостаточно прав для перемещения задачи");

        task.Status = dto.NewStatus;
        task.Position = dto.NewPosition;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await LogEvent(task.Id, task.TeamId, userId, "moved", $"Перемещена в {dto.NewStatus}");
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

        // Проверка прав через сервис
        if (!await _access.CanEditTask(teamId, userId))
            return Forbid("Недостаточно прав для создания задач");

        if (dto.StartDate.HasValue && dto.DueDate.HasValue && dto.DueDate.Value < dto.StartDate.Value)
            return BadRequest("Дата окончания не может быть раньше даты начала");

        var task = new TaskItem
        {
            TeamId = teamId,
            Title = dto.Title,
            Description = dto.Description,
            Status = dto.Status ?? "backlog",
            Priority = dto.Priority ?? "medium",
            DueDate = dto.DueDate,
            StartDate = dto.StartDate,
            CreatedBy = userId,
            Position = await _db.Tasks.CountAsync(t => t.TeamId == teamId && t.Status == (dto.Status ?? "backlog"))
        };

        _db.Tasks.Add(task);
        await _db.SaveChangesAsync();

        await LogEvent(task.Id, teamId, userId, "created", "Задача создана");
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

        var member = await _db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.TeamId == task.TeamId && tm.UserId == userId);
        if (member == null)
            return Forbid("Вы не участник этой команды");

        var canEdit = await _access.CanEditTask(task.TeamId, userId);

        return Ok(new
        {
            task.Id,
            task.Title,
            task.Description,
            task.Status,
            task.Priority,
            task.DueDate,
            task.StartDate,
            task.TeamId,
            task.CreatedBy,
            task.AssigneeId,
            assigneeName = task.Assignee?.FullName,
            canEdit,
            userRole = member.Role
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

        if (!await _access.CanEditTask(task.TeamId, userId))
            return Forbid("Недостаточно прав для редактирования");

        DateOnly? newStart = dto.StartDate ?? task.StartDate;
        DateOnly? newDue = dto.DueDate ?? task.DueDate;
        if (newStart.HasValue && newDue.HasValue && newDue.Value < newStart.Value)
            return BadRequest("Дата окончания не может быть раньше даты начала");

        if (dto.Title != null) task.Title = dto.Title;
        if (dto.Description != null) task.Description = dto.Description;
        if (dto.Status != null) task.Status = dto.Status;
        if (dto.Priority != null) task.Priority = dto.Priority;
        if (dto.DueDate != null) task.DueDate = dto.DueDate;
        if (dto.StartDate != null) task.StartDate = dto.StartDate;

        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await LogEvent(task.Id, task.TeamId, userId, "updated", "Задача обновлена");
        return Ok(new { message = "Задача обновлена" });
    }

    // DELETE api/tasks/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteTask(Guid id)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var task = await _db.Tasks.FindAsync(id);
        if (task == null) return NotFound();

        var member = await _db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.TeamId == task.TeamId && tm.UserId == userId);
        if (member == null || member.Role != "owner")
            return Forbid("Недостаточно прав для удаления задачи");

        _db.Tasks.Remove(task);
        await _db.SaveChangesAsync();

        await LogEvent(task.Id, task.TeamId, userId, "deleted", "Задача удалена");
        return Ok(new { message = "Задача удалена" });
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

        if (!await _access.CanEditTask(task.TeamId, userId))
            return Forbid("Недостаточно прав для назначения");

        var isMember = await _db.TeamMembers.AnyAsync(tm => tm.TeamId == task.TeamId && tm.UserId == dto.AssigneeId);
        if (!isMember) return BadRequest("Пользователь не в команде");

        var assignee = await _db.Users.FindAsync(dto.AssigneeId);
        string desc = assignee != null ? $"Назначен исполнитель: {assignee.FullName}" : "Назначен новый исполнитель";

        task.AssigneeId = dto.AssigneeId;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await LogEvent(task.Id, task.TeamId, userId, "assigned", desc);
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

        if (!await _access.CanEditTask(task.TeamId, userId))
            return Forbid("Недостаточно прав");

        task.AssigneeId = null;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await LogEvent(task.Id, task.TeamId, userId, "unassigned", "Исполнитель снят");
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

        if (!await _access.CanAct(task.TeamId, userId))
            return Forbid("Недостаточно прав");

        task.AssigneeId = userId;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await LogEvent(task.Id, task.TeamId, userId, "self_assigned", "Взял задачу на себя");
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

        await LogEvent(task.Id, task.TeamId, userId, "self_unassigned", "Снял с себя задачу");
        return Ok(new { message = "Назначение снято" });
    }

    // GET api/tasks/events
    [HttpGet("events")]
    public async Task<IActionResult> GetEvents(int limit = 50)
    {
        var teamIdClaim = User.Claims.FirstOrDefault(c => c.Type == "teamId");
        if (teamIdClaim == null) return Unauthorized();
        var teamId = Guid.Parse(teamIdClaim.Value);

        var events = await _db.TaskEvents
            .Where(e => e.TeamId == teamId)
            .OrderByDescending(e => e.CreatedAt)
            .Take(limit)
            .Select(e => new
            {
                e.Id,
                e.TaskId,
                TaskTitle = e.Task.Title,
                e.EventType,
                e.Description,
                e.CreatedAt,
                UserName = e.User.FullName
            })
            .ToListAsync();

        return Ok(events);
    }

    // GET api/tasks/my (для календаря)
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

    // GET api/tasks/gantt
    [HttpGet("gantt")]
    public async Task<IActionResult> GetGantt()
    {
        var teamIdClaim = User.Claims.FirstOrDefault(c => c.Type == "teamId");
        if (teamIdClaim == null) return Unauthorized();
        var teamId = Guid.Parse(teamIdClaim.Value);

        var tasks = await _db.Tasks
            .Where(t => t.TeamId == teamId && t.DueDate != null)
            .OrderBy(t => t.StartDate ?? t.DueDate)
            .Select(t => new
            {
                t.Id,
                t.Title,
                t.Status,
                t.Priority,
                t.DueDate,
                StartDate = t.StartDate ?? t.DueDate.Value.AddDays(-5),
                AssigneeName = t.Assignee != null ? t.Assignee.FullName : "Не назначен"
            })
            .ToListAsync();

        return Ok(tasks);
    }
}