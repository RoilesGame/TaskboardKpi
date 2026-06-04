namespace TaskboardKpi.API.DTOs;

public class CreateTeamDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? ProjectName { get; set; }
    public bool IsPublic { get; set; }
}