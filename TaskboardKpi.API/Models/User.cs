namespace TaskboardKpi.API.Models;

public class User : BaseEntity
{
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string Role { get; set; } = "user";
    public bool IsBlocked { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}