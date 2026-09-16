using System.Security.Claims;
using Carter;

namespace Server.Modules;

public class FinanceModule : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        // Requires: realm role "orders.write" (via SuperAdmins group -> composite
        // role orders.manager) AND the department=finance claim.
        app.MapGet("/finance/orders", (ClaimsPrincipal user) => Results.Ok(new FinanceResponse(
                user.FindFirstValue("preferred_username") ?? "unknown",
                user.FindFirstValue("department") ?? "",
                RealmRoles(user))))
            .RequireAuthorization("FinanceOrdersManager")
            .WithName("GetFinanceOrders");
    }

    private static string[] RealmRoles(ClaimsPrincipal user)
    {
        var realmAccess = user.FindFirst("realm_access")?.Value;
        if (string.IsNullOrEmpty(realmAccess))
            return [];
        using var doc = System.Text.Json.JsonDocument.Parse(realmAccess);
        return doc.RootElement.TryGetProperty("roles", out var roles) && roles.ValueKind == System.Text.Json.JsonValueKind.Array
            ? roles.EnumerateArray().Select(r => r.GetString() ?? "").ToArray()
            : [];
    }
}

public record FinanceResponse(string User, string Department, string[] Roles);
