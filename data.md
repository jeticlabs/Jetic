Um, so for my, for model page, you know that model page in the local CLI dashboard that shows all the endpoints, everything. So I want to add a button to be able to add endpoint into the model.json. So tell me the things I should ask for, and, or like give me how it should look like a default one that will work with any API. You get? It should be able to work with any API endpoint. Maybe add, like maybe request body, I don't know. Like, what do you feel?

Yes Love, I get exactly what you mean. Your Models page is basically Jetic's API model/schema view, and the “Add Endpoint” button should let a developer manually describe any API operation without forcing them into a specific framework.

My strongest recommendation: don't make the form too complex initially. Use a simple form with sensible defaults, then reveal advanced options progressively.

The button
+ Add Endpoint

Clicking it opens something like:

┌─────────────────────────────────────────────────────┐
│ Add Endpoint                                    ×   │
│                                                     │
│ BASIC                                               │
│                                                     │
│ Method       [ POST ▼ ]                             │
│                                                     │
│ Path         [/api/users                       ]    │
│                                                     │
│ Name         [ Create User                      ]    │
│                                                     │
│ Description  [ Creates a new user               ]    │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ REQUEST                                             │
│                                                     │
│ Query Parameters        [ + Add Parameter ]         │
│ Path Parameters         [ + Add Parameter ]         │
│ Headers                 [ + Add Header ]            │
│ Request Body                                          │
│                                                     │
│ Content Type [ application/json ▼ ]                 │
│                                                     │
│ {                                                   │
│   "name": "John"                                    │
│ }                                                   │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ RESPONSES                                           │
│                                                     │
│ Expected Status [ 201 ]                             │
│                                                     │
│ Response Body Schema                                │
│                                                     │
│ [ Generate from example ]                           │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│        [ Cancel ]       [ Add Endpoint ]            │
└─────────────────────────────────────────────────────┘
What should be required?

For an endpoint to exist, I would require only:

Method
Path

That's it.

Everything else should be optional.

So the absolute minimum could be:

Method: POST
Path: /users

And Jetic can create a valid endpoint model automatically.

My recommended model.json structure

Something like this:

{
  "version": "1",

  "baseUrl": "http://localhost:3000",

  "endpoints": [
    {
      "id": "create-user",

      "method": "POST",

      "path": "/users",

      "name": "Create User",

      "description": "Creates a new user",

      "request": {
        "headers": {},

        "query": {},

        "pathParams": {},

        "body": {
          "contentType": "application/json",

          "schema": {}
        }
      },

      "responses": [
        {
          "status": 201,

          "description": "User created",

          "body": {
            "contentType": "application/json",

            "schema": {}
          }
        }
      ]
    }
  ]
}

This is generic enough for virtually any HTTP API.

But parameters should NOT just be key/value

This is important.

Don't store:

{
  "limit": "10"
}

Because Jetic needs to understand what limit actually is.

Instead:

{
  "name": "limit",

  "in": "query",

  "type": "integer",

  "required": false,

  "description": "Maximum number of results",

  "example": 10
}

I would unify all parameters into one array.

{
  "parameters": [
    {
      "name": "id",
      "in": "path",
      "type": "string",
      "required": true
    },

    {
      "name": "limit",
      "in": "query",
      "type": "integer",
      "required": false
    },

    {
      "name": "Authorization",
      "in": "header",
      "type": "string",
      "required": true
    }
  ]
}

This is cleaner.

The "Add Parameter" UI

Instead of separate complicated forms:

+ Add Parameter

Opens:

Name         [ limit                    ]

Location     [ Query ▼                  ]

Type         [ Integer ▼                ]

Required     [ ○ Yes  ● No ]

Description  [ Maximum number of results ]

Example      [ 10                       ]

Location options:

Query
Path
Header
Cookie

That covers the standard HTTP parameter locations.

Request Body should support any API format

This is where you need to be flexible.

Your dropdown:

Content Type

application/json
application/x-www-form-urlencoded
multipart/form-data
text/plain
application/xml
application/octet-stream

Then the UI changes.

