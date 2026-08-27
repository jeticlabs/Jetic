Absolutely, Love. For Jetic as it is now, I’d make the sidebar much more focused around one idea:

Build → Run → Observe → Debug agent behavior.

I would not make it look like a generic observability dashboard or like Mastra Studio yet.

Updated Jetic local Studio
┌─────────────────────────────┐
│  ◈ JETIC                    │
│  my-agent        ● Local    │
├─────────────────────────────┤
│                             │
│  WORKSPACE                  │
│  ◉ Overview                 │
│  ◇ Scenarios                │
│  ▶ Runs                     │
│                             │
│  AGENT                      │
│  ◎ Agents                   │
│  ◌ Tools                    │
│  ◇ Context                  │
│  ♢ Memory                   │
│                             │
│  ENVIRONMENT                │
│  ◈ APIs                     │
│  ✉ Email                    │
│  ◎ OAuth                    │
│  ⚡ Webhooks                │
│                             │
│  OBSERVABILITY              │
│  ≋ Traces                   │
│  ◫ Events                   │
│                             │
├─────────────────────────────┤
│  ✦ Jetic Assistant          │
│                             │
│  ⚙ Settings                 │
│  ? Docs                     │
└─────────────────────────────┘

I would actually make Environment collapsible, because Email/OAuth/Webhooks are capabilities that will grow.

What each section should contain
1. Overview

This is the first screen.

Not a bunch of meaningless metrics.

Show the developer:

Good morning 👋

PROJECT
my-agent

─────────────────────────────

  Tests        Pass rate       Agents
    48           93.7%            3

─────────────────────────────

Recent runs

✓ Password reset       2.4s
✓ OAuth login          4.1s
✕ Checkout flow        8.7s
✓ User invitation      3.2s

─────────────────────────────

Environment

API          Connected
Email        Running
OAuth        Running
Webhooks     Running

And a big:

▶ Run a scenario

button.

2. Scenarios ⭐

This should be one of the most important pages.

A scenario represents what you're asking the agent to accomplish.

Example:

Scenarios

┌──────────────────────────────────────┐
│ Password Reset                       │
│ Verify an agent can recover account  │
│                                      │
│ API → Email → Browser → API          │
│                        ✓ 12 runs     │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ OAuth Login                          │
│ Complete OAuth PKCE authentication   │
│                                      │
│ API → OAuth → API                    │
│                        ✓ 8 runs      │
└──────────────────────────────────────┘

And:

+ New Scenario

Eventually the Assistant can generate one:

"Create a scenario that tests password reset."

3. Runs ⭐⭐⭐

This is probably your most important page initially.

Show:

Runs

✓ Password Reset          2.4s
  Aug 22, 05:02

✕ OAuth Login             4.8s
  Aug 22, 04:58

✓ User Invitation         3.1s
  Aug 22, 04:42

Click a run and you enter the execution timeline.

Agent started
      ↓
POST /login
      ↓
401 Unauthorized
      ↓
Agent requested password reset
      ↓
POST /forgot-password
      ↓
Email received
      ↓
Reset URL extracted
      ↓
POST /reset-password
      ↓
Login
      ↓
✓ Test passed

This is where Jetic starts feeling special.

4. Agents

Show the agents configured in the project.

Agents

Customer Support Agent
● Ready

Checkout Agent
● Ready

Admin Agent
● Ready

Click one:

Customer Support Agent

Model
GPT-5.6

Tools
  search_customer
  create_ticket
  refund_payment
  send_email

Memory
  PostgreSQL

Context
  customer
  organization
  conversation

Eventually you can show agent configuration, capabilities and permissions here.

5. Tools

This is where you show what the agent can actually call.

Tools

search_customer
POST /customers/search

create_ticket
POST /tickets

send_email
POST /email

refund_payment
POST /payments/refund

Clicking a tool should show:

Schema
Input
Output
Authentication
Invocation history
Failures
Which agents use it

This is very useful for debugging.

6. Context

This should be live agent state.

Example:

Context

USER
email
john@example.com

user_id
usr_9281

AUTH
authenticated: true

organization
Acme Inc.

role
admin

CURRENT TASK
Reset password

CURRENT STEP
Waiting for reset email

This is different from observability.

You're showing:

What does the agent currently know?

7. Memory

Separate this from Context.

Context = current state.

Memory = retained information.

Example:

Memory

