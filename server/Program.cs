using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using Carter;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

const string Authority = "http://localhost:8080/realms/auth-learn";
const string Audience = "orders-api";

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddCarter();
builder.Services.AddHttpClient();

// OAuth2 resource server: validate Keycloak-issued JWT access tokens.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = Authority;
        options.RequireHttpsMetadata = false; // local dev over http
        // Keep Keycloak's original claim names (sub, preferred_username, realm_access)
        // instead of remapping them to long WS-* URIs.
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = Authority,
            // Token must be intended for this API (aud contains "orders-api",
            // added by an audience mapper on each client). Keycloak's default
            // aud=account is also present but ignored — any match passes.
            ValidateAudience = true,
            ValidAudience = Audience,
            ValidateLifetime = true,
            NameClaimType = "preferred_username",
            RoleClaimType = "roles"
        };
        options.Events = new JwtBearerEvents
        {
            // Flatten Keycloak realm roles (nested JSON in "realm_access") into
            // individual "roles" claims so RequireRole / [Authorize(Roles=...)] work.
            OnTokenValidated = ctx =>
            {
                if (ctx.Principal?.Identity is ClaimsIdentity identity)
                {
                    var realmAccess = identity.FindFirst("realm_access")?.Value;
                    if (!string.IsNullOrEmpty(realmAccess))
                    {
                        using var doc = JsonDocument.Parse(realmAccess);
                        if (doc.RootElement.TryGetProperty("roles", out var roles)
                            && roles.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var role in roles.EnumerateArray())
                                identity.AddClaim(new Claim("roles", role.GetString() ?? ""));
                        }
                    }
                }
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization(options =>
{
    // Realm roles were flattened into "roles" claims (RoleClaimType) by the
    // OnTokenValidated event, so RequireRole works directly.
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("admin"));

    // Coarse gate for writing orders: realm role "orders.write". The per-order
    // (resource-based) check lives in the endpoint, comparing claim vs order data.
    options.AddPolicy("OrdersWriter", policy => policy.RequireRole("orders.write"));

    // Fine-grained: role orders.write (via SuperAdmins group -> composite role
    // orders.manager) AND department=finance.
    options.AddPolicy("FinanceOrdersManager", policy =>
    {
        policy.RequireRole("orders.write");
        policy.RequireClaim("department", "finance");
    });

    // Group membership arrives as "groups" claims, full path like "/SuperAdmins".
    options.AddPolicy("SuperAdminsOnly", policy =>
        policy.RequireClaim("groups", "/SuperAdmins"));
});

const string ClientCors = "client";
builder.Services.AddCors(options =>
{
    options.AddPolicy(ClientCors, policy =>
        policy.WithOrigins(
                  "http://localhost:5173",
                  "http://localhost:5174",
                  "http://localhost:5175")
              .AllowAnyHeader()
              .AllowAnyMethod());
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors(ClientCors);
app.UseAuthentication();
app.UseAuthorization();

app.MapCarter();

app.Run();
