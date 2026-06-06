# WebToAPK Railway Builder v2

Railway-ready Web UI + API server untuk generate APK/AAB dari URL website.

## V2 changes

- Fix `page.evaluate: Execution context was destroyed` dengan isolated same-origin builder runtime.
- Support upload app icon.
- Support splash logo + splash background.
- JSON limit dinaikkan untuk image data URL.
- UI dark glass lebih rapih.

## Deploy Railway

Push folder ini ke GitHub, deploy ke Railway. Railway akan otomatis memakai Dockerfile.

## API

POST `/api/build`

```json
{
  "websiteUrl": "https://example.com",
  "appName": "Example App",
  "iconData": "data:image/png;base64,...",
  "splashLogoData": "data:image/png;base64,...",
  "buildAab": false
}
```
