# Pixel Session Saver

Android helper that solves “I can log in but I can’t save the cookie.”

Chrome on Pixel cannot export **httpOnly** Sainsbury’s auth cookies. This tiny app:

1. Opens Sainsbury’s login in a WebView (your UK mobile IP)
2. Reads the WebView cookie jar after you sign in
3. Posts them to Autopilot using a short-lived **pair code**
4. Autopilot seals them into the encrypted vault

## Phone steps

1. In Autopilot (browser): **Generate pair code** and set a vault passphrase you’ll reuse
2. Download [`/autopilot-session-saver.apk`](/autopilot-session-saver.apk)
3. Allow install from that source if Android asks
4. Open **Autopilot Session Saver**
5. Autopilot URL = your `https://…trycloudflare.com` (or production URL)
6. Enter pair code + passphrase
7. **Open login** → sign in fully (MFA too)
8. **Save session**
9. Return to Autopilot — vault should show a Sainsbury’s session

## Build

```bash
export ANDROID_HOME=/path/to/android-sdk
cd apps/session-saver-android
./gradlew :app:assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```
