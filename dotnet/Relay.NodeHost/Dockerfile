FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Relay.Nodes/Relay.Nodes.csproj Relay.Nodes/
COPY Relay.NodeHost/Relay.NodeHost.csproj Relay.NodeHost/
RUN dotnet restore Relay.NodeHost/Relay.NodeHost.csproj
COPY Relay.Nodes/ Relay.Nodes/
COPY Relay.NodeHost/ Relay.NodeHost/
RUN dotnet publish Relay.NodeHost/Relay.NodeHost.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Relay.NodeHost.dll"]