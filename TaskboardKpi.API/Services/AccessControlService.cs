using Microsoft.EntityFrameworkCore;
using TaskboardKpi.API.Data;

namespace TaskboardKpi.API.Services;

public class AccessControlService : IAccessControl
{
    private readonly AppDbContext _db;
    public AccessControlService(AppDbContext db) => _db = db;

    public async Task<bool> CanEditTask(Guid teamId, Guid userId)
    {
        // Глобальный администратор может всё
        if (await IsGlobalAdmin(userId)) return true;
        // HR-менеджер тоже может редактировать? По условиям — нет, только управление людьми.
        var member = await _db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.TeamId == teamId && tm.UserId == userId);
        return member != null && (member.Role == "owner" || member.Role == "editor");
    }

    public async Task<bool> CanAct(Guid teamId, Guid userId)
    {
        if (await IsGlobalAdmin(userId)) return true;
        var member = await _db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.TeamId == teamId && tm.UserId == userId);
        return member != null && member.Role != "observer";
    }

    public async Task<string?> GetRole(Guid teamId, Guid userId)
    {
        var member = await _db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.TeamId == teamId && tm.UserId == userId);
        return member?.Role;
    }

    public async Task<bool> IsGlobalAdmin(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        return user != null && user.Role == "global_admin";
    }

    public async Task<bool> IsHrManager(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        return user != null && user.Role == "hr_manager";
    }
}