using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TaskboardKpi.API.Data;
using TaskboardKpi.API.Models;

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

        // Создаём компанию для нового пользователя
        var company = new Company
        {
            Name = dto.CompanyName ?? "Моя компания",
            OwnerId = user.Id
        };
        _db.Companies.Add(company);
        await _db.SaveChangesAsync();

        var token = GenerateJwt(user.Id, company.Id);
        return Ok(new { token, companyId = company.Id });
    }

    // POST api/auth/login
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == dto.Email);
        if (user == null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
            return Unauthorized("Неверный email или пароль");

        // Ищем компанию, где пользователь владелец или участник
        var company = await _db.Companies
            .Where(c => c.OwnerId == user.Id)
            .FirstOrDefaultAsync();

        if (company == null)
            return NotFound("Компания не найдена");

        var token = GenerateJwt(user.Id, company.Id);
        return Ok(new { token, companyId = company.Id });
    }

    private string GenerateJwt(Guid userId, Guid companyId)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim("companyId", companyId.ToString())
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
}

// DTO
public record RegisterDto(string Email, string Password, string FullName, string? CompanyName);
public record LoginDto(string Email, string Password);