using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskboardKpi.API.Data;

namespace TaskboardKpi.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class CompaniesController : ControllerBase
{
    private readonly AppDbContext _db;
    public CompaniesController(AppDbContext db) => _db = db;

    [HttpGet("first")]
    public async Task<IActionResult> GetFirst()
    {
        var company = await _db.Companies.FirstOrDefaultAsync();
        if (company == null) return NotFound();
        return Ok(new { id = company.Id });
    }
}