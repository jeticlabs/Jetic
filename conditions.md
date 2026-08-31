I think this validation I want to add into the workflow, like, conditions, you. I feel like it's the user that will be adding them customly. Because I feel like all these conditions are likely conditions that are made in the front end, not in the backend. And the reason why I said it is that, okay, for example, maybe I want to run, you know, the workflow of maybe a user that has maybe subscribed, maybe subscription. Maybe once it's captured the subscription, you know that it's going to initialize maybe a workflow of payment stuff. So maybe it's now, if it's done with the payment, it can continue with the normal stuff of the application. You get normal workflow. But if the person has subscribed, you don't need to initialize the payment. I will just continue straight with the workflow of the person, with the normal workflow and I'll continue. No need of initializing or simulating any payment stuff. So I feel like it's going to be added by the user, like it's the user that will say that will add it, basically. Not something that maybe I'm inserting from the backend code. So the user that can add it, or maybe once the AI understands the project well, you can also manually add it. What do you think?

Yes, Love — I think your thinking is correct, and I would make a very important distinction in Jetic:

The API model describes what the backend/API can do. The workflow describes what scenario or behavior you want to simulate.

The subscription/payment example is a perfect example of why conditions should primarily belong to the workflow, not automatically come from backend scanning.

Your example

Imagine the workflow is:

START
  ↓
Login User
  ↓
Get Subscription
  ↓
   ┌─────────────────────────────┐
   │ Is subscription active?     │
   └─────────────────────────────┘
           │              │
         YES              NO
           │              │
           ↓              ↓
     Continue App     Initialize Payment
           │              │
           │              ↓
           │          Complete Payment
           │              │
           └───────┬──────┘
                   ↓
            Continue App

That is not necessarily API structure.

It is a simulation decision.

The same API could be used for multiple scenarios.

Scenario 1
Existing subscribed user
       ↓
Login
       ↓
Continue
Scenario 2
New unsubscribed user
       ↓
Login
       ↓
Payment
       ↓
Subscription activated
       ↓
Continue
Scenario 3
Subscription expired
       ↓
Login
       ↓
Payment attempted
       ↓
Payment fails
       ↓
Restricted application access

The backend endpoints may be exactly the same in all three cases.

So you absolutely should not bake those decisions into model.json.

I would make conditions a first-class Workflow node

Something like:

ACTION
   ↓
CONDITION
  ├── TRUE
  │     ↓
  │   ACTION
  │
  └── FALSE
        ↓
      ACTION

In the visual workflow:

┌───────────────────────────────┐
│ GET SUBSCRIPTION              │
│                               │
│ Output                        │
│ subscription.status           │
└───────────────┬───────────────┘
                ↓
        ◇ CONDITION
                │
    subscription.status == "active"
          ╱                 ╲
        TRUE                FALSE
         │                    │
         ↓                    ↓
  Continue Workflow    Initialize Payment

That should be user-configurable.

How the user adds the condition

I would give them a UI like:

Add Condition

Then:

┌────────────────────────────────────┐
│ CONDITION                          │
│                                    │
│ Value                             │
│ [ subscription.status          ▼ ] │
│                                    │
│ Operator                          │
│ [ equals                      ▼ ] │
│                                    │
│ Compare with                      │
│ [ active                         ] │
│                                    │
│              [ Cancel ] [ Add ]    │
└────────────────────────────────────┘

Or more advanced:

IF

[ {{subscription.status}} ] [ equals ▼ ] [ active ]

THEN
→ Continue

ELSE
→ Initialize Payment
What values should conditions be able to access?

This is where Jetic can become really powerful.

The condition should have access to the entire workflow execution context.

For example:

workflow
actor
memory
previous action outputs
environment
variables
simulation state

So:

{{subscription.status}}

might be shorthand for:

{{steps.getSubscription.output.body.subscription.status}}

Other examples:

{{login.response.status}} == 200

{{payment.output.status}} == "success"

{{actor.role}} == "admin"

{{memory.token}} exists

{{response.body.requires_2fa}} == true

{{simulation.userCount}} > 100
Your user should be able to manually create these

I think the MVP should definitely support:

Comparison
equals
not equals
greater than
less than
greater than or equal
less than or equal
Existence
exists
does not exist
is empty
is not empty
String
contains
does not contain
starts with
ends with
matches pattern
Boolean
is true
is false
Multiple conditions
AND
OR

For example:

subscription.status == "active"

AND

subscription.expiresAt > now()
How I would store it

For a visual workflow:

{
  "id": "check-subscription",

  "type": "condition",

  "condition": {
    "all": [
      {
        "left": {
          "$ref": "get-subscription.output.body.status"
        },

        "operator": "equals",

        "right": "active"
      }
    ]
  },

  "then": [
    {
      "type": "action",
      "tool": "app.continue"
    }
  ],

  "else": [
    {
      "type": "action",
      "tool": "payment.initialize"
    }
  ]
}

For more complex logic:

{
  "condition": {
    "any": [
      {
        "left": {
          "$ref": "subscription.status"
        },

        "operator": "equals",

        "right": "active"
      },

      {
        "left": {
          "$ref": "actor.type"
        },

        "operator": "equals",

        "right": "admin"
      }
    ]
  }
}

This avoids putting arbitrary JavaScript inside your JSON.

