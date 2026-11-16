# Relay TV — Samsung Tizen Smart TV Edition

Standalone Samsung Smart TV web application built with **React** and **Vite**, featuring native **Samsung AVPlay** acceleration and full **TV Remote Control** support.

---

## Features
- **Samsung AVPlay Engine**: Native hardware video decoding on Tizen OS with no browser CORS restrictions on video segments.
- **hls.js Fallback**: Seamless fallback for local desktop browser testing.
- **TV Remote Navigation**:
  - `▲` / `▼` or `CH +` / `CH -`: Fast channel switching
  - `Enter` / `OK`: Select channel
  - `Back` / `Return` (`keyCode 10009`): Close overlays or exit app
- **EPG Program Guide**: XMLTV program schedule and now-playing progress.
- **Virtualized Channel List**: Smooth scrolling through thousands of channels.
- **Favorites & Recents**: Fast access to your top channels.
- **Legacy Browser Polyfills**: Support for older Tizen TVs (Tizen 3.0+ / 2017+ models).

---

## Quick Start (Local Testing)

```bash
cd tizen-app
npm install
npm run dev
```

Open `http://localhost:3000` on your Mac.

---

## Build for Samsung Smart TV

```bash
npm run build
```

This compiles your application into the `dist/` directory with relative paths (`./`) and includes `config.xml` and `icon.png`.

---

## Installing on Your Samsung TV via Tizen Studio

1. **Enable TV Developer Mode**:
   - On your Samsung TV: Go to **Apps** > Press `1 2 3 4 5` on the remote.
   - Turn **Developer Mode ON** and enter your Mac's IP address.
   - Reboot TV (hold power button on remote for 3 seconds).

2. **Connect in Tizen Studio**:
   - In Tizen Studio, open **Tools > Device Manager > Remote Device Manager**.
   - Add your TV's IP address and switch connection to **ON**.

3. **Certificate**:
   - Open **Tools > Certificate Manager**.
   - Create a **Samsung Certificate** (Profile: Samsung > Device: TV > Author & Distributor with your TV's DUID checked).

4. **Import Project**:
   - In Tizen Studio: **File > Import > Tizen > Tizen Project**.
   - Select the `dist/` folder (or `tizen-app` folder).
   - Right-click project > **Run As > 1 Tizen Web Application**.
   - The app will automatically install and launch on your TV!
# relay-tv
