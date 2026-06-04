namespace TaskboardKpi.API.Models;

public class Project : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid OwnerId { get; set; }
    public User Owner { get; set; } = null!;
    public ICollection<Team> Teams { get; set; } = new List<Team>();
}