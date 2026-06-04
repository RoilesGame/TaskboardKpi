using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TaskboardKpi.API.Data;
using TaskboardKpi.API.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

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

builder.Services.AddScoped<IAccessControl, AccessControlService>();

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

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

    if (!db.Users.Any())
    {
        var globalAdmin = new TaskboardKpi.API.Models.User
        {
            Email = "admin@taskboard.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin"),
            FullName = "Глобальный Администратор",
            Role = "global_admin"
        };
        db.Users.Add(globalAdmin);

        var hrManager = new TaskboardKpi.API.Models.User
        {
            Email = "hr@taskboard.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("hr"),
            FullName = "Менеджер по персоналу",
            Role = "hr_manager"
        };
        db.Users.Add(hrManager);

        var user = new TaskboardKpi.API.Models.User
        {
            Email = "demo@taskboard.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("demo"),
            FullName = "Демо Пользователь",
            Role = "user"
        };
        db.Users.Add(user);
        db.SaveChanges();

        var project = new TaskboardKpi.API.Models.Project
        {
            Name = "Разработка игры",
            Description = "Основной проект по разработке игры",
            OwnerId = user.Id
        };
        db.Projects.Add(project);
        db.SaveChanges();

        var teamDev = new TaskboardKpi.API.Models.Team
        {
            ProjectId = project.Id,
            Name = "Программирование"
        };
        db.Teams.Add(teamDev);

        var teamArt = new TaskboardKpi.API.Models.Team
        {
            ProjectId = project.Id,
            Name = "Арт"
        };
        db.Teams.Add(teamArt);
        db.SaveChanges();

        db.TeamMembers.Add(new TaskboardKpi.API.Models.TeamMember
        {
            TeamId = teamDev.Id,
            UserId = user.Id,
            Role = "owner"
        });
        db.TeamMembers.Add(new TaskboardKpi.API.Models.TeamMember
        {
            TeamId = teamArt.Id,
            UserId = user.Id,
            Role = "owner"
        });

        db.TeamMembers.Add(new TaskboardKpi.API.Models.TeamMember
        {
            TeamId = teamDev.Id,
            UserId = globalAdmin.Id,
            Role = "observer"
        });
        db.TeamMembers.Add(new TaskboardKpi.API.Models.TeamMember
        {
            TeamId = teamDev.Id,
            UserId = hrManager.Id,
            Role = "observer"
        });
        db.SaveChanges();

        var tasks = new TaskboardKpi.API.Models.TaskItem[]
        {
            new() { TeamId = teamDev.Id, Title = "Написать игровой движок", Status = "backlog", Priority = "high", CreatedBy = user.Id, DueDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)), StartDate = DateOnly.FromDateTime(DateTime.UtcNow) },
            new() { TeamId = teamDev.Id, Title = "Разработать систему сохранений", Status = "backlog", Priority = "medium", CreatedBy = user.Id, DueDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(21)) },
            new() { TeamId = teamArt.Id, Title = "Нарисовать главного героя", Status = "backlog", Priority = "high", CreatedBy = user.Id, DueDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10)) },
            new() { TeamId = teamArt.Id, Title = "Создать фоны уровней", Status = "in_progress", Priority = "medium", CreatedBy = user.Id, DueDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7)) }
        };
        db.Tasks.AddRange(tasks);
        db.SaveChanges();
    }
}

app.Run();