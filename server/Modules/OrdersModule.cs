using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Security.Claims;
using Carter;

namespace Server.Modules;

public class OrdersModule : ICarterModule
{
    // In-memory store. Each order belongs to a department; editing is allowed
    // only when the caller's "department" claim matches the order's department.
    private static readonly ConcurrentDictionary<int, Order> Store = new(new[]
    {
        new KeyValuePair<int, Order>(1, new(1, "Coffee Beans", 2, 24.90m, "Shipped", "finance")),
        new KeyValuePair<int, Order>(2, new(2, "Mechanical Keyboard", 1, 119.00m, "Processing", "it")),
        new KeyValuePair<int, Order>(3, new(3, "USB-C Cable", 5, 34.50m, "Delivered", "finance"))
    });

    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/orders", () => Results.Ok(Store.Values.OrderBy(o => o.Id)))
            .RequireAuthorization()
            .WithName("GetOrders");

        // Update an order. Coarse gate: role orders.write (policy). Fine gate:
        // the order's department must match the caller's department claim.
        app.MapPut("/orders/{id:int}", (int id, UpdateOrderRequest req, ClaimsPrincipal user) =>
        {
            if (!Store.TryGetValue(id, out var order))
                return Results.NotFound();

            var department = user.FindFirstValue("department");
            if (string.IsNullOrEmpty(department) ||
                !string.Equals(department, order.Department, StringComparison.OrdinalIgnoreCase))
            {
                // Caller may write orders in general, but not THIS order.
                return Results.Problem(
                    detail: $"Your department '{department}' cannot edit an order owned by '{order.Department}'.",
                    statusCode: StatusCodes.Status403Forbidden);
            }

            var updated = order with
            {
                Product = req.Product ?? order.Product,
                Quantity = req.Quantity ?? order.Quantity,
                Status = req.Status ?? order.Status
            };
            Store[id] = updated;
            return Results.Ok(updated);
        })
        .RequireAuthorization("OrdersWriter")
        .WithName("UpdateOrder");

        // DELETE: authorization decision is delegated to Keycloak Authorization
        // Services (UMA). We ask Keycloak "may this token do orders:delete on the
        // 'orders' resource?" — no role/claim logic in C#; Keycloak's policy decides.
        app.MapDelete("/orders/{id:int}", async (int id, HttpContext ctx, IHttpClientFactory factory) =>
        {
            if (!Store.ContainsKey(id))
                return Results.NotFound();

            var auth = ctx.Request.Headers.Authorization.ToString();
            var token = auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
                ? auth["Bearer ".Length..]
                : null;
            if (string.IsNullOrEmpty(token))
                return Results.Unauthorized();

            var client = factory.CreateClient();
            var req = new HttpRequestMessage(HttpMethod.Post,
                "http://localhost:8080/realms/auth-learn/protocol/openid-connect/token")
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["grant_type"] = "urn:ietf:params:oauth:grant-type:uma-ticket",
                    ["audience"] = "orders-authz",            // the resource-server client
                    ["permission"] = "orders#orders:delete"    // resource#scope
                })
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var resp = await client.SendAsync(req);
            if (!resp.IsSuccessStatusCode)
                return Results.Problem(
                    detail: "Keycloak denied the orders:delete permission.",
                    statusCode: StatusCodes.Status403Forbidden);

            Store.TryRemove(id, out _);
            return Results.NoContent();
        })
        .RequireAuthorization()
        .WithName("DeleteOrder");
    }
}

public record Order(int Id, string Product, int Quantity, decimal Total, string Status, string Department);
public record UpdateOrderRequest(string? Product, int? Quantity, string? Status);