User Preferences
────────────────────
Prefers email communication

Previous Interactions
────────────────────
Password reset failed
2026-08-20

Known Facts
────────────────────
User belongs to Acme Inc.

And eventually let developers inspect:

short-term memory
long-term memory
retrieved memories
memory writes
memory retrieval
8. APIs ⭐

This should become the gateway into the application's API surface.

APIs

My API
Connected

Endpoints

POST   /auth/login
POST   /auth/refresh
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /users/:id
POST   /payments

Click an endpoint:

POST /auth/forgot-password

Schema
Authentication
Headers
Request
Response
Examples

Used by:
  Password Reset Scenario
  Customer Agent

Eventually Jetic can import OpenAPI automatically.

9. Email ⭐⭐⭐

This is one of the things I'd prioritize because of your friend's feedback.

Email

Inbox
────────────────────

● Password Reset
  From: security@app.com
  To: test-user@inbox.jetic.dev
  05:02

● Welcome to Acme
  From: hello@app.com
  04:58

Click it:

Password Reset

From:
security@app.com

To:
test-user@inbox.jetic.dev

Subject:
Reset your password

────────────────────

Reset your password...

[Reset Password]

────────────────────

Extracted links:
→ /reset-password?token=...

Now the agent can actually read and act on email.

That's a killer feature.

10. OAuth ⭐⭐⭐

Make this an environment simulator.

OAuth

Providers

Google       ● Running
GitHub       ● Running
Microsoft    ○ Disabled

────────────────────

Active Sessions

Google
john@example.com

Scopes:
openid
email
profile

Token:
Valid

Expires:
14m 32s

Eventually developers can deliberately inject failures:

Simulate

☐ User denies consent
☐ Expired authorization code
☐ Invalid state
☐ Invalid PKCE
☐ Missing scope
☐ Expired token
☐ Revoked refresh token

Now Jetic becomes really interesting.

11. Webhooks
Webhooks

Incoming

✓ payment.completed
✓ user.created
✕ payment.refunded

Recent Events

payment.completed
2 seconds ago

Status: Delivered

Attempts: 1

And eventually:

Replay

Delay

Duplicate

Corrupt payload

Invalid signature

This becomes part of your agent testing environment.

12. Traces ⭐⭐⭐

This is your deep debugging interface.

Think:

TRACE #1827

Agent
 ↓
Tool
 ↓
HTTP
 ↓
Email
 ↓
Tool
 ↓
HTTP
 ↓
Assertion

Each node can be opened.

For example:

POST /forgot-password

Request
────────────────
email: john@example.com

Response
────────────────
200 OK

Duration
────────────────
183ms

Context before
────────────────
authenticated: false

Context after
────────────────
reset_requested: true

This is where developers figure out why the agent behaved the way it did.

13. Events

This is lower-level than traces.

Events

05:02:31  agent.started
05:02:32  tool.called
05:02:32  api.request
05:02:32  api.response
05:02:34  email.received
05:02:35  browser.navigation
05:02:36  agent.completed

Useful for debugging weird race conditions and async behavior.

14. Jetic Assistant ⭐⭐⭐

I'd keep this persistent at the bottom, rather than making it a huge sidebar item.

Click:

✦ Jetic Assistant

and a panel opens.

You can say:

"Test password reset."

Jetic responds:

I found:

POST /forgot-password
POST /reset-password
POST /auth/login

Email environment is available.

I'll create:

1. Create test user
2. Request reset
3. Wait for email
4. Extract reset link
5. Reset password
6. Login
7. Verify old password fails

[Create Scenario]

That's much more compelling than a generic chatbot.

One major UI change I'd make

Don't make the sidebar feel like:

Dashboard / Analytics / Monitoring / Settings

Make it feel like a testing laboratory.

The hierarchy should visually communicate:

                 JETIC
                   │
          ┌────────┴────────┐
          │                 │
       SCENARIO           AGENT
          │                 │
          └────────┬────────┘
                   ↓
             ENVIRONMENT
                   ↓
               EXECUTION
                   ↓
                TRACE

That is the mental model I want the developer to understand within 10 seconds of opening Jetic.

And for your MVP, Love, I'd ship roughly these 10 things first:

Overview → Scenarios → Runs → Agents → Tools → Context → APIs → Email → Traces → Assistant

Then OAuth/Webhooks can come immediately after as you build those environment capabilities.