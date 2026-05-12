namespace TaskboardKpi.API.Models;

public class Team
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Company Company { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid? CreatedBy { get; set; }
    public User? Creator { get; set; }
    public DateTime CreatedAt { get; set; }
    public ICollection<TeamMember> Members { get; set; } = new List<TeamMember>();
}