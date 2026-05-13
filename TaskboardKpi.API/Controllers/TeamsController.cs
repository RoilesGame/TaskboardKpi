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

    // GET api/teams/my – список команд пользователя
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
                isOwner = tm.Team.OwnerId == userId,
                ownerName = tm.Team.OwnerId == userId ? null : tm.Team.Owner.FullName
            })
            .ToListAsync();

        return Ok(teams);
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
            AllowMemberEditing = dto.AllowMemberEditing
        };
        _db.Teams.Add(team);
        await _db.SaveChangesAsync();

        // Добавляем создателя как участника
        _db.TeamMembers.Add(new TeamMember { TeamId = team.Id, UserId = userId });
        await _db.SaveChangesAsync();

        return Ok(new { id = team.Id, name = team.Name });
    }
}

public class CreateTeamDto
{
    public string Name { get; set; } = string.Empty;
    public bool AllowMemberEditing { get; set; }
}