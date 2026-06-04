using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskboardKpi.API.Data;
using TaskboardKpi.API.Services;

namespace TaskboardKpi.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAccessControl _access;

    public AdminController(AppDbContext db, IAccessControl access)
    {
        _db = db;
        _access = access;
    }

    // Проверка, что пользователь - глобальный администратор
    private async Task<bool> IsGlobalAdmin()
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return false;
        var userId = Guid.Parse(userIdClaim.Value);
        return await _access.IsGlobalAdmin(userId);
    }

    // GET api/admin/users
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        if (!await IsGlobalAdmin()) return Forbid();

        var users = await _db.Users
            .OrderBy(u => u.CreatedAt)
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.FullName,
                u.Role,
                u.IsBlocked,
                u.CreatedAt
            })
            .ToListAsync();

        return Ok(users);
    }

    // POST api/admin/users/{id}/block
    [HttpPost("users/{id:guid}/block")]
    public async Task<IActionResult> ToggleBlock(Guid id)
    {
        if (!await IsGlobalAdmin()) return Forbid();

        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound();

        user.IsBlocked = !user.IsBlocked;
        await _db.SaveChangesAsync();

        return Ok(new { message = user.IsBlocked ? "Пользователь заблокирован" : "Пользователь разблокирован", isBlocked = user.IsBlocked });
    }

    // GET api/admin/teams
    [HttpGet("teams")]
    public async Task<IActionResult> GetTeams()
    {
        if (!await IsGlobalAdmin()) return Forbid();

        var teams = await _db.Teams
            .Include(t => t.Project)
            .OrderBy(t => t.CreatedAt)
            .Select(t => new
            {
                t.Id,
                t.Name,
                ProjectName = t.Project.Name,
                MembersCount = t.Members.Count,
                t.IsPublic
            })
            .ToListAsync();

        return Ok(teams);
    }

    // DELETE api/admin/teams/{id}
    [HttpDelete("teams/{id:guid}")]
    public async Task<IActionResult> DeleteTeam(Guid id)
    {
        if (!await IsGlobalAdmin()) return Forbid();

        var team = await _db.Teams.FindAsync(id);
        if (team == null) return NotFound();

        _db.Teams.Remove(team);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Команда удалена" });
    }
}