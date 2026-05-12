namespace TaskboardKpi.API.Models;

public class Company
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? LogoUrl { get; set; }
    public Guid OwnerId { get; set; }
    public User Owner { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public ICollection<CompanyMember> Members { get; set; } = new List<CompanyMember>();
    public ICollection<Team> Teams { get; set; } = new List<Team>();
    public ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
}