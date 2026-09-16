using System.Text.Json;
using System.Text.Json.Nodes;

namespace Relay.Nodes;

// Erros atravessam a fronteira C# -> JS como DADO (ok:false + code),
// nunca como exceção. Assim o chamador sempre sabe o que falhou.
public static class NodeRegistry
{
    private static readonly Dictionary<string, IRelayNode> Nodes =
        new IRelayNode[] { new HelloNode() }.ToDictionary(n => n.Type);

    public static IReadOnlyCollection<string> Types => Nodes.Keys;

    public static string Run(string nodeType, string inputJson)
    {
        if (!Nodes.TryGetValue(nodeType, out var node))
            return Error("node_desconhecido", $"nó '{nodeType}' não existe");

        JsonNode? input;
        try { input = JsonNode.Parse(inputJson); }
        catch (JsonException) { return Error("json_invalido", "a entrada não é um JSON válido"); }

        if (input is null)
            return Error("json_invalido", "a entrada não pode ser null");

        try
        {
            return new JsonObject { ["ok"] = true, ["output"] = node.Execute(input) }.ToJsonString();
        }
        catch (NodeInputException ex) { return Error("entrada_invalida", ex.Message); }
        catch (Exception ex) { return Error("falha_interna", ex.GetType().Name); }
    }

    private static string Error(string code, string message) =>
        new JsonObject
        {
            ["ok"] = false,
            ["error"] = new JsonObject { ["code"] = code, ["message"] = message }
        }.ToJsonString();
}