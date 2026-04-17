# ASG Monitoring Dashboard

Real-time notification display system for the After Sales Department.

## Features

- Push notification API on port 8001
- Real-time UI updates (no refresh needed)
- SQLite local database persistence
- Dark mode UI
- Clean sidebar display

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run in development mode:**
   ```bash
   npm run electron:dev
   ```

3. **Build for production:**
   ```bash
   npm run electron:build
   ```

4. **Run the built app:**
   ```bash
   npm run electron:start
   ```

## Push Notification API

The dashboard runs an HTTP server on port 8001.

**Push a notification:**
```bash
curl -X POST http://localhost:8001/api/notifications \
  -H "Content-Type: application/json" \
  -d '{"title": "Alert", "message": "Something happened"}'
```

**Get all notifications:**
```bash
curl http://localhost:8001/api/notifications
```

**Delete all notifications:**
```bash
curl -X DELETE http://localhost:8001/api/notifications
```

**Delete by ID:**
```bash
curl -X DELETE http://localhost:8001/api/notifications/1
```

## API Response

Success:
```json
{ "success": true, "id": 1, "message": "Notification created successfully" }
```

Error:
```json
{ "error": "Missing title or message" }
```

## For Network Access

To allow other computers on the network to push notifications:

1. Find your IP address: `ipconfig` (Windows)
2. Use: `http://YOUR_IP:8001/api/notifications`

Note: Currently only localhost requests are allowed. For cross-network access, CORS needs to be enabled.