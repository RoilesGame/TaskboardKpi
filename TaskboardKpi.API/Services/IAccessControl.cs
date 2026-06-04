namespace TaskboardKpi.API.Services;

public interface IAccessControl
{
    Task<bool> CanEditTask(Guid teamId, Guid userId);
    Task<bool> CanAct(Guid teamId, Guid userId);
    Task<string?> GetRole(Guid teamId, Guid userId);
    Task<bool> IsGlobalAdmin(Guid userId);
    Task<bool> IsHrManager(Guid userId);
}