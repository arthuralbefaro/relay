using System.Text.Json.Nodes;
using Relay.Nodes;

namespace Relay.Nodes.Tests;

public class FixtureTests
{
    public static TheoryData<string, string> Casos()
    {
        var data = new TheoryData<string, string>();
        foreach (var file in Directory.GetFiles(FixturesDir(), "*.json"))
        {
            foreach (var caso in JsonNode.Parse(File.ReadAllText(file))!.AsArray())
                data.Add($"{Path.GetFileName(file)} · {caso!["nome"]}", caso.ToJsonString());
        }
        return data;
    }

    [Theory]
    [MemberData(nameof(Casos))]
    public void Saida_bate_com_a_fixture(string nome, string casoJson)
    {
        var caso = JsonNode.Parse(casoJson)!;
        var saida = NodeRegistry.Run(caso["node"]!.GetValue<string>(), caso["input"]!.ToJsonString());
        var esperado = caso["expected"];

        Assert.True(
            JsonNode.DeepEquals(JsonNode.Parse(saida), esperado),
            $"{nome}\nesperado: {esperado?.ToJsonString()}\nobtido:   {saida}");
    }

    // Sem isso, uma pasta de fixtures vazia (ou caminho errado) passaria verde.
    [Fact]
    public void Existe_pelo_menos_uma_fixture() =>
        Assert.NotEmpty(Directory.GetFiles(FixturesDir(), "*.json"));

    private static string FixturesDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "pnpm-workspace.yaml")))
            dir = dir.Parent;

        if (dir is null)
            throw new InvalidOperationException("raiz do monorepo não encontrada (pnpm-workspace.yaml)");

        return Path.Combine(dir.FullName, "fixtures", "nodes");
    }
}