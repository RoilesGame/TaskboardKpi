using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskboardKpi.API.Data;
using TaskboardKpi.API.Services;
using TaskboardKpi.API.Models;

namespace TaskboardKpi.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class HrController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAccessControl _access;

    public HrController(AppDbContext db, IAccessControl access)
    {
        _db = db;
        _access = access;
    }

    private async Task<bool> CanManagePersonnel()
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return false;
        var userId = Guid.Parse(userIdClaim.Value);
        return await _access.IsHrManager(userId) || await _access.IsGlobalAdmin(userId);
    }

    // GET api/hr/users
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        if (!await CanManagePersonnel()) return Forbid();

        var users = await _db.Users
            .OrderBy(u => u.FullName)
            .Select(u => new
            {
                u.Id,
                u.FullName,
                u.Email,
                u.Role,
                TotalTasks = _db.Tasks.Count(t => t.AssigneeId == u.Id),
                BacklogTasks = _db.Tasks.Count(t => t.AssigneeId == u.Id && t.Status == "backlog"),
                InProgressTasks = _db.Tasks.Count(t => t.AssigneeId == u.Id && t.Status == "in_progress"),
                ReviewTasks = _db.Tasks.Count(t => t.AssigneeId == u.Id && t.Status == "review"),
                DoneTasks = _db.Tasks.Count(t => t.AssigneeId == u.Id && t.Status == "done")
            })
            .ToListAsync();

        return Ok(users);
    }

    // POST api/hr/users/{userId}/role
    [HttpPost("users/{userId:guid}/role")]
    public async Task<IActionResult> ChangeRole(Guid userId, [FromBody] ChangeRoleDto dto)
    {
        if (!await CanManagePersonnel()) return Forbid();

        var membership = await _db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.TeamId == dto.TeamId && tm.UserId == userId);
        if (membership == null) return NotFound("Пользователь не состоит в этой команде");

        // Нельзя изменить роль владельца команды
        if (membership.Role == "owner")
            return BadRequest("Нельзя изменить роль владельца команды");

        membership.Role = dto.NewRole;
        await _db.SaveChangesAsync();

        return Ok(new { message = $"Роль изменена на {dto.NewRole}" });
    }

    // POST api/hr/users/{userId}/add-to-team
    [HttpPost("users/{userId:guid}/add-to-team")]
    public async Task<IActionResult> AddToTeam(Guid userId, [FromBody] AddToTeamDto dto)
    {
        if (!await CanManagePersonnel()) return Forbid();

        var team = await _db.Teams.FindAsync(dto.TeamId);
        if (team == null) return NotFound("Команда не найдена");

        var user = await _db.Users.FindAsync(userId);
        if (user == null) return NotFound("Пользователь не найден");

        var alreadyMember = await _db.TeamMembers.AnyAsync(tm => tm.TeamId == dto.TeamId && tm.UserId == userId);
        if (alreadyMember) return BadRequest("Пользователь уже состоит в этой команде");

        _db.TeamMembers.Add(new TeamMember
        {
            TeamId = dto.TeamId,
            UserId = userId,
            Role = dto.Role ?? "executor"
        });
        await _db.SaveChangesAsync();

        return Ok(new { message = "Пользователь добавлен в команду" });
    }

    // DELETE api/hr/users/{userId}/remove-from-team/{teamId}
    [HttpDelete("users/{userId:guid}/remove-from-team/{teamId:guid}")]
    public async Task<IActionResult> RemoveFromTeam(Guid userId, Guid teamId)
    {
        if (!await CanManagePersonnel()) return Forbid();

        var membership = await _db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.TeamId == teamId && tm.UserId == userId);
        if (membership == null) return NotFound("Пользователь не состоит в этой команде");

        if (membership.Role == "owner")
            return BadRequest("Нельзя удалить владельца команды");

        _db.TeamMembers.Remove(membership);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Пользователь удалён из команды" });
    }

    // GET api/hr/teams
    [HttpGet("teams")]
    public async Task<IActionResult> GetTeams()
    {
        if (!await CanManagePersonnel()) return Forbid();

        var teams = await _db.Teams
            .Include(t => t.Project)
            .OrderBy(t => t.Name)
            .Select(t => new
            {
                t.Id,
                t.Name,
                ProjectName = t.Project.Name
            })
            .ToListAsync();

        return Ok(teams);
    }
}

// DTOs
public class ChangeRoleDto
{
    public Guid TeamId { get; set; }
    public string NewRole { get; set; } = "executor";
}

public class AddToTeamDto
{
    public Guid TeamId { get; set; }
    public string? Role { get; set; } = "executor";
}