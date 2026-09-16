using System.Security.Claims;
using Carter;

namespace Server.Modules;

public class SuperAdminModule : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        // Group-gated: only members of the "SuperAdmins" Keycloak group.
        app.MapGet("/superadmin", (ClaimsPrincipal user) => Results.Ok(new SuperAdminResponse(
                user.FindFirstValue("preferred_username") ?? user.Identity?.Name ?? "unknown",
                user.FindAll("groups").Select(c => c.Value).ToArray())))
            .RequireAuthorization("SuperAdminsOnly")
            .WithName("GetSuperAdmin");
    }
}

public record SuperAdminResponse(string User, string[] Groups);
