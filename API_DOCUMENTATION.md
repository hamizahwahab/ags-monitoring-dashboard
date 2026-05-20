# ASG Monitoring Dashboard — API Reference

> Base URL: `http://192.168.68.122:8001`
>
> All requests and responses use `application/json`.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Common Error Responses](#common-error-responses)
3. [Character Limits](#character-limits)
4. [Notifications API](#notifications-api)
   - [GET /api/notifications](#get-apinotifications)
   - [GET /api/notifications/:id](#get-apinotificationsid)
   - [POST /api/notifications](#post-apinotifications)
   - [DELETE /api/notifications/:id](#delete-apinotificationsid)
   - [DELETE /api/notifications/all](#delete-apinotificationsall)
5. [Crises API](#crises-api)
   - [GET /api/crises](#get-apicrises)
   - [GET /api/crises/:id](#get-apicrisesid)
   - [POST /api/crises](#post-apicrises)
   - [DELETE /api/crises/:id](#delete-apicrisesid)
   - [DELETE /api/crises/all](#delete-apicrisesall)
6. [Status Codes](#status-codes)
7. [Database Notes](#database-notes)

---

## Authentication

Endpoints that create or delete data require an API key. Include it via the `X-API-Key` header.

| Header | Value |
|--------|-------|
| `X-API-Key` | `YOUR_API_KEY_HERE` |

Authenticated endpoints return **401 Unauthorized** when the header is missing or incorrect.

---

## Common Error Responses

Every error response follows this shape:

```json
{
  "error": "<description>"
}
```

| HTTP Status | `error` value | When it occurs |
|-------------|---------------|----------------|
| 400 | `"Invalid JSON"` | Malformed request body |
| 400 | `"Invalid ID"` | Non-numeric `:id` parameter |
| 401 | `"Unauthorized"` | Missing or incorrect `X-API-Key` |
| 404 | `"Notification not found"` | Notification ID does not exist |
| 404 | `"Crisis not found"` | Crisis ID does not exist |
| 500 | `"Failed to create notification"` | Server-side failure (analogous for crises) |

---

## Character Limits

The following fields accept a maximum of **200 characters**. Requests exceeding this limit return **400 Bad Request**.

| Endpoint | Fields |
|----------|--------|
| `POST /api/notifications` | `title`, `message` |
| `POST /api/crises` | `title`, `description` |

Error example:

```json
{
  "error": "Title or message too long (max 200 chars)"
}
```

---

## Notifications API

Notifications are ephemeral alerts that **auto-delete after 1 hour**.

### GET /api/notifications

Retrieve all notifications. Pagination is not currently supported.

- **Auth:** None
- **Method:** GET
- **URL:** `/api/notifications`

#### Responses

**200 OK**

```json
[
  {
    "id": 1,
    "title": "Server Load Warning",
    "message": "CPU usage exceeding 85%",
    "priority": "critical",
    "status": "active",
    "created_at": "2026-05-20T10:30:00Z"
  },
  {
    "id": 2,
    "title": "Disk Space Alert",
    "message": "/dev/sda1 at 92% capacity",
    "priority": "warning",
    "status": "active",
    "created_at": "2026-05-20T10:28:00Z"
  }
]
```

---

### GET /api/notifications/:id

Retrieve a single notification by its numeric ID.

- **Auth:** None
- **Method:** GET
- **URL:** `/api/notifications/{id}`

#### Responses

**200 OK**

```json
{
  "id": 1,
  "title": "Server Load Warning",
  "message": "CPU usage exceeding 85%",
  "priority": "critical",
  "status": "active",
  "created_at": "2026-05-20T10:30:00Z"
}
```

**400 Bad Request**

```json
{
  "error": "Invalid ID"
}
```

**404 Not Found**

```json
{
  "error": "Notification not found"
}
```

#### cURL Example

```bash
curl -X GET "http://192.168.68.122:8001/api/notifications/1"
```

---

### POST /api/notifications

Push a new notification.

- **Auth:** Required (`X-API-Key`)
- **Method:** POST
- **URL:** `/api/notifications`

#### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | Yes | — | Notification title (max 200 chars) |
| `message` | string | Yes | — | Notification body (max 200 chars) |
| `priority` | string | No | `"critical"` | Severity label |

#### Responses

**201 Created**

```json
{
  "success": true,
  "id": 42,
  "message": "Notification created successfully"
}
```

**400 Bad Request**

```json
{
  "error": "Missing title or message"
}
```

```json
{
  "error": "Invalid JSON"
}
```

```json
{
  "error": "Title or message too long (max 200 chars)"
}
```

**401 Unauthorized**

```json
{
  "error": "Unauthorized"
}
```

**500 Internal Server Error**

```json
{
  "error": "Failed to create notification"
}
```

#### cURL Example

```bash
curl -X POST "http://192.168.68.122:8001/api/notifications" \
  -H "X-API-Key: YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Server Load Warning",
    "message": "CPU usage exceeding 85%",
    "priority": "critical"
  }'
```

---

### DELETE /api/notifications/:id

Delete a single notification by its numeric ID.

- **Auth:** Required (`X-API-Key`)
- **Method:** DELETE
- **URL:** `/api/notifications/{id}`

#### Responses

**200 OK**

```json
{
  "success": true,
  "message": "Notification deleted successfully"
}
```

**400 Bad Request**

```json
{
  "error": "Invalid ID"
}
```

**401 Unauthorized**

```json
{
  "error": "Unauthorized"
}
```

**404 Not Found**

```json
{
  "error": "Notification not found"
}
```

#### cURL Example

```bash
curl -X DELETE "http://192.168.68.122:8001/api/notifications/42" \
  -H "X-API-Key: YOUR_API_KEY_HERE"
```

---

### DELETE /api/notifications/all

Remove every notification from the database.

- **Auth:** Required (`X-API-Key`)
- **Method:** DELETE
- **URL:** `/api/notifications/all`

#### Responses

**200 OK**

```json
{
  "success": true,
  "message": "All notifications deleted successfully"
}
```

**401 Unauthorized**

```json
{
  "error": "Unauthorized"
}
```

#### cURL Example

```bash
curl -X DELETE "http://192.168.68.122:8001/api/notifications/all" \
  -H "X-API-Key: YOUR_API_KEY_HERE"
```

---

## Crises API

Crises represent ongoing incidents that remain active until explicitly resolved.

### GET /api/crises

Retrieve all active crises.

- **Auth:** None
- **Method:** GET
- **URL:** `/api/crises`

#### Responses

**200 OK**

```json
[
  {
    "id": 1,
    "title": "Database Outage",
    "description": "Primary database unreachable for 5 minutes",
    "severity": "high",
    "status": "active",
    "created_at": "2026-05-20T09:15:00Z"
  },
  {
    "id": 2,
    "title": "Network Partition",
    "description": "Loss of connectivity between us-east-1 and us-west-2",
    "severity": "medium",
    "status": "active",
    "created_at": "2026-05-20T08:45:00Z"
  }
]
```

---

### GET /api/crises/:id

Retrieve a single crisis by its numeric ID.

- **Auth:** None
- **Method:** GET
- **URL:** `/api/crises/{id}`

#### Responses

**200 OK**

```json
{
  "id": 1,
  "title": "Database Outage",
  "description": "Primary database unreachable for 5 minutes",
  "severity": "high",
  "status": "active",
  "created_at": "2026-05-20T09:15:00Z"
}
```

**400 Bad Request**

```json
{
  "error": "Invalid ID"
}
```

**404 Not Found**

```json
{
  "error": "Crisis not found"
}
```

#### cURL Example

```bash
curl -X GET "http://192.168.68.122:8001/api/crises/1"
```

---

### POST /api/crises

Report a new active crisis.

- **Auth:** Required (`X-API-Key`)
- **Method:** POST
- **URL:** `/api/crises`

#### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | Yes | — | Crisis title (max 200 chars) |
| `description` | string | Yes | — | Crisis description (max 200 chars) |
| `severity` | string | No | `"high"` | One of: `"high"`, `"medium"`, `"low"` |

#### Responses

**201 Created**

```json
{
  "success": true,
  "id": 7,
  "message": "Crisis created successfully"
}
```

**400 Bad Request**

```json
{
  "error": "Missing title or description"
}
```

```json
{
  "error": "Invalid JSON"
}
```

```json
{
  "error": "Title or description too long (max 200 chars)"
}
```

**401 Unauthorized**

```json
{
  "error": "Unauthorized"
}
```

**500 Internal Server Error**

```json
{
  "error": "Failed to create crisis"
}
```

#### cURL Example

```bash
curl -X POST "http://192.168.68.122:8001/api/crises" \
  -H "X-API-Key: YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Database Outage",
    "description": "Primary database unreachable for 5 minutes",
    "severity": "high"
  }'
```

---

### DELETE /api/crises/:id

Resolve a single crisis by its numeric ID. The crisis is removed from the active list.

- **Auth:** Required (`X-API-Key`)
- **Method:** DELETE
- **URL:** `/api/crises/{id}`

#### Responses

**200 OK**

```json
{
  "success": true,
  "message": "Crisis resolved successfully"
}
```

**400 Bad Request**

```json
{
  "error": "Invalid ID"
}
```

**401 Unauthorized**

```json
{
  "error": "Unauthorized"
}
```

**404 Not Found**

```json
{
  "error": "Crisis not found"
}
```

#### cURL Example

```bash
curl -X DELETE "http://192.168.68.122:8001/api/crises/7" \
  -H "X-API-Key: YOUR_API_KEY_HERE"
```

---

### DELETE /api/crises/all

Resolve (remove) every active crisis.

- **Auth:** Required (`X-API-Key`)
- **Method:** DELETE
- **URL:** `/api/crises/all`

#### Responses

**200 OK**

```json
{
  "success": true,
  "message": "All crises resolved successfully"
}
```

**401 Unauthorized**

```json
{
  "error": "Unauthorized"
}
```

#### cURL Example

```bash
curl -X DELETE "http://192.168.68.122:8001/api/crises/all" \
  -H "X-API-Key: YOUR_API_KEY_HERE"
```

---

## Status Codes

| Code | Name | Usage |
|------|------|-------|
| 200 | OK | Successful GET, DELETE, and general success responses |
| 201 | Created | Resource successfully created (POST) |
| 204 | No Content | Preflight checks / OPTIONS requests |
| 400 | Bad Request | Missing fields, invalid JSON, non-numeric ID, or character limit exceeded |
| 401 | Unauthorized | Missing or incorrect `X-API-Key` header |
| 404 | Not Found | Notification or crisis ID does not exist |
| 500 | Internal Server Error | Unexpected server-side failure |

---

## Database Notes

- The dashboard uses a **SQLite** database that is **auto-created** on first run.
- The `notifications` table stores: `id`, `title`, `message`, `priority`, `status`, `created_at`.
- The `crises` table stores: `id`, `title`, `description`, `severity`, `status`, `created_at`.
- Notifications are **automatically deleted after 1 hour** from their `created_at` timestamp.
- Crises persist until explicitly resolved via the DELETE endpoints.