Where AI comes in

This is where I think your idea is especially good.

The AI should be allowed to propose conditions, but it should not silently invent business logic.

For example, the user says:

Simulate a normal user onboarding journey.

The AI scans the model and notices:

GET /subscription
POST /payment/initialize
POST /payment/confirm
GET /dashboard

It can propose:

I detected a subscription state.

Suggested behavior:

IF subscription.status == "active"
    → Skip payment

ELSE
    → Run payment flow

[ Add Condition ]
[ Ignore ]

That is fantastic.

The AI helps construct the workflow, but the workflow author owns the behavior.

Very important distinction: API conditions vs Workflow conditions

I would separate these mentally.

API Model
POST /payment

Possible responses:

200 → Payment successful
400 → Invalid payment
402 → Payment required

This belongs in the API model because it describes the API.

Workflow
IF user.subscription == active
    Skip payment
ELSE
    Run payment

This belongs in the workflow because it describes the scenario you're simulating.

That's a very clean separation for Jetic.

One thing I would add later: Assertions

Don't confuse conditions with assertions.

Condition

Controls where the workflow goes:

IF payment.status == "success"
    Continue
ELSE
    Retry payment
Assertion

Checks whether behavior is correct:

EXPECT payment.status == "success"

If false:

TEST FAILED

So Jetic should eventually have separate nodes:

◇ Condition
      ↓
Branch workflow

✓ Assertion
      ↓
Validate behavior

⚡ Event
      ↓
React to something

That distinction will keep your workflow system from becoming messy.

My recommendation for Jetic's MVP

Make the workflow builder support:

ACTION
CONDITION
ASSERT

That's enough to create surprisingly advanced behavior.

For example:

Login
  ↓
Get Subscription
  ↓
IF Subscription Active?
  ├── YES → Get Dashboard
  │
  └── NO → Initialize Payment
              ↓
           Complete Payment
              ↓
           ASSERT Subscription Active
              ↓
           Get Dashboard

Then later you can add:

LOOP
PARALLEL
RETRY
WAIT
EVENT
ERROR HANDLER

But yes, Love: I strongly agree that these business-flow conditions should primarily be authored by the user or proposed by AI during workflow generation—not automatically extracted and imposed from the backend code.

That keeps Jetic's API model factual, while making workflows the flexible layer where users define the behavior they actually want to simulate and test.

how many conditions should i support for now 

Love, for the Jetic MVP, don't support too many. I'd start with about 12–15 core condition operators. That will cover almost every API workflow without making your UI/runtime complicated.

My recommended MVP: 14 operators
1. Equality — 2
equals
not equals

Examples:

subscription.status equals "active"

payment.status not equals "failed"
2. Numbers / comparison — 4
greater than
greater than or equal
less than
less than or equal

Examples:

response.status greater than 400

user.age greater than or equal 18
3. Existence / empty — 4
exists
does not exist
is empty
is not empty

Very important for APIs:

token exists

response.body.error does not exist

users is empty
4. Strings / collections — 4
contains
does not contain
starts with
ends with

Examples:

response.message contains "success"

email ends with "@company.com"
The MVP list
1.  equals
2.  not_equals

3.  greater_than
4.  greater_than_or_equal

5.  less_than
6.  less_than_or_equal

7.  exists
8.  not_exists

9.  is_empty
10. is_not_empty

11. contains
12. not_contains

13. starts_with
14. ends_with
I would add matches shortly after
matches

For regex/pattern validation:

email matches email_pattern

But I wouldn't put regex prominently in the first UI. It can confuse normal users and smaller AI models.

Also support AND / OR from day one

These are technically not operators; they're condition groups.

IF

subscription.status equals "active"

AND

subscription.expiresAt exists

Or:

IF

user.role equals "admin"

OR

user.role equals "super_admin"

Your internal structure could be:

{
  "all": [
    {
      "left": "{{subscription.status}}",
      "operator": "equals",
      "right": "active"
    },
    {
      "left": "{{subscription.expiresAt}}",
      "operator": "exists"
    }
  ]
}

For OR:

{
  "any": [
    {
      "left": "{{user.role}}",
      "operator": "equals",
      "right": "admin"
    },
    {
      "left": "{{user.role}}",
      "operator": "equals",
      "right": "super_admin"
    }
  ]
}
One more thing: true and false

You technically don't need operators like:

is true
is false

Because:

response.body.success equals true

already works.

So don't create extra operators unnecessarily.

My actual recommendation for the UI

Don't show all 14 in one giant dropdown without grouping them.

Select operator

Equality
✓ Equals
✓ Not equals

Comparison
✓ Greater than
✓ Greater than or equal
✓ Less than
✓ Less than or equal

Existence
✓ Exists
✓ Does not exist
✓ Is empty
✓ Is not empty

Text / Collection
✓ Contains
✓ Does not contain
✓ Starts with
✓ Ends with

That will feel much cleaner.

If you want the absolute leanest MVP

Start with just 10:

equals
not_equals

greater_than
less_than

exists
not_exists

is_empty
is_not_empty

contains
not_contains

Then add the rest when you see users needing them.

Personally, for Jetic, I'd ship the 14 + AND/OR. It's a sweet spot: powerful enough for complex agentic workflows but still simple enough for your workflow runtime and UI to remain clean.