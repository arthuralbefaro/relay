# Architecture

## Goals

Relay had to do several things at once, and most of its design follows from the tension between
them.

It had to be a real distributed system, with a queue, workers, retries, and a database, because
that is the kind of work the project is meant to demonstrate. It had to be openable by a stranger
in one click, with no signup and no server to keep alive. It had to use C# for something that
actually justifies a second language, rather than as decoration. And the AI nodes had to be
demonstrable by someone who has no API key and is not going to create one.

The resolution: write the execution logic once, with no knowledge of its environment, and give it
different dependencies in the browser and on the server.

## The engine

`runFlow(definition, trigger, deps)` is the whole surface. It validates, orders, executes, and
returns a log. It performs no I/O of its own. `deps.executors` maps a runtime name to something
that can run a node, and that is the only way a node ever runs.

Validation happens before anything executes. A flow with a cycle, a duplicate id, a retry policy
out of range, or a reference to a node that is not an ancestor comes back as `invalida` with a
list of issues, and no executor is called. The ancestor rule matters more than it looks: without
it, `steps.a.value` would resolve whenever execution order happened to cooperate, and fail later
for reasons that look unrelated.

A failed node marks its descendants as `pulado` and leaves independent branches alone. Retries
apply only to error codes that a second attempt could plausibly fix, `falha_interna` and
`executor_indisponivel`. Invalid input fails the same way every time, so retrying it only wastes
the queue's time.

## Two environments, same code

| Concern | Browser | Server |
| --- | --- | --- |
| Storage | PGlite over IndexedDB | Postgres |
| Queue | none, direct call | Redis and BullMQ |
| C# nodes | WebAssembly in the tab | ASP.NET service over HTTP |
| LLM provider | user key in `sessionStorage`, or recorded answers | `ANTHROPIC_API_KEY` in the worker |
| Editor backend | `FlowBackend` on PGlite | `FlowBackend` on HTTP |

Four interfaces carry the whole difference. `NodeExecutor` runs a node. `LLMClient` answers a
prompt, and the recorded implementation lets the public demo exercise the AI nodes with no key.
`QueryFn` is a single function, `(sql, params, method) => rows`, that both PGlite and
node-postgres satisfy, which lets Drizzle's `pg-proxy` driver serve both without a second schema.
`FlowBackend` is what the editor talks to, so the React tree contains no branch on which mode is
active.

Because the SQL is identical on both sides, migrations are identical too. The same migration list
runs against PGlite in a test and against Postgres in production.

## Data flow

Browser mode is synchronous. The editor calls `runFlow`, the engine calls the WebAssembly export
through a JSON string, and the result is written to PGlite and rendered.

Server mode is asynchronous by design, because the interesting failure modes only exist when the
producer and the consumer are separate processes. The editor saves the flow, posts a trigger, and
receives `202` with an execution id. The API enqueues a job keyed by that id. A worker loads the
flow, runs the engine, and writes the execution. The editor polls until the execution appears.

`GET /executions/:id` answers `202` while the job is queued or running and `200` once the row
exists. If BullMQ reports the job completed and the row is still missing, the API returns `500`
with `execucao_perdida` instead of reporting it as pending forever. An impossible state should be
loud.

## Key decisions

**A failed node is data; a failed job is infrastructure.** When a node fails, the job still
succeeds, because the execution log is the product. BullMQ retries only when the worker itself
could not finish, such as the database being unreachable. Since a retried job may run twice,
`saveExecution` keeps the first row on conflict.

**The queue key is the execution id.** The API generates a UUID, uses it as the BullMQ job id and
as the primary key of the execution row. That gives idempotency and lets one lookup answer both
"is it still running" and "what happened".

**References are declarative, not code.** `=trigger.nome` and `=steps.saudacao.message` are
resolved by a small lookup, and a missing path is an error rather than `undefined`. Running user
supplied JavaScript on the server is a sandboxing problem; keeping it declarative means the same
expression behaves identically in the tab and on the worker. The plan is to replace the lookup
with JSONata, which keeps that property.

**Model output is extracted by a balanced scan, not a regular expression.** A greedy `match` on
`{.*}` swallows the wrong object when the model wraps its JSON in prose, and a lazy one stops at
the first `}` inside a string. Both failures look identical from the outside: a correct
classification is discarded as invalid, and the log blames the model for a bug in the parser. The
extractor walks the text tracking depth, quotes, and escapes, and returns the first complete
object.

**A classification outside the allowed list becomes `null`, and the rejected value is kept.** The
node never invents a value the caller did not offer, and never silently hides that the model tried
to. `fora_da_lista` carries the rejected string, which is the difference between "the model found
nothing" and "the model answered something we refused".

**Provider errors are split by whether a second attempt could help.** Rate limits, overloads,
network failures, and 5xx responses are mapped to `falha_interna`, which is one of the two codes
the engine retries, so the existing backoff handles them with no LLM-specific logic. An invalid
key or a malformed request keeps its own code and fails once. API keys are stripped from error
messages before they reach the execution log, which is stored and rendered.

**The lookup table for node types lives in code, but coverage is derived.** The editor's palette,
the TypeScript executor, and the API's validation all read `NODE_CATALOG`. A node cannot appear in
the palette without an implementation, because they are the same object.

**Migrations are an explicit command.** The API and the worker check for pending migrations at
startup and refuse to run, naming the command. They never migrate on boot, because several
replicas booting at once would race.

**No `emitDecoratorMetadata` in the API.** The services run through `tsx`, which uses esbuild, and
esbuild does not emit type metadata. Every injection uses an explicit token, and request bodies
are validated with Zod rather than class-validator. The dependency graph is visible instead of
inferred.

**The C# boundary is a JSON string.** `NodeRegistry.Run(type, inputJson)` returns a JSON string,
and errors cross the boundary as `{ ok: false, error: { code, message } }` rather than as
exceptions. The same call shape works through a WebAssembly export and through an HTTP body, which
is why one fixture file can test both.

## Trade-offs worth naming

The .NET runtime costs megabytes in the browser. It is loaded lazily, only when the open flow has
a C# node, and the editor reports the load time. On a slow connection the first run of a C# node is
noticeably slower than the rest.

Polling for execution status is simpler than server-sent events and wastes requests. At the current
scale that is the right trade; at a larger one it is the first thing to replace.

Running TypeScript directly with `tsx` in the container skips a build step and keeps one source of
truth, at the cost of moving type checking entirely into CI.

PGlite allows a single tab. The app detects the conflict through a Web Lock and says so, rather
than letting two tabs write to the same IndexedDB store.

Sending the API key from the browser requires a header that Anthropic named to make the risk
obvious, and the risk is real: any script on the page could read `sessionStorage`. For a demo the
visitor runs with a key they control, that is an acceptable trade and the alternative is a proxy
that has to be paid for and kept alive. A product would put the key on the server.

Recorded answers keep the demo honest about what it is. The node reports the recorded text as its
output and says where it came from, instead of pretending a model was consulted.