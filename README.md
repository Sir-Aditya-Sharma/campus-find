# Campus Find

Campus Find is a beginner-friendly lost-and-found web app with:
- Student/Faculty login
- Admin dashboard for account/report review
- Report posting, approval, and return tracking

## Important account access note

Public registration is disabled.  
Only administrator-created accounts can log in.

## Runtime assumptions

- Node.js `>=20.19.0`
- MongoDB (local or Atlas)

## Setup

1. Copy environment values:
   - Use `.env.example` as the template.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the backend:
   ```bash
   npm start
   ```
4. Open:
   - `index.html` for user UI
   - `admin/admin.html` for admin dashboard

## Environment variables

- `MONGO_URI` (required)
- `JWT_SECRET` (required)
- `ADMIN_EMAIL` (required for configured admin compatibility)
- `ALLOWED_ORIGINS` (required in production; comma-separated origins)
- `NODE_ENV` (`production` or `development`)

In development, localhost origins are allowed by default.  
In production, the server exits if `ALLOWED_ORIGINS` is not configured.

## Security notes

- Authenticated requests re-check live user status from MongoDB.
- Password reset and account disabling revoke older JWT sessions.
- JWT access token lifetime is shorter than before (`12h`).
- The frontend currently stores JWTs in `localStorage` for compatibility with the existing UI.  
  This means XSS would still be high impact; moving to HttpOnly cookies is a future hardening step.

## Validation / checks

Run syntax checks:
```bash
npm run check
```

Backend-only check:
```bash
cd backend && npm run check
```
