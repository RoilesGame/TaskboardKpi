using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TaskboardKpi.API.Data;
using TaskboardKpi.API.Models;
using Microsoft.AspNetCore.Authorization;

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
            FullName = dto.FullName
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        // Создаём команду для нового пользователя
        var team = new Team
        {
            Name = dto.TeamName ?? "Моя команда",
            OwnerId = user.Id
        };
        _db.Teams.Add(team);
        await _db.SaveChangesAsync();

        // Добавляем владельца в участники (опционально)
        _db.TeamMembers.Add(new TeamMember { TeamId = team.Id, UserId = user.Id });
        await _db.SaveChangesAsync();

        var token = GenerateJwt(user.Id, team.Id);
        return Ok(new { token, teamId = team.Id });
    }

    // POST api/auth/login
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == dto.Email);
        if (user == null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
            return Unauthorized("Неверный email или пароль");

        // Ищем какую-нибудь команду, где пользователь владелец или участник
        var teamMember = await _db.TeamMembers
            .Include(tm => tm.Team)
            .FirstOrDefaultAsync(tm => tm.UserId == user.Id);

        if (teamMember == null)
        {
            // Создаём команду автоматически, если её нет
            var team = new Team { Name = "Моя команда", OwnerId = user.Id };
            _db.Teams.Add(team);
            await _db.SaveChangesAsync();
            _db.TeamMembers.Add(new TeamMember { TeamId = team.Id, UserId = user.Id });
            await _db.SaveChangesAsync();

            var token = GenerateJwt(user.Id, team.Id);
            return Ok(new { token, teamId = team.Id });
        }

        var tokenMain = GenerateJwt(user.Id, teamMember.TeamId);
        return Ok(new { token = tokenMain, teamId = teamMember.TeamId });
    }

    private string GenerateJwt(Guid userId, Guid teamId)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim("teamId", teamId.ToString())
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
            _config["Jwt:Key"] ?? "DefaultFallbackKey1234567890!"));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(2),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
    
    // Внутри класса AuthController
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
            avatarUrl = user.AvatarUrl // может быть null
        });
    }
    
    // POST api/auth/switch-team
    [HttpPost("switch-team")]
    public async Task<IActionResult> SwitchTeam([FromBody] SwitchTeamDto dto)
    {
        var userIdClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier);
        if (userIdClaim == null) return Unauthorized();

        var userId = Guid.Parse(userIdClaim.Value);

        // Проверяем, состоит ли пользователь в команде
        var membership = await _db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.TeamId == dto.TeamId && tm.UserId == userId);
        if (membership == null)
            return Forbid("Вы не состоите в этой команде");

        var newToken = GenerateJwt(userId, dto.TeamId);
        return Ok(new { token = newToken, teamId = dto.TeamId });
    }
}

// DTO
public record RegisterDto(string Email, string Password, string FullName, string? TeamName);
public record LoginDto(string Email, string Password);
public record SwitchTeamDto(Guid TeamId);