TRACE: Password Reset Flow
────────────────────────────────────

① POST /login
   ├─ Request
   ├─ Response 200
   └─ Capture: token
                │
                ▼
             MEMORY
             token = eyJ...

② WAIT FOR EMAIL
   ├─ Provider: Mailpit
   ├─ To: test@jetic.local
   ├─ Subject: Verify account
   └─ Capture: otp
                │
                ▼
             MEMORY
             otp = 482913

③ GENERATE TOTP
   ├─ Secret: ********
   └─ Capture: totp
                │
                ▼
             MEMORY
             totp = 193842

④ GET /profile
   ├─ Authorization:
   │    Bearer {{token}}
   └─ Response: 200