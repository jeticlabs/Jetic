# Load Testing in Jetic

**Status:** design proposal · **Command:** `jetic load` (name not final)

## In one paragraph

Jetic already records workflows: real sequences of API calls such as "log in → add to cart → check out". Load testing replays those workflows as many users at once, against a local, staging or production server, and measures how the server holds up. It shows where it slows down, where it breaks, and why. It works from the CLI and from the web dashboard. Every number comes from real requests. AI can help set up a test, but it never produces results.

## What it looks like

```bash
# 50 requests per second against one endpoint for 2 minutes
jetic load --endpoint "GET /orders" --rate 50/s --duration 2m

# Real checkout sessions, ramping up to 200 per second over 5 minutes
jetic load --workflow checkout --ramp 0:200/s@5m

# Mixed traffic across the whole system, failing CI if it gets too slow
jetic load --mix checkout=70,browse=30 --rate 100/s --duration 10m \
           --threshold "p95<500ms" --threshold "errors<1%"
```

In the dashboard you set up the same test, press Start, watch it live on charts, and get a report you can compare against earlier runs.

## Ground rules

1. **Nothing is made up.** Every number is measured from real requests or real server data. If we didn't measure something, the report says "not measured".
2. **Every number shows how precise it is.** The report states how each figure was measured, so a reader can trust it or question it.
3. **AI sets up tests; it never reports results.** AI can turn "simulate 500 shoppers on staging" into a test plan and start it. Results and diagnoses come only from the engine.
4. **Traffic behaves like real users.** Each simulated user has its own session: its own login, its own IDs and its own data.
5. **Jetic admits its own limits.** If the testing machine itself was the bottleneck, the report says so instead of blaming the server.
6. **Symptoms are facts; causes are labeled.** "Requests timed out at 210 req/s" is a fact. "Probably CPU-bound" is marked as a guess unless server data confirms it.

## What we measure

For every request:

- **Total time**, plus where the time went: connecting, waiting for the server, downloading the response. This tells you whether the delay is network or server work.
- **Result:** the status code, or the kind of failure (refused, reset, timeout, wrong status, and so on).

For the whole run:

- **Speed:** typical (p50), slow (p95), very slow (p99) and worst-case response times, overall and per endpoint, workflow and workflow step.
- **Throughput:** how many requests per second we tried to send, and how many the server actually handled.
- **Errors**, grouped by kind, with when they started and stopped.
- **A second-by-second timeline** of all of the above, so you can see *when* things went wrong.
- **The tester's own health**, so we can tell whether Jetic, not the server, was the bottleneck.

### Optional: data from inside the server

From outside, Jetic can't see the server's CPU, memory or database. If you want that, you can switch on one of these. Each is opt-in:

| Source | What it adds |
| --- | --- |
| Local process | CPU and memory of a server running on your machine |
| Docker | CPU and memory against the container's limits, crashes, restarts |
| Prometheus | Whatever metrics your app already exports |
| Jetic probe (one line in a Node app) | Event-loop delay, memory, garbage-collection pauses |

Without these, the report says "no server data" and any guess about causes stays labeled as a guess.

## Finding failures and fixing them

### What Jetic can tell from the outside

| What we see | What it means |
| --- | --- |
| Connection refused | The server is down or on the wrong port |
| Connections cut off mid-test | The server crashed or restarted, or a proxy dropped connections. We know exactly when |
| Timeouts | The server accepted requests but stopped answering: overloaded or stuck |
| 502 / 503 / 504 | A gateway or upstream service failed |
| 429 | A rate limiter kicked in, and at what load |
| Throughput stops rising while response times shoot up | The server is at capacity, and we know the exact load where it happened |
| Errors continue after traffic drops | The server didn't recover |
| One endpoint or step slows down before the others | That is where the bottleneck is |

### Turning symptoms into recommendations

A set of written rules (code anyone can read and review, not AI) turns the measurements into findings. For example:

> **POST /orders maxes out at 210 requests/second.**
> Evidence: throughput stuck at 210/s from minute 4 while we sent up to 400/s; slow responses went from 18 ms to 760 ms; server CPU at 100% of one core over the same period.
> **Confirmed** (server data agrees).
> Likely cause: heavy work blocking the Node event loop.
> Suggested fixes: profile the handler; move heavy work to worker threads; run more processes.

- A rule only fires when its evidence exists, and every finding links to that evidence on the charts.
- Fixes come from a maintained library, not generated text.
- Jetic can suggest **follow-up tests** to narrow things down, such as "run only this endpoint" or "run at half the load". These are also real, measured runs. Against remote servers they always ask before running.

## The dashboard

A new **Load** page:

- **Set up:** pick endpoints or workflows from your project, the traffic pattern, the duration and pass/fail limits.
- **Live:** charts for requests per second, response times, active users, errors and, if enabled, server CPU and memory. A Stop button.
- **Report:** response-time distribution, timeline, slowest endpoints and steps, errors, pass/fail, and findings with links that highlight the moment on the charts.
- **Compare:** two runs side by side, for example before and after a fix.

## Where AI fits

