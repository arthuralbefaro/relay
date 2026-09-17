using Relay.Nodes;

var builder = WebApplication.CreateBuilder(args);

if (string.IsNullOrWhiteSpace(builder.Configuration["urls"]))
{
    builder.WebHost.UseUrls("http://localhost:5080");
}

builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 1_048_576);

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "ok", nodes = NodeRegistry.Types }));

app.MapPost("/nodes/{type}/execute", async (string type, HttpRequest request) =>
{
    using var reader = new StreamReader(request.Body);
    var input = await reader.ReadToEndAsync(request.HttpContext.RequestAborted);
    return Results.Content(NodeRegistry.Run(type, input), "application/json; charset=utf-8");
});

app.Run();