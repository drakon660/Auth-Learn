using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

var builder = WebApplication.CreateBuilder(args);

const string Authority = "http://localhost:8080/realms/auth-learn";
const string ApiBase = "http://localhost:5111"; // the resource Web API
const string SpaOrigin = "http://localhost:5176";

builder.Services.AddHttpClient();

// Cookie holds the session; OIDC challenges Keycloak. Tokens live server-side.
builder.Services.AddAuthentication(options =>
    {
        options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
    })
    .AddCookie(options =>
    {
        options.Cookie.Name = "bff.session";
        options.Cookie.HttpOnly = true;          // JS can never read it
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest; // http in dev
        // Return 401 to the SPA instead of redirecting API/user calls to Keycloak.
        options.Events.OnRedirectToLogin = ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        // Refresh the access token when it is close to expiry, using the stored
        // refresh token. Runs on every authenticated request.
        options.Events.OnValidatePrincipal = async ctx =>
        {
            var expValue = ctx.Properties.GetTokenValue("expires_at");
            if (expValue is null)
                return;

            var expiresAt = DateTimeOffset.Parse(expValue, CultureInfo.InvariantCulture);
            if (expiresAt > DateTimeOffset.UtcNow.AddSeconds(30))
                return; // still valid

            var refreshToken = ctx.Properties.GetTokenValue("refresh_token");
            if (string.IsNullOrEmpty(refreshToken))
            {
                ctx.RejectPrincipal();
                return;
            }

            var http = ctx.HttpContext.RequestServices
                .GetRequiredService<IHttpClientFactory>().CreateClient();
            var resp = await http.PostAsync($"{Authority}/protocol/openid-connect/token",
                new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["grant_type"] = "refresh_token",
                    ["client_id"] = "bff-client",
                    ["client_secret"] = "bff-secret",
                    ["refresh_token"] = refreshToken
                }));

            if (!resp.IsSuccessStatusCode)
            {
                // Refresh token expired/revoked — force re-login.
                ctx.RejectPrincipal();
                return;
            }

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var root = doc.RootElement;
            var expiresIn = root.GetProperty("expires_in").GetInt32();

            ctx.Properties.UpdateTokenValue("access_token", root.GetProperty("access_token").GetString()!);
            ctx.Properties.UpdateTokenValue("refresh_token",
                root.TryGetProperty("refresh_token", out var rt) ? rt.GetString()! : refreshToken);
            ctx.Properties.UpdateTokenValue("expires_at",
                DateTimeOffset.UtcNow.AddSeconds(expiresIn).ToString("o", CultureInfo.InvariantCulture));

            ctx.ShouldRenew = true; // re-issue the cookie with the new tokens
        };
    })
    .AddOpenIdConnect(OpenIdConnectDefaults.AuthenticationScheme, options =>
    {
        options.Authority = Authority;
        options.ClientId = "bff-client";
        options.ClientSecret = "bff-secret";
        options.ResponseType = OpenIdConnectResponseType.Code; // Auth Code + PKCE
        options.UsePkce = true;
        options.RequireHttpsMetadata = false; // dev
        options.SaveTokens = true;            // keep access/refresh tokens in the cookie
        options.GetClaimsFromUserInfoEndpoint = true;
        options.MapInboundClaims = false;
        options.Scope.Clear();
        options.Scope.Add("openid");
        options.Scope.Add("profile");
        options.Scope.Add("email");
        // A refresh token is issued by the code flow already; it is valid for the
        // SSO session lifetime. (Add "offline_access" + assign that client scope
        // to bff-client for refresh beyond the session.)
        options.TokenValidationParameters.NameClaimType = "preferred_username";
        options.SignedOutRedirectUri = SpaOrigin + "/";
    });

builder.Services.AddAuthorization();

var app = builder.Build();

// Behind the Vite dev proxy: trust X-Forwarded-* so redirect_uri uses the SPA origin.
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedHost | ForwardedHeaders.XForwardedProto
});

app.UseAuthentication();
app.UseAuthorization();

// --- BFF session endpoints ---

// Start login: bounce to Keycloak, come back to returnUrl.
app.MapGet("/bff/login", (string? returnUrl) =>
    Results.Challenge(
        new AuthenticationProperties { RedirectUri = returnUrl ?? "/" },
        [OpenIdConnectDefaults.AuthenticationScheme]));

// Logout: clear cookie AND end the Keycloak session.
app.MapGet("/bff/logout", () =>
    Results.SignOut(
        new AuthenticationProperties { RedirectUri = SpaOrigin + "/" },
        [CookieAuthenticationDefaults.AuthenticationScheme, OpenIdConnectDefaults.AuthenticationScheme]));

// Who am I — the SPA uses this to know login state. 401 if not logged in.
app.MapGet("/bff/user", (ClaimsPrincipal user) =>
{
    if (user.Identity?.IsAuthenticated != true)
        return Results.Unauthorized();
    return Results.Ok(new
    {
        name = user.FindFirstValue("preferred_username") ?? user.Identity.Name,
        email = user.FindFirstValue("email"),
        claims = user.Claims.Select(c => new { c.Type, c.Value })
    });
});

// --- Proxy: /api/* -> resource API, injecting the stored access token ---
app.Map("/api/{**path}", async (HttpContext ctx, IHttpClientFactory factory, string path) =>
{
    var accessToken = await ctx.GetTokenAsync("access_token");
    if (string.IsNullOrEmpty(accessToken))
        return Results.Unauthorized();

    var client = factory.CreateClient();
    var target = $"{ApiBase}/{path}{ctx.Request.QueryString}";
    var req = new HttpRequestMessage(new HttpMethod(ctx.Request.Method), target);

    if (ctx.Request.ContentLength > 0 || ctx.Request.Headers.ContainsKey("Content-Type"))
    {
        var ms = new MemoryStream();
        await ctx.Request.Body.CopyToAsync(ms);
        ms.Position = 0;
        req.Content = new StreamContent(ms);
        if (ctx.Request.ContentType is { } ct)
            req.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(ct);
    }
    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    var resp = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead);
    var body = await resp.Content.ReadAsByteArrayAsync();
    ctx.Response.StatusCode = (int)resp.StatusCode;
    ctx.Response.ContentType = resp.Content.Headers.ContentType?.ToString() ?? "application/json";
    await ctx.Response.Body.WriteAsync(body);
    return Results.Empty;
});

app.Run();
