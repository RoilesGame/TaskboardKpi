using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TaskboardKpi.API.Data;

var builder = WebApplication.CreateBuilder(args);

// База данных
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Аутентификация через JWT
var jwtKey = builder.Configuration["Jwt:Key"] ?? "DefaultFallbackKey1234567890!";
var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = key
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddControllers();
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Seed (выполнится, если база пуста)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

    if (!db.Users.Any())
    {
        var user = new TaskboardKpi.API.Models.User
        {
            Email = "demo@taskboard.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("demo"),
            FullName = "Демо Пользователь"
        };
        db.Users.Add(user);
        db.SaveChanges();

        var team = new TaskboardKpi.API.Models.Team
        {
            Name = "Моя команда",
            OwnerId = user.Id
        };
        db.Teams.Add(team);
        db.SaveChanges();

        var tasks = new TaskboardKpi.API.Models.TaskItem[]
        {
            new() { TeamId = team.Id, Title = "Сверстать главную страницу", Status = "backlog", Priority = "medium", CreatedBy = user.Id, Position = 0 },
            new() { TeamId = team.Id, Title = "Написать API для задач", Status = "in_progress", Priority = "high", CreatedBy = user.Id, Position = 0 },
            new() { TeamId = team.Id, Title = "Провести код-ревью", Status = "review", Priority = "medium", CreatedBy = user.Id, Position = 0 },
            new() { TeamId = team.Id, Title = "Настроить CI/CD", Status = "done", Priority = "low", CreatedBy = user.Id, Position = 0 }
        };
        db.Tasks.AddRange(tasks);
        db.SaveChanges();
    }
}

app.Run();