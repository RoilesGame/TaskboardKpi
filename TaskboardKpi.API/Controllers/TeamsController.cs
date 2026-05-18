using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskboardKpi.API.Data;
using System.Security.Claims;
using TaskboardKpi.API.Models;

namespace TaskboardKpi.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class TeamsController : ControllerBase
{
    private readonly AppDbContext _db;
    public TeamsController(AppDbContext db) => _db = db;
    
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

        _db.TeamMembers.Add(new TeamMember { TeamId = teamId, UserId = userId });
        await _db.SaveChangesAsync();

        return Ok(new { message = "Вы присоединились к команде", teamId = team.Id });
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

        var team = await _db.Teams.FindAsync(teamId);
        if (team == null) return NotFound("Команда не найдена");

        // Владелец не может покинуть команду
        if (team.OwnerId == userId)
            return BadRequest("Владелец не может покинуть команду. Сначала передайте владение или удалите команду.");

        var membership = await _db.TeamMembers.FirstOrDefaultAsync(tm => tm.TeamId == teamId && tm.UserId == userId);
        if (membership == null) return BadRequest("Вы не состоите в этой команде");

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

        var team = await _db.Teams.FindAsync(teamId);
        if (team == null) return NotFound();

        // Проверяем права: владелец или (участник и allow_member_invites)
        bool canInvite = team.OwnerId == userId || team.AllowMemberInvites;
        if (!canInvite) return Forbid("Недостаточно прав для приглашения");

        // Генерируем токен, если его нет
        if (team.InviteToken == null)
        {
            team.InviteToken = Guid.NewGuid();
            await _db.SaveChangesAsync();
        }

        var request = HttpContext.Request;
        var baseUrl = $"{request.Scheme}://{request.Host}";
        var inviteLink = $"{baseUrl}/join?invite={team.InviteToken}";

        return Ok(new { inviteLink, teamId = team.Id });
    }
    
    // POST api/teams/join-by-invite/{token}
    [HttpPost("join-by-invite/{token:guid}")]
    public async Task<IActionResult> JoinByInvite(Guid token)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var team = await _db.Teams.FirstOrDefaultAsync(t => t.InviteToken == token);
        if (team == null) return NotFound("Неверная пригласительная ссылка");

        var alreadyMember = await _db.TeamMembers.AnyAsync(tm => tm.TeamId == team.Id && tm.UserId == userId);
        if (alreadyMember) return BadRequest("Вы уже в этой команде");

        _db.TeamMembers.Add(new TeamMember { TeamId = team.Id, UserId = userId });
        await _db.SaveChangesAsync();

        return Ok(new { message = "Вы присоединились к команде", teamId = team.Id });
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
                .ThenInclude(t => t.Owner)
            .Select(tm => new
            {
                id = tm.Team.Id,
                name = tm.Team.Name,
                allowMemberInvites = tm.Team.AllowMemberInvites,
                isOwner = tm.Team.OwnerId == userId,
                ownerName = tm.Team.OwnerId == userId ? null : tm.Team.Owner.FullName,
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
                isOwner = tm.Team.OwnerId == tm.User.Id
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

        var team = new Team
        {
            Name = dto.Name,
            OwnerId = userId,
            AllowMemberEditing = dto.AllowMemberEditing,
            AllowMemberInvites = dto.AllowMemberInvites
        };
        _db.Teams.Add(team);
        await _db.SaveChangesAsync();

        _db.TeamMembers.Add(new TeamMember { TeamId = team.Id, UserId = userId });
        await _db.SaveChangesAsync();

        return Ok(new { id = team.Id, name = team.Name });
    }
}

public class CreateTeamDto
{
    public string Name { get; set; } = string.Empty;
    public bool AllowMemberEditing { get; set; }
    public bool AllowMemberInvites { get; set; }
}