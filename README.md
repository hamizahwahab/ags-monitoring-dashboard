# Dashboard 1

Real-time monitoring dashboard for the FOM Department. Displays live notifications, active crises, and cycle spraying data on a TV-mounted display. Built with Electron, Next.js 16, and SQLite + MongoDB.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Running the App](#running-the-app)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [API Overview](#api-overview)
- [Git Remotes](#git-remotes)
- [Troubleshooting](#troubleshooting)
- [Screenshot](#screenshot)

---

## Overview

The Dashboard 1 provides a three-panel, real-time view of operational data for the FOM Department. It runs as a full-screen Electron application on a TV display, with an embedded HTTP server that accepts push notifications and crisis alerts from internal tools and scripts.

Data is persisted locally via SQLite, and the frontend updates in real time through both IPC push events from Electron and a polling fallback mechanism. The dashboard also plays an audible siren when new notifications or crises arrive.

---

## Features

- **Three-panel layout**: Crisis sidebar (left, 25%, auto-hides when empty), Cycle Spraying center panel (50-75%), Notification carousel (right, 25%)
- **Real-time updates**: Dual mechanism — IPC push from Electron main process + 30-second HTTP polling fallback
- **Push API**: HTTP server on port 8001 accepts POST requests for new notifications and crises
- **Siren alert**: Audio siren plays on every new notification and every new crisis
- **SQLite persistence**: Data survives app restarts via local database file in Electron's `userData` directory
- **Auto-cleanup**: Notifications older than 1 hour are automatically deleted (cleanup runs every 5 minutes and on every GET request)
- **API Key authentication**: POST and DELETE endpoints require `X-API-Key` header
- **Input validation**: Maximum 200 characters for title, message, and description fields; SQL injection prevention via parameterized queries
- **CORS enabled**: External HTTP requests are accepted from any origin
- **TV-optimized theme**: Dark theme with CSS custom properties shared with sibling "Sprayed Dashboard" project
- **Seamless notification carousel**: Infinite vertical scroll with pause-on-hover

### Cycle Spraying Panel

The center panel displays live spraying schedule data sourced directly from the company's **MongoDB** (`o_schedules`, `o_scheduleplotreports`, `o_plots`). Every **30 seconds**, the panel queries MongoDB and classifies each active schedule using the following logic:

```
                    ┌─────────────────────┐
                    │  Has a report with   │
                    │  percentageComplete  │
                    │  = 100?              │
                    └──────────┬──────────┘
                               │ YES
                               ├──────────► HIDDEN (skip — job done)
                               │
                               │ NO
                               ▼
                    ┌─────────────────────┐
                    │  Has a report with   │
                    │  percentageComplete  │
                    │  ≠ 100?              │
                    └──────────┬──────────┘
                               │ YES
                               ├──────────► PENDING 🟡
                               │             (yellow — spraying started
                               │              but not complete)
                               │ NO
                               ▼
                    ┌─────────────────────┐
                    │  scheduledate        │
                    │  compared to today   │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
    diff ≤ 0 days          diff = 1 day         diff ≥ 2 days
    (future / on-time)     (1 day late)         (2+ days late)
          │                    │                    │
          ▼                    ▼                    ▼
     HIDDEN               PENDING 🟡           OVERDUE 🔴
     (skip — not           (yellow)            (red — blinks)
      due yet)
```

**Visual layout of the panel:**

```
┌──────────────────────────────────────────┐
│           CYCLE SPRAYING                  │
├──────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐              │  ← red, blinking
│ │3586A │ │4920B │ │7150C │              │    (overdue ≥2 days)
│ └──────┘ └──────┘ └──────┘              │
│ ┌──────┐ ┌──────┐                       │  ← yellow
│ │2210D │ │6830E │                       │    (pending — 1 day late
│ └──────┘ └──────┘                       │     or incomplete report)
│                                          │
│    No cycle spraying data                │  ← empty state
│                                          │
└──────────────────────────────────────────┘
```

Key details:
- **Completed jobs** (report with 100%) are hidden — only actionable items appear
- **Future schedules** (not yet due) are hidden — only late or in-progress items show
- **Plot names** (e.g. `3586A`) are resolved live from the `o_plots` collection via `plotId`
- If MongoDB is unreachable, the panel shows empty without errors, and falls back to the local HTTP API

---

## Tech Stack

| Layer       | Technology                             |
|-------------|----------------------------------------|
| Desktop     | Electron 41                            |
| Frontend    | Next.js 16 (Turbopack), React 19       |
| Styling     | Tailwind CSS v4                        |
| Database    | SQLite via sql.js + MongoDB (read-only)|
| Language    | TypeScript                             |
| Bundling    | electron-builder (Portable Windows exe)|

---

## Quick Start

### Prerequisites

- Node.js 20 or later
- npm 9 or later

### Installation

```bash
# Clone the repository
git clone https://github.com/hamizahwahab/ag-monitoring-dashboard.git
cd ag-monitoring-dashboard

# Install dependencies
npm install
```

### Environment Setup

Copy the example environment file and set your API key:

```bash
cp .env.example .env
```

The default `.env.example` contains instructions for generating a secure key. For local development, the default fallback key `AGS-DASHBOARD-2026` is used if no `.env` is configured. In production, the key from `.env` is used.

---

## Running the App

### Development Mode (Frontend Only)

Starts the Next.js dev server on `http://localhost:3000`:

```bash
npm run dev
```

Use this when working on the UI alone. The API server will not be available — you will need the Electron wrapper for full functionality.

### Full Stack (Electron + Next.js)

Starts the Next.js dev server, waits for it to be ready, then launches Electron:

```bash
npm run electron:dev
```

This runs both the frontend and the embedded HTTP API server (port 8001). Electron loads the Next.js dev URL in a full-screen window and opens DevTools for debugging.

### Production Build

Build the Next.js static export and package as a Windows Portable executable:

```bash
npm run build          # Next.js static export to out/
npm run electron:build # Package with electron-builder
```

The portable executable will be placed in the `dist/` directory.

Run the built app directly:

```bash
npm run electron:start
```

---

## Project Structure

```
ags-monitoring-dashboard/
├── electron/
│   ├── main.js              # Electron main process: HTTP server, SQLite, MongoDB, IPC handlers
│   └── preload.js           # contextBridge IPC API exposed to renderer
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout
│   │   ├── page.tsx         # Main three-panel layout, polling, IPC listeners
│   │   └── globals.css      # TV theme variables, custom animations, scrollbar
│   ├── components/
│   │   ├── CrisisPanel.tsx         # Left sidebar — red crisis cards with ping indicator
│   │   ├── NotificationPanel.tsx   # Right sidebar — vertical carousel of notifications
│   │   ├── NotificationCard.tsx    # Single notification card with left accent border
│   │   ├── CycleSprayingPanel.tsx  # Center panel — cycle spraying data grid
│   │   └── Siren.tsx               # Audio utility — plays siren.mp3
│   ├── config/
│   │   └── api.ts           # API base URL, endpoints, and poll interval config
│   └── types/
│       ├── index.ts         # Notification, Crisis, and component prop interfaces
│       └── electron.d.ts    # TypeScript declarations for window.electronAPI
├── public/
│   └── siren.mp3            # Siren audio file played on new events
├── .env                     # API key (git-ignored)
├── .env.example             # API key template
├── package.json             # Scripts, dependencies, electron-builder config
├── next.config.ts           # Next.js configuration
├── postcss.config.mjs       # PostCSS with Tailwind CSS v4
└── tsconfig.json            # TypeScript configuration
```

---

## Configuration

### API Key

The API key is set in the `.env` file (see `.env.example`):

```
API_KEY=YOUR_API_KEY_HERE
```

- In **development mode** (`--dev` flag), API key checks are bypassed and all requests are allowed.
- In **production mode**, POST and DELETE endpoints require the `X-API-Key` header matching the key in your `.env` file.
- GET endpoints do not require authentication.

### HTTP Port

The embedded HTTP server runs on port **8001** (hardcoded in `electron/main.js`).

### Dashboard URL

When the Electron app is running, the dashboard is accessible at:

```
http://192.168.68.122:8001
```

The Next.js dev server (without Electron) runs on:

```
http://localhost:3000
```

### Poll Interval

The frontend polls for new data every **30 seconds** as a fallback. Configured in `src/config/api.ts`:

```typescript
POLL_INTERVAL: 30000  // milliseconds, set to 0 for push-only mode
```

### Character Limits

- `title`: Maximum 200 characters
- `message` / `description`: Maximum 200 characters

### Theme Customization

Theme variables are defined in `src/app/globals.css`:

```css
--tv-bg: #0d0d0d;
--tv-panel: #1a1a1a;
--tv-card: #242424;
--tv-border: rgba(255, 255, 255, 0.06);
--tv-text: #f5f5f5;
--tv-text-muted: #888888;
--critical-bg: #000000;
--critical-border: #FFB800;
```

---

## API Overview

The embedded HTTP server exposes a REST API for managing notifications and crises.

### Base URL

```
http://<dashboard-ip>:8001
```

Example: `http://192.168.68.122:8001`

### Authentication

POST and DELETE endpoints require the `X-API-Key` header matching the key in your `.env` file:

```
X-API-Key: YOUR_API_KEY_HERE
```

### Endpoints

| Method   | Endpoint                       | Auth | Description                         |
|----------|--------------------------------|------|-------------------------------------|
| GET      | `/api/notifications`           | No   | Get all notifications               |
| GET      | `/api/notifications/:id`       | No   | Get notification by ID              |
| POST     | `/api/notifications`           | Yes  | Push a new notification             |
| DELETE   | `/api/notifications/:id`       | Yes  | Delete notification by ID           |
| DELETE   | `/api/notifications/all`       | Yes  | Clear all notifications             |
| GET      | `/api/crises`                  | No   | Get all active crises               |
| GET      | `/api/crises/:id`              | No   | Get crisis by ID                    |
| POST     | `/api/crises`                  | Yes  | Push a new crisis                   |
| DELETE   | `/api/crises/:id`              | Yes  | Delete crisis by ID                  |
| DELETE   | `/api/crises/all`              | Yes  | Clear all crises                    |

Full API documentation with request/response examples and cURL commands is available in [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md).

---

## Git Remotes

The project has two remotes for deployment to different repositories:

| Remote   | URL                                                   |
|----------|-------------------------------------------------------|
| Personal | `https://github.com/hamizahwahab/ag-monitoring-dashboard.git` |
| Company  | `https://github.com/AerosGeotech/dashboard1.git`            |

---

## Troubleshooting

### Corrupted .next Cache

If the Next.js development server behaves unexpectedly (stale pages, build errors), clear the cache:

```bash
# Windows
rmdir /s .next

# PowerShell / Unix
rm -rf .next
```

Then restart the dev server.

### Audio Autoplay Blocked

Browsers and Electron may block audio autoplay until the user interacts with the page. If the siren does not play:

- Click anywhere on the dashboard once to satisfy the user-gesture requirement.
- After the first interaction, subsequent siren plays will work automatically.
- In Electron, the `play()` promise rejection is caught and logged to the console; it does not crash the app.

### Port Already in Use

If port 8001 is occupied, you will see an `EADDRINUSE` error in the console. Kill the process using the port or change the port in `electron/main.js` (`HTTP_PORT` constant).

### Database Reset

To reset the database, delete the `notifications.db` file from Electron's `userData` directory. On Windows, this is typically:

```
%APPDATA%/ASG Monitoring Dashboard/notifications.db
```

The database will be recreated with fresh tables on the next app launch.

---

## Screenshot

*Screenshot to be added.*
