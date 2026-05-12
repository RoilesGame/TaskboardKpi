using Microsoft.EntityFrameworkCore;
using TaskboardKpi.API.Models;

namespace TaskboardKpi.API.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<CompanyMember> CompanyMembers => Set<CompanyMember>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<TeamMember> TeamMembers => Set<TeamMember>();
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<TaskComment> TaskComments => Set<TaskComment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Применяем snake_case ко всем таблицам и столбцам
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            // Имя таблицы
            entity.SetTableName(entity.GetTableName().ToSnakeCase());

            // Имена столбцов
            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(property.GetColumnName().ToSnakeCase());
            }
        }

        // --- Явная настройка внешних ключей и навигаций ---

        // User -> Company
        modelBuilder.Entity<Company>()
            .HasOne(c => c.Owner)
            .WithMany()
            .HasForeignKey(c => c.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);

        // CompanyMembers
        modelBuilder.Entity<CompanyMember>()
            .HasOne(cm => cm.Company)
            .WithMany(c => c.Members)
            .HasForeignKey(cm => cm.CompanyId);

        modelBuilder.Entity<CompanyMember>()
            .HasOne(cm => cm.User)
            .WithMany()
            .HasForeignKey(cm => cm.UserId);

        // Teams
        modelBuilder.Entity<Team>()
            .HasOne(t => t.Company)
            .WithMany(c => c.Teams)
            .HasForeignKey(t => t.CompanyId);

        modelBuilder.Entity<Team>()
            .HasOne(t => t.Creator)
            .WithMany()
            .HasForeignKey(t => t.CreatedBy)
            .IsRequired(false);

        // TeamMembers
        modelBuilder.Entity<TeamMember>()
            .HasOne(tm => tm.Team)
            .WithMany(t => t.Members)
            .HasForeignKey(tm => tm.TeamId);

        modelBuilder.Entity<TeamMember>()
            .HasOne(tm => tm.User)
            .WithMany()
            .HasForeignKey(tm => tm.UserId);

        // TaskItem – главная настройка!
        modelBuilder.Entity<TaskItem>()
            .HasOne(t => t.Company)
            .WithMany(c => c.Tasks)
            .HasForeignKey(t => t.CompanyId);

        modelBuilder.Entity<TaskItem>()
            .HasOne(t => t.Team)
            .WithMany()
            .HasForeignKey(t => t.TeamId)
            .IsRequired(false);

        // Assignee – FK к Users
        modelBuilder.Entity<TaskItem>()
            .HasOne(t => t.Assignee)
            .WithMany()
            .HasForeignKey(t => t.AssigneeId)   // это реальный столбец assignee_id
            .IsRequired(false);

        // CreatedBy – FK к Users (ВАЖНО: указываем поле CreatedBy, а не навигацию)
        modelBuilder.Entity<TaskItem>()
            .HasOne(t => t.CreatedByUser)
            .WithMany()
            .HasForeignKey(t => t.CreatedBy)    // столбец created_by
            .OnDelete(DeleteBehavior.Restrict);

        // TaskComment
        modelBuilder.Entity<TaskComment>()
            .HasOne(tc => tc.Task)
            .WithMany()
            .HasForeignKey(tc => tc.TaskId);

        modelBuilder.Entity<TaskComment>()
            .HasOne(tc => tc.Author)
            .WithMany()
            .HasForeignKey(tc => tc.AuthorId);

        // UUID генерация
        modelBuilder.Entity<User>().Property(u => u.Id).HasDefaultValueSql("gen_random_uuid()");
        modelBuilder.Entity<Company>().Property(c => c.Id).HasDefaultValueSql("gen_random_uuid()");
        modelBuilder.Entity<CompanyMember>().Property(cm => cm.Id).HasDefaultValueSql("gen_random_uuid()");
        modelBuilder.Entity<Team>().Property(t => t.Id).HasDefaultValueSql("gen_random_uuid()");
        modelBuilder.Entity<TeamMember>().Property(tm => tm.Id).HasDefaultValueSql("gen_random_uuid()");
        modelBuilder.Entity<TaskItem>().Property(t => t.Id).HasDefaultValueSql("gen_random_uuid()");
        modelBuilder.Entity<TaskComment>().Property(tc => tc.Id).HasDefaultValueSql("gen_random_uuid()");

        // Уникальные индексы
        modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<CompanyMember>()
            .HasIndex(cm => new { cm.CompanyId, cm.UserId })
            .IsUnique();
        modelBuilder.Entity<TeamMember>()
            .HasIndex(tm => new { tm.TeamId, tm.UserId })
            .IsUnique();
    }
}

public static class StringExtensions
{
    public static string ToSnakeCase(this string input)
    {
        if (string.IsNullOrEmpty(input)) return input;
        return string.Concat(input.Select((ch, i) =>
            i > 0 && char.IsUpper(ch) ? "_" + char.ToLower(ch) : char.ToLower(ch).ToString()));
    }
}