# Plan: Fix Embed API Widget CORS Error

## Objective
Fix the CORS error preventing the `clara.js` embed widget from successfully communicating with the `/api/embed/*` endpoints. The issue is caused by the frontend using `credentials: "include"` while the backend is missing the required `Access-Control-Allow-Credentials: true` header and fails to dynamically echo the `Access-Control-Request-Headers` during preflight `OPTIONS` requests.

## Scope
- **IN SCOPE:**
  - Update `middleware.ts` to inject correct CORS headers for `/api/embed` routes.
  - Update `validate-embed.ts` utility to inject correct CORS headers.
  - Update route handlers in `api/embed/*/route.ts` to pass required request headers to the CORS utility functions.
- **OUT OF SCOPE:**
  - Any changes to standard API routes (`/api/kbs`, etc.).
  - Changes to the frontend widget code (`clara.js`), as `credentials: "include"` is the intended behavior.
  - Changing the origin validation logic (database lookups).

## Technical Approach
The CORS handling for the embed API is split between global middleware (handling preflight) and route-specific handlers (handling GET/POST responses). Both need updating to fully resolve the issue.

1.  **Add Credentials Header**: Inject `Access-Control-Allow-Credentials: true` into both `EMBED_CORS_HEADERS` (in `middleware.ts`) and the generated headers in `buildCorsHeaders` (in `validate-embed.ts`). Note: This requires the `Access-Control-Allow-Origin` to NOT be `*`. The existing logic already handles echoing the specific origin, avoiding this illegal state.
2.  **Dynamic Headers**: The browser sends `Access-Control-Request-Headers` during the preflight. The server must echo these exact headers back in the `Access-Control-Allow-Headers` response, otherwise the actual request will be blocked. We need to update the signature of `applyEmbedCors` and `buildCorsHeaders` to accept these request headers dynamically, falling back to a default (`"Content-Type, Authorization"`) if none are provided.
3.  **Vary Header**: Because we are dynamically changing the `Access-Control-Allow-Headers` based on the request, we MUST update the `Vary` header to include `Access-Control-Request-Headers`. Failure to do so could lead to CDN/proxy cache poisoning where a response intended for one set of headers is served to a client requesting different headers.

## Tasks

### Task 1: Update `validate-embed.ts` and Embed Routes
**Description**: 
Update the core CORS utility and its call sites within the embed routes to handle dynamic headers and credentials.
1. Modify `buildCorsHeaders` in `clara-backend/src/modules/embed/core/validate-embed.ts` to accept `reqHeaders: string | null = null`.
2. Add `"Access-Control-Allow-Credentials": "true"` to the returned headers object.
3. Dynamically set `"Access-Control-Allow-Headers"` to `reqHeaders` or fallback to `"Content-Type, Authorization"`.
4. Update `"Vary"` to `"Origin, Access-Control-Request-Headers"`.
5. Update `handlePreflight` and `validateEmbedRequest` in `validate-embed.ts` to extract and pass `req.headers.get("access-control-request-headers")` down to `buildCorsHeaders`.
6. Update the route handlers (`clara-backend/src/app/api/embed/chat/route.ts`, `clara-backend/src/app/api/embed/config/route.ts`, `clara-backend/src/app/api/embed/session/route.ts`) to extract and pass `req.headers.get("access-control-request-headers")` when calling `buildCorsHeaders` directly.
**Delegation**: `task(category="quick", load_skills=["code-review"])`

### Task 2: Update `middleware.ts`
**Description**: 
Update the Next.js middleware that handles the initial `OPTIONS` preflight requests for the embed routes.
1. Modify `applyEmbedCors` in `clara-backend/src/middleware.ts` to accept `reqHeaders: string | null`.
2. Add `"Access-Control-Allow-Credentials": "true"`.
3. Dynamically set `"Access-Control-Allow-Headers"` to `reqHeaders` or fallback to `"Content-Type, Authorization"`.
4. Update `"Vary"` to `"Origin, Access-Control-Request-Headers"`.
5. Update the two call sites for `applyEmbedCors` within the `middleware` function to pass `request.headers.get("access-control-request-headers")`.
**Delegation**: `task(category="quick", load_skills=["code-review"])`

## Final Verification Wave

### Task 3: Build Verification and Testing
**Description**: 
Ensure the changes are type-safe and perform manual/automated verification.
1. Run `npx tsc --noEmit` from the `clara-backend` directory to verify no TypeScript signature mismatches were introduced across the route handlers.
2. (Optional but recommended) Run a `curl` preflight check against a local dev instance if available: `curl -I -X OPTIONS -H "Origin: https://example.com" -H "Access-Control-Request-Headers: x-custom-header" http://localhost:3000/api/embed/chat`. Verify `Access-Control-Allow-Credentials: true` and `Access-Control-Allow-Headers: x-custom-header` are present.
3. Commit changes atomically.
**Delegation**: `task(category="quick", load_skills=["git-master"])`
