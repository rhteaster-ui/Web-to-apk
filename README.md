# WebToAPK Railway Builder

Web UI + API server siap deploy Railway untuk generate APK/AAB dari URL website.

## Fitur

- UI profesional dark/glass.
- Build APK dari URL website.
- Optional AAB.
- Queue 1 job at a time supaya Chromium stabil.
- Live progress via Server-Sent Events.
- Download APK/AAB dari dashboard.
- Dockerfile siap Railway.

## Deploy Railway

Upload project ini ke GitHub, lalu deploy di Railway. Railway akan memakai Dockerfile.

## API

POST `/api/build`

```json
{
  "websiteUrl": "https://example.com",
  "appName": "Example App",
  "appVersion": "1.0.0",
  "packageName": "com.webapp.example",
  "buildAab": false
}
```

GET `/api/jobs/:id`

GET `/api/jobs/:id/events`

GET `/api/download/:id/apk`

GET `/api/download/:id/aab`
