using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TaskboardKpi.API.Data;
using TaskboardKpi.API.Models;
using TaskboardKpi.API.DTOs;

namespace TaskboardKpi.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public AuthController(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    // POST api/auth/register
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        if (await _db.Users.AnyAsync(u => u.Email == dto.Email))
            return BadRequest("Пользователь с таким email уже существует");

        var user = new User
        {
            Email = dto.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            FullName = dto.FullName,
            Role = "user"
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        // Создаём проект и команду по умолчанию
        var project = new Project
        {
            Name = dto.ProjectName ?? "Мой проект",
            OwnerId = user.Id
        };
        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        var team = new Team
        {
            ProjectId = project.Id,
            Name = dto.TeamName ?? "Основная команда"
        };
        _db.Teams.Add(team);
        await _db.SaveChangesAsync();

        // Добавляем пользователя как владельца команды
        _db.TeamMembers.Add(new TeamMember
        {
            TeamId = team.Id,
            UserId = user.Id,
            Role = "owner"
        });
        await _db.SaveChangesAsync();

        var token = GenerateJwt(user.Id, team.Id, user.Role);
        return Ok(new { token, teamId = team.Id, projectId = project.Id });
    }

    // POST api/auth/login
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == dto.Email);
        if (user == null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
            return Unauthorized("Неверный email или пароль");

        if (user.IsBlocked)
            return Forbid("Ваш аккаунт заблокирован");

        // Находим первую команду, в которой пользователь состоит
        var membership = await _db.TeamMembers
            .Include(tm => tm.Team)
            .FirstOrDefaultAsync(tm => tm.UserId == user.Id);

        if (membership == null)
        {
            // Создаём проект и команду автоматически
            var project = new Project { Name = "Мой проект", OwnerId = user.Id };
            _db.Projects.Add(project);
            await _db.SaveChangesAsync();

            var team = new Team { ProjectId = project.Id, Name = "Основная команда" };
            _db.Teams.Add(team);
            await _db.SaveChangesAsync();

            _db.TeamMembers.Add(new TeamMember { TeamId = team.Id, UserId = user.Id, Role = "owner" });
            await _db.SaveChangesAsync();

            var token = GenerateJwt(user.Id, team.Id, user.Role);
            return Ok(new { token, teamId = team.Id, projectId = project.Id });
        }

        var mainToken = GenerateJwt(user.Id, membership.TeamId, user.Role);
        return Ok(new { token = mainToken, teamId = membership.TeamId, projectId = membership.Team.ProjectId });
    }

    // GET api/auth/me
    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> GetProfile()
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var user = await _db.Users.FindAsync(userId);
        if (user == null) return NotFound();

        return Ok(new
        {
            fullName = user.FullName,
            email = user.Email,
            avatarUrl = user.AvatarUrl,
            role = user.Role
        });
    }

    // POST api/auth/switch-team
    [Authorize]
    [HttpPost("switch-team")]
    public async Task<IActionResult> SwitchTeam([FromBody] SwitchTeamDto dto)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();
        var userId = Guid.Parse(userIdClaim.Value);

        var membership = await _db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.TeamId == dto.TeamId && tm.UserId == userId);
        if (membership == null)
            return Forbid("Вы не состоите в этой команде");

        var user = await _db.Users.FindAsync(userId);
        var newToken = GenerateJwt(userId, dto.TeamId, user?.Role ?? "user");
        var team = await _db.Teams.FindAsync(dto.TeamId);
        return Ok(new { token = newToken, teamId = dto.TeamId, projectId = team?.ProjectId });
    }

    private string GenerateJwt(Guid userId, Guid teamId, string globalRole)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim("teamId", teamId.ToString()),
            new Claim("globalRole", globalRole)
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
            _config["Jwt:Key"] ?? "DefaultFallbackKey1234567890!"));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddDays(1),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}