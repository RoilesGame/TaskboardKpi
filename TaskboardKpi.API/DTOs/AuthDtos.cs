namespace TaskboardKpi.API.DTOs;

public record RegisterDto(string Email, string Password, string FullName, string? ProjectName, string? TeamName);
public record LoginDto(string Email, string Password);
public record SwitchTeamDto(Guid TeamId);