JSON
{
  "email": "test@example.com",
  "password": "secret"
}
Form URL encoded
email       test@example.com
password    secret
Multipart
email       test@example.com
avatar      [ File ]
document    [ File ]

This is important because Jetic will eventually simulate all of these.

The body should have Schema + Example

I think this is a major feature.

Instead of only:

{
  "email": "john@example.com"
}

Store both the schema and an example.

{
  "contentType": "application/json",

  "schema": {
    "type": "object",

    "properties": {
      "email": {
        "type": "string",
        "format": "email"
      },

      "password": {
        "type": "string"
      }
    },

    "required": [
      "email",
      "password"
    ]
  },

  "example": {
    "email": "test@example.com",
    "password": "password123"
  }
}

Why?

Because your AI can understand:

email
  type: string
  format: email
  required

password
  type: string
  required

Then Jetic can generate dynamic data:

email → faker.internet.email()
password → faker.internet.password()

This fits perfectly with your simulation system.

The endpoint object I would ultimately use
{
  "id": "create-user",

  "name": "Create User",

  "description": "Creates a new user account",

  "method": "POST",

  "path": "/users",

  "parameters": [
    {
      "name": "ref",

      "in": "query",

      "schema": {
        "type": "string"
      },

      "required": false
    },

    {
      "name": "Authorization",

      "in": "header",

      "schema": {
        "type": "string"
      },

      "required": false
    }
  ],

  "requestBody": {
    "required": true,

    "content": {
      "application/json": {
        "schema": {
          "type": "object",

          "properties": {
            "email": {
              "type": "string",
              "format": "email"
            },

            "password": {
              "type": "string"
            }
          },

          "required": [
            "email",
            "password"
          ]
        },

        "example": {
          "email": "test@example.com",
          "password": "password123"
        }
      }
    }
  },

  "responses": {
    "201": {
      "description": "User created",

      "content": {
        "application/json": {
          "schema": {
            "type": "object",

            "properties": {
              "id": {
                "type": "string"
              },

              "email": {
                "type": "string"
              }
            }
          }
        }
      }
    },

    "400": {
      "description": "Invalid request"
    }
  }
}

Notice something important: this structure is deliberately very close to OpenAPI concepts.

I would strongly recommend that, Love.

Not necessarily because Jetic should be OpenAPI, but because if your model structure maps closely to OpenAPI, then later you can:

OpenAPI
   ↓
Import
   ↓
Jetic model.json

And:

Jetic model.json
   ↓
Export
   ↓
OpenAPI

That is a huge advantage.

What the default "Add Endpoint" should create

If the user enters only:

Method: POST
Path: /users

Jetic could generate:

{
  "id": "post-users",

  "name": "POST /users",

  "method": "POST",

  "path": "/users",

  "parameters": [],

  "responses": {}
}

That should be your default.

Then developers can progressively add:

Basic
  ✓ Method
  ✓ Path

Optional
  + Name
  + Description
  + Parameters
  + Request Body
  + Responses
  + Authentication
  + Tags
I would structure the Add Endpoint modal into tabs

This will keep the UI clean.

┌─────────────────────────────────────────┐
│ Add Endpoint                        ×   │
│                                         │
│ [ Basic ] [ Request ] [ Responses ]     │
│                                         │
└─────────────────────────────────────────┘
Basic
Method
Path
Name
Description
Tags
Request
Parameters

Request Body

Content Type

Schema

Example
Responses
Status Code

Description

Headers

Content Type

Body Schema

Example

Then an expandable:

Advanced ▼

Containing:

Authentication
Timeout
Deprecated
Custom metadata
My strongest recommendation

Make the Jetic endpoint model "OpenAPI-compatible in spirit", but don't force developers to fill an OpenAPI document.

The UI should feel as easy as:

POST
/users

while Jetic internally supports:

HTTP method
URL/path
Path parameters
Query parameters
Headers
Cookies
Authentication
Any request content type
Any request body
Multiple response codes
Response headers
Multiple response content types
Response schema
Examples
Metadata

That gives your Models page a universal representation of an API endpoint, which is exactly what your AI agent, workflow generator, simulator, and tool runtime will need.