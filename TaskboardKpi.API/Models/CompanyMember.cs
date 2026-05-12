namespace TaskboardKpi.API.Models;

public class CompanyMember
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Company Company { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public string Role { get; set; } = "employee";
    public DateTime JoinedAt { get; set; }
}