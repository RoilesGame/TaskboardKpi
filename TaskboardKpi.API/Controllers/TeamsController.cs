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
public class TeamsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAccessControl _access;

    public TeamsController(AppDbContext db, IAccessControl access)
    {
        _db = db;
        _access = access;
    }

    // GET api/teams/my
    [HttpGet("my")]
    public async Task<IActionResult> GetMyTeams()
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var teams = await _db.TeamMembers
            .Where(tm => tm.UserId == userId)
            .Include(tm => tm.Team)
                .ThenInclude(t => t.Project)
            .Select(tm => new
            {
                id = tm.Team.Id,
                name = tm.Team.Name,
                projectId = tm.Team.ProjectId,
                projectName = tm.Team.Project.Name,
                isOwner = tm.Role == "owner",
                role = tm.Role
            })
            .ToListAsync();

        return Ok(teams);
    }

    // GET api/teams/members
    [HttpGet("members")]
    public async Task<IActionResult> GetMembers()
    {
        var teamIdClaim = User.Claims.FirstOrDefault(c => c.Type == "teamId");
        if (teamIdClaim == null) return Unauthorized();
        var teamId = Guid.Parse(teamIdClaim.Value);

        var members = await _db.TeamMembers
            .Where(tm => tm.TeamId == teamId)
            .Include(tm => tm.User)
            .Select(tm => new
            {
                id = tm.User.Id,
                fullName = tm.User.FullName,
                avatarUrl = tm.User.AvatarUrl,
                role = tm.Role
            })
            .ToListAsync();

        return Ok(members);
    }

    // POST api/teams
    [HttpPost]
    public async Task<IActionResult> CreateTeam([FromBody] CreateTeamDto dto)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        // По умолчанию команда создаётся в первом проекте пользователя, либо создаём новый
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.OwnerId == userId);
        if (project == null)
        {
            project = new Project { Name = dto.ProjectName ?? "Новый проект", OwnerId = userId };
            _db.Projects.Add(project);
            await _db.SaveChangesAsync();
        }

        var team = new Team
        {
            ProjectId = project.Id,
            Name = dto.Name,
            Description = dto.Description,
            IsPublic = dto.IsPublic
        };
        _db.Teams.Add(team);
        await _db.SaveChangesAsync();

        _db.TeamMembers.Add(new TeamMember { TeamId = team.Id, UserId = userId, Role = "owner" });
        await _db.SaveChangesAsync();

        return Ok(new { id = team.Id, name = team.Name, projectId = project.Id });
    }

    // POST api/teams/{teamId}/join
    [HttpPost("{teamId:guid}/join")]
    public async Task<IActionResult> JoinTeam(Guid teamId)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var team = await _db.Teams.FindAsync(teamId);
        if (team == null) return NotFound("Команда не найдена");

        var alreadyMember = await _db.TeamMembers.AnyAsync(tm => tm.TeamId == teamId && tm.UserId == userId);
        if (alreadyMember) return BadRequest("Вы уже состоите в этой команде");

        _db.TeamMembers.Add(new TeamMember { TeamId = teamId, UserId = userId, Role = "executor" });
        await _db.SaveChangesAsync();

        return Ok(new { message = "Вы присоединились к команде" });
    }

    // DELETE api/teams/leave
    [HttpDelete("leave")]
    public async Task<IActionResult> LeaveTeam()
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        var teamIdClaim = User.Claims.FirstOrDefault(c => c.Type == "teamId");
        if (userIdClaim == null || teamIdClaim == null) return Unauthorized();

        var userId = Guid.Parse(userIdClaim.Value);
        var teamId = Guid.Parse(teamIdClaim.Value);

        var membership = await _db.TeamMembers.FirstOrDefaultAsync(tm => tm.TeamId == teamId && tm.UserId == userId);
        if (membership == null) return BadRequest("Вы не состоите в этой команде");
        if (membership.Role == "owner")
            return BadRequest("Владелец не может покинуть команду. Сначала передайте владение или удалите команду.");

        _db.TeamMembers.Remove(membership);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Вы покинули команду" });
    }

    // POST api/teams/invite-link
    [HttpPost("invite-link")]
    public async Task<IActionResult> GenerateInviteLink()
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        var teamIdClaim = User.Claims.FirstOrDefault(c => c.Type == "teamId");
        if (userIdClaim == null || teamIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);
        var teamId = Guid.Parse(teamIdClaim.Value);

        var membership = await _db.TeamMembers.FirstOrDefaultAsync(tm => tm.TeamId == teamId && tm.UserId == userId);
        if (membership == null || (membership.Role != "owner" && membership.Role != "editor"))
            return Forbid("Недостаточно прав для приглашения");

        var team = await _db.Teams.FindAsync(teamId);
        var request = HttpContext.Request;
        var baseUrl = $"{request.Scheme}://{request.Host}";
        var inviteLink = $"{baseUrl}/join?invite={team!.Id}";

        return Ok(new { inviteLink, teamId = team.Id });
    }

    // DELETE api/teams/members/{userId}
    [HttpDelete("members/{userId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid userId)
    {
        var currentUserIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        var teamIdClaim = User.Claims.FirstOrDefault(c => c.Type == "teamId");
        if (currentUserIdClaim == null || teamIdClaim == null) return Unauthorized();
        var currentUserId = Guid.Parse(currentUserIdClaim.Value);
        var teamId = Guid.Parse(teamIdClaim.Value);

        // Права на удаление: владелец команды, глобальный администратор или менеджер по персоналу
        var currentMembership = await _db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.TeamId == teamId && tm.UserId == currentUserId);
        bool isGlobalAdmin = await _access.IsGlobalAdmin(currentUserId);
        bool isHrManager = await _access.IsHrManager(currentUserId);
        bool canRemove = currentMembership?.Role == "owner" || isGlobalAdmin || isHrManager;

        if (!canRemove)
            return Forbid("Недостаточно прав для удаления участника");

        var targetMembership = await _db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.TeamId == teamId && tm.UserId == userId);
        if (targetMembership == null) return NotFound("Участник не найден");
        if (targetMembership.Role == "owner")
            return BadRequest("Нельзя удалить владельца команды");

        _db.TeamMembers.Remove(targetMembership);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Участник удалён" });
    }
}