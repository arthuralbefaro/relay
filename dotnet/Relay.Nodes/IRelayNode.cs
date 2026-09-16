using System.Text.Json.Nodes;

namespace Relay.Nodes;

public interface IRelayNode
{
    string Type { get; }
    JsonNode Execute(JsonNode input);
}

public sealed class NodeInputException(string message) : Exception(message);