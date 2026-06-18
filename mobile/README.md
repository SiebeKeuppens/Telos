# Telos — Mobile (V2, Android)

The native client. **All programming logic stays in the Go API** (`../server`):
this app is a thin front end over the same `/api/v1` contract the web PWA uses,
so V2 is a new front end, not a rewrite.

Stack: **Expo (React Native) + TypeScript + expo-router**. Auth is Firebase
(same project as web, `travel-2d1bd`); writes go through an offline outbox that
flushes to `POST /sync`, exactly like the web client.

## This slice

A thin vertical slice that proves the end-to-end path:

**Sign in → Today → log a workout**, syncing to the same backend.

- `app/sign-in.tsx` — Firebase email/password.
- `app/today.tsx` — pulls `/me` + `/program`, shows today's (or the next) session.
- `app/workout/[id].tsx` — log sets with ± steppers; "Finish" marks the workout
  complete. Sets queue to an AsyncStorage outbox and flush to `/sync`.

Not yet ported: onboarding, Program/Log/Progress/Profile, warm-up checklist,
rest timer, RPE, kg/lb toggle UI, Google sign-in, Health Connect. The shared
`lib/` (theme tokens, types, api, auth, sync, units) is built to grow into them.

## Run it

```bash
cd Telos/mobile
npm install
cp .env.example .env      # fill in API base + Firebase web config
npm start                 # then press 'a' for Android, or scan the QR in Expo Go
```

### `.env`

| var | meaning |
|---|---|
| `EXPO_PUBLIC_API_BASE` | where the Go API lives. Production `https://telos.keuppens.online`, or your machine's **LAN IP** `http://192.168.x.x:8080` for local dev (a phone can't reach `localhost`). |
| `EXPO_PUBLIC_AUTH_MODE` | `firebase` (default) or `dev` (sends a `dev:` bearer; needs the server on `AUTH_MODE=insecure-dev`). |
| `EXPO_PUBLIC_FIREBASE_*` | the six Firebase web-config values (same as the web app). Only needed in `firebase` mode. |

> The account must already be **onboarded on the web** — onboarding isn't in this
> slice yet, so Today shows a "finish setup" note for brand-new accounts.

## Design

Tokens in `lib/theme.ts` are ported 1:1 from the web's `globals.css` (the
"Deep Space Professional" dark palette + Space Grotesk / Inter). Change visual
values there, never per-component — same discipline as the web design system.
