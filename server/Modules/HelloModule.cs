using System.Security.Claims;
using Carter;

namespace Server.Modules;

public class HelloModule : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/hello", (ClaimsPrincipal user) =>
        {
            var name = user.FindFirstValue("preferred_username") ?? user.Identity?.Name ?? "unknown";
            return Results.Ok(new HelloResponse($"Hello {name}, from a protected Carter endpoint!"));
        })
        .RequireAuthorization()
        .WithName("GetHello");
    }
}

public record HelloResponse(string Message);
