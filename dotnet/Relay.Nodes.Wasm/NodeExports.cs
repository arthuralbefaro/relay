using System.Runtime.InteropServices;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using Relay.Nodes;

namespace Relay.Nodes.Wasm;

[SupportedOSPlatform("browser")]
public static partial class NodeExports
{
    [JSExport]
    public static string Execute(string nodeType, string inputJson) =>
        NodeRegistry.Run(nodeType, inputJson);

    [JSExport]
    public static string RuntimeInfo() =>
        $"{RuntimeInformation.FrameworkDescription} · {RuntimeInformation.OSDescription}";
}