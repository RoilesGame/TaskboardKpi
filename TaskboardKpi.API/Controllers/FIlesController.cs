using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskboardKpi.API.Data;
using TaskboardKpi.API.Models;
using TaskboardKpi.API.Services;

namespace TaskboardKpi.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class FilesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAccessControl _access;
    private readonly IWebHostEnvironment _env;

    public FilesController(AppDbContext db, IAccessControl access, IWebHostEnvironment env)
    {
        _db = db;
        _access = access;
        _env = env;
    }

    // GET api/files/{taskId}
    [HttpGet("{taskId:guid}")]
    public async Task<IActionResult> GetFiles(Guid taskId)
    {
        var task = await _db.Tasks.FindAsync(taskId);
        if (task == null) return NotFound();

        var userId = GetUserId();
        if (!await _access.CanAct(task.TeamId, userId)) return Forbid();

        var files = await _db.TaskFiles
            .Where(f => f.TaskId == taskId)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new
            {
                f.Id,
                f.FileName,
                f.ContentType,
                f.FileSize,
                f.CreatedAt,
                UploaderName = f.Uploader.FullName,
                DownloadUrl = $"/api/files/download/{f.Id}"
            })
            .ToListAsync();

        return Ok(files);
    }

    // POST api/files/{taskId}
    [HttpPost("{taskId:guid}")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10 MB
    public async Task<IActionResult> Upload(Guid taskId, IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("Файл не выбран");

        var task = await _db.Tasks.FindAsync(taskId);
        if (task == null) return NotFound();

        var userId = GetUserId();
        if (!await _access.CanEditTask(task.TeamId, userId))
            return Forbid("Недостаточно прав");

        // Создаём папку
        var uploadsFolder = Path.Combine(_env.WebRootPath, "uploads", task.TeamId.ToString(), taskId.ToString());
        Directory.CreateDirectory(uploadsFolder);

        // Генерируем уникальное имя
        var storedName = Guid.NewGuid() + Path.GetExtension(file.FileName);
        var filePath = Path.Combine(uploadsFolder, storedName);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        var taskFile = new TaskFile
        {
            TaskId = taskId,
            FileName = file.FileName,
            StoredName = storedName,
            FilePath = $"/uploads/{task.TeamId}/{taskId}/{storedName}",
            ContentType = file.ContentType,
            FileSize = file.Length,
            UploadedBy = userId
        };

        _db.TaskFiles.Add(taskFile);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            taskFile.Id,
            taskFile.FileName,
            taskFile.ContentType,
            taskFile.FileSize,
            taskFile.CreatedAt,
            DownloadUrl = $"/api/files/download/{taskFile.Id}"
        });
    }

    // GET api/files/download/{fileId}
    [HttpGet("download/{fileId:guid}")]
    public async Task<IActionResult> Download(Guid fileId)
    {
        var file = await _db.TaskFiles.FindAsync(fileId);
        if (file == null) return NotFound();

        var task = await _db.Tasks.FindAsync(file.TaskId);
        var userId = GetUserId();
        if (!await _access.CanAct(task!.TeamId, userId)) return Forbid();

        var fullPath = Path.Combine(_env.WebRootPath, file.FilePath.TrimStart('/'));
        if (!System.IO.File.Exists(fullPath)) return NotFound("Файл не найден на диске");

        var stream = new FileStream(fullPath, FileMode.Open);
        return File(stream, file.ContentType ?? "application/octet-stream", file.FileName);
    }

    // DELETE api/files/{fileId}
    [HttpDelete("{fileId:guid}")]
    public async Task<IActionResult> Delete(Guid fileId)
    {
        var file = await _db.TaskFiles.FindAsync(fileId);
        if (file == null) return NotFound();

        var task = await _db.Tasks.FindAsync(file.TaskId);
        var userId = GetUserId();
        if (!await _access.CanEditTask(task!.TeamId, userId)) return Forbid();

        // Удаляем физический файл
        var fullPath = Path.Combine(_env.WebRootPath, file.FilePath.TrimStart('/'));
        if (System.IO.File.Exists(fullPath))
            System.IO.File.Delete(fullPath);

        _db.TaskFiles.Remove(file);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Файл удалён" });
    }

    private Guid GetUserId()
    {
        var claim = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier);
        return Guid.Parse(claim!.Value);
    }
}