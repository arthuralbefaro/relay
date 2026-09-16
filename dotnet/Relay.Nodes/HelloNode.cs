using System.Text.Json.Nodes;

namespace Relay.Nodes;

public sealed class HelloNode : IRelayNode
{
    public string Type => "hello";

    public JsonNode Execute(JsonNode input)
    {
        if (input["name"] is not JsonValue value
            || !value.TryGetValue<string>(out var name)
            || string.IsNullOrWhiteSpace(name))
        {
            throw new NodeInputException("o campo 'name' é obrigatório e deve ser texto");
        }

        return new JsonObject { ["message"] = $"Olá, {name.Trim()}!" };
    }
}