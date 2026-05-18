namespace TaskboardKpi.API.Models;

public class Team
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public User Owner { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool AllowMemberEditing { get; set; }
    public bool AllowMemberInvites { get; set; }
    public Guid? InviteToken { get; set; }
    public ICollection<TeamMember> Members { get; set; } = new List<TeamMember>();
    public ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
}