Through Jetic's AI integration (MCP), an assistant can:

- turn a plain-English request into a test plan, which Jetic checks before running;
- start, watch and stop tests;
- explain findings in plain language and suggest follow-up tests.

It can't write or change results. It only reads and quotes what Jetic measured.

## "What if my server had 6 GB instead of 12 GB?"

Jetic can't make a server act as if it had less memory by sending it traffic. The honest way is to run your server inside a container with real limits (say 6 GB / 2 CPUs, then 12 GB / 4 CPUs), run the same test on each, and compare the measured results. This needs Docker and comes in a later phase. We won't offer predictions.

## Concerns we found, and how the design handles them

We reviewed the first draft critically. This is what came up.

| Concern | Why it matters | What we do |
| --- | --- | --- |
| **Build our own tester or use an existing one (k6, Artillery)?** | Existing tools are proven, but they're separate programs, and we would have to translate workflows into their format. That creates yet another copy of the workflow logic, and Jetic's existing copies already disagree in places. | Build our own, sharing the workflow logic Jetic already has. Revisit a k6 export later for very large tests. |
| **The current workflow runner isn't precise enough** | It measures time in whole milliseconds with a clock that can jump, keeps every response in memory (runs out of memory under load), and all users would share one memory file and overwrite each other's data. | Pull the step logic out into one shared piece with a precise clock, per-user memory, and no stored responses during load tests. |
| **The tester can distort its own results** | If the server runs on the same laptop, they compete for CPU. If the dashboard runs the test, drawing the UI could slow the measurements. | Every report states when the server shared the machine. Tests run in background workers, separate from the dashboard. Jetic tracks its own load and flags runs where it was the bottleneck. |
| **"Fixed number of users" tests hide problems** | If the server slows down, fixed users simply send fewer requests, so the test looks better than reality. Real users keep arriving regardless. | The default is to send traffic at a set rate, like real arrivals. Fixed-user tests are still available but carry a warning. Requests we couldn't send are counted. |
| **Some workflows can't run unattended** | A workflow that waits for an OTP or another human input would stall a load test. | Jetic checks the workflow before sending any traffic and rejects it unless the inputs are pre-filled. |
| **Tests started in different places** | The CLI, the dashboard and the AI integration are separate programs. | Every run writes to its own folder, which is updated each second while it runs. Any of them can watch any run live. |
| **Diagnoses could mislead people** | A confident wrong answer is worse than no answer. | Findings are confirmed or labeled as guesses, always show their evidence, and come from reviewable rules. AI can only quote them. |
| **Hitting production by accident** | A load test against production uses real resources and may create real data (for example real orders). | Remote servers require an explicit flag and confirmation, safe default caps apply, the plan warns what data it will create, and a run can always be stopped. |
| **Too big to contribute in one go** | One giant PR is hard to review and slow to merge. | It is split into seven PRs. The first changes no behavior at all. |

## Risks we still carry

- **Detailed timing depends on Node internals.** The breakdown into connect, wait and download relies on hooks that have changed between Node versions. If they aren't available, the report says "unavailable" rather than guessing; we can fall back to a lower-level method.
- **One machine has a ceiling.** For very fast servers, a single machine may not generate enough traffic. Jetic will say so; spreading tests across machines is out of scope for now.
- **Rules can be wrong for unusual setups.** Guesses are labeled, evidence is shown, and rules are versioned and tested, so mistakes are visible and fixable.

## Plan

| Step | What ships |
| --- | --- |
| 1 | Groundwork: share the workflow step logic and give each user separate memory. No visible change. |
| 2 | The load engine and the `jetic load` command, with pass/fail limits for CI. |
| 3 | The dashboard Load page: set up, live view, report, compare. |
| 4 | AI integration (MCP tools). |
| 5 | Findings and recommended fixes, recovery checks, follow-up tests, "find my limit" mode. |
| 6 | Server data sources (local process, Docker, Prometheus, Jetic probe). |
| 7 | Server size comparison with Docker resource limits. |

## How we make sure the numbers are right

- A test server with a known, fixed delay must be reported within a tight tolerance.
- Percentile calculations are checked against exact answers on known data.
- Test servers that crash, refuse, time out, rate-limit or max out at a known rate must each produce exactly the expected finding.
- Jetic's existing test suites must keep passing after the groundwork step.

## Decisions to make

1. **Command name:** `jetic load` or `jetic perf`.
2. **Charts in the dashboard:** build small charts ourselves (no new dependency) or add a chart library.
3. **Percentile maths:** write our own small implementation (no new dependency) or use an existing library.

## Glossary

- **p50 / p95 / p99:** the response time that 50%, 95% or 99% of requests were faster than. p95 is the "slow but not rare" experience; p99 is the worst 1 in 100.
- **Throughput:** requests the server completes per second.
- **Workflow:** a recorded sequence of API calls that represents a real user task.
- **Virtual user:** one simulated person running a workflow, with their own session.
- **Generator-bound:** the testing machine, not the server, was the limit, so the numbers understate the server.
- **MCP:** the protocol AI assistants use to call Jetic's tools.
