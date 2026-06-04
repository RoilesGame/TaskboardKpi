using Microsoft.EntityFrameworkCore;
using TaskboardKpi.API.Models;

namespace TaskboardKpi.API.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<TeamMember> TeamMembers => Set<TeamMember>();
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<TaskComment> TaskComments => Set<TaskComment>();
    public DbSet<TaskEvent> TaskEvents => Set<TaskEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Применяем snake_case ко всем таблицам и столбцам
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            entity.SetTableName(entity.GetTableName().ToSnakeCase());
            foreach (var property in entity.GetProperties())
                property.SetColumnName(property.GetColumnName().ToSnakeCase());
        }

        // Генерация UUID
        modelBuilder.Entity<User>().Property(u => u.Id).HasDefaultValueSql("gen_random_uuid()");
        modelBuilder.Entity<Project>().Property(p => p.Id).HasDefaultValueSql("gen_random_uuid()");
        modelBuilder.Entity<Team>().Property(t => t.Id).HasDefaultValueSql("gen_random_uuid()");
        modelBuilder.Entity<TeamMember>().Property(tm => tm.Id).HasDefaultValueSql("gen_random_uuid()");
        modelBuilder.Entity<TaskItem>().Property(t => t.Id).HasDefaultValueSql("gen_random_uuid()");
        modelBuilder.Entity<TaskComment>().Property(tc => tc.Id).HasDefaultValueSql("gen_random_uuid()");
        modelBuilder.Entity<TaskEvent>().Property(te => te.Id).HasDefaultValueSql("gen_random_uuid()");

        // Уникальные индексы
        modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<TeamMember>()
            .HasIndex(tm => new { tm.TeamId, tm.UserId })
            .IsUnique();

        // Связи Project -> User (владелец направления)
        modelBuilder.Entity<Project>()
            .HasOne(p => p.Owner)
            .WithMany()
            .HasForeignKey(p => p.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);

        // Связи Team -> Project
        modelBuilder.Entity<Team>()
            .HasOne(t => t.Project)
            .WithMany(p => p.Teams)
            .HasForeignKey(t => t.ProjectId);

        // Связи TeamMember -> Team, User
        modelBuilder.Entity<TeamMember>()
            .HasOne(tm => tm.Team)
            .WithMany(t => t.Members)
            .HasForeignKey(tm => tm.TeamId);
        modelBuilder.Entity<TeamMember>()
            .HasOne(tm => tm.User)
            .WithMany()
            .HasForeignKey(tm => tm.UserId);

        // Связи TaskItem -> Team, Assignee, CreatedBy
        modelBuilder.Entity<TaskItem>()
            .HasOne(t => t.Team)
            .WithMany(team => team.Tasks)
            .HasForeignKey(t => t.TeamId);
        modelBuilder.Entity<TaskItem>()
            .HasOne(t => t.Assignee)
            .WithMany()
            .HasForeignKey(t => t.AssigneeId)
            .IsRequired(false);
        modelBuilder.Entity<TaskItem>()
            .HasOne(t => t.CreatedByUser)
            .WithMany()
            .HasForeignKey(t => t.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // Связи TaskComment -> Task, User
        modelBuilder.Entity<TaskComment>()
            .HasOne(tc => tc.Task)
            .WithMany()
            .HasForeignKey(tc => tc.TaskId);
        modelBuilder.Entity<TaskComment>()
            .HasOne(tc => tc.Author)
            .WithMany()
            .HasForeignKey(tc => tc.AuthorId);

        // Связи TaskEvent -> Task, Team, User
        modelBuilder.Entity<TaskEvent>()
            .HasOne(te => te.Task)
            .WithMany()
            .HasForeignKey(te => te.TaskId);
        modelBuilder.Entity<TaskEvent>()
            .HasOne(te => te.Team)
            .WithMany()
            .HasForeignKey(te => te.TeamId);
        modelBuilder.Entity<TaskEvent>()
            .HasOne(te => te.User)
            .WithMany()
            .HasForeignKey(te => te.UserId);
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