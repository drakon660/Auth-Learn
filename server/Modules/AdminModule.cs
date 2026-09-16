using System.Security.Claims;
using Carter;

namespace Server.Modules;

public class AdminModule : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        // Admin-only: returns the caller's identity + all token claims.
        app.MapGet("/admin/claims", (ClaimsPrincipal user) => Results.Ok(new AdminClaimsResponse(
                user.FindFirstValue("preferred_username") ?? user.Identity?.Name ?? "unknown",
                user.Claims.Select(c => new ClaimView(c.Type, c.Value)).ToArray())))
            .RequireAuthorization("AdminOnly")
            .WithName("GetAdminClaims");
    }
}

public record ClaimView(string Type, string Value);
public record AdminClaimsResponse(string User, ClaimView[] Claims);
