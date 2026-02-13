# ClinicRide API Documentation

> **Base URL**: `http://localhost:3000`

---

## Table of Contents

- [Authentication](#authentication)
  - [Google OAuth Login](#get-authgoogle)
  - [Google OAuth Callback](#get-authgooglecallback)
  - [Send OTP](#post-authsend-otp)
  - [Verify OTP](#post-authverify-otp)
  - [Refresh Token](#get-authrefresh)
- [Profile](#profile)
  - [Get Current User](#get-profileme)
  - [Update User Info](#patch-profileme)
  - [Create/Update Patient Profile](#post-profilepatient)
  - [Create/Update Guardian Profile](#post-profileguardian)
  - [Create/Update Doctor Profile](#post-profiledoctor)
  - [Complete Profile (Generic)](#post-profilecomplete)
- [Booking](#booking)
  - [Create Booking](#post-booking)
  - [Get Pending Requests](#get-bookingpending)
  - [Respond to Request](#post-bookingrespond)
  - [Update Booking Status](#patch-bookingidstatus)
  - [Get My Bookings](#get-bookingmy)
  - [Get Booking by ID](#get-bookingid)
  - [Booking Flow](#booking-flow)

---

## Authentication

All authenticated endpoints require a JWT token, which can be provided via:
1.  An HTTP-only cookie named `token` (automatically set after login).
2.  An `Authorization: Bearer <token>` header.

---

### `GET /auth/google`

Redirects the user to Google OAuth for authentication.

#### Query Parameters

| Parameter | Type   | Required | Description                                      |
|-----------|--------|----------|--------------------------------------------------|
| `role`    | string | Yes*     | User role for new signups: `PATIENT`, `GUARDIAN`, or `DOCTOR` |

> *Required for new user registration. Existing users will be logged in regardless of this parameter.

#### Example

```
GET /auth/google?role=PATIENT
```

#### Response

Redirects to Google OAuth consent screen.

---

### `GET /auth/google/callback`

Handles the callback from Google OAuth. This endpoint is called automatically by Google after user authorization.

#### Query Parameters

| Parameter | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| `state`   | string | Yes      | OAuth state parameter          |
| `code`    | string | Yes      | Authorization code from Google |

#### Success Response

**Status**: `302 Found` (Redirect)

After successful authentication, the server:
1. Creates/validates the user account
2. Sets an HTTP-only `token` cookie (JWT, expires in 7 days)
3. Redirects to the frontend callback handler at: `${FRONTEND_URL}/auth/google/callback`

The frontend callback handler will then:
- Fetch the user profile using the cookie
- Redirect to the appropriate dashboard or profile setup page

> **Note**: The redirect URL is controlled by the `FRONTEND_URL` environment variable (defaults to `http://localhost:5173`).

#### Error Responses

| Status | Description                                    |
|--------|------------------------------------------------|
| `400`  | Missing state/code, invalid state, or missing role for new users |
| `500`  | OAuth failed                                   |

**Example Error (Missing Role for New User)**:
```json
{
  "error": "Role is required for new users. Start OAuth with /auth/google?role=PATIENT|GUARDIAN|DOCTOR",
  "validRoles": ["PATIENT", "GUARDIAN", "DOCTOR"]
}
```

---

### `POST /auth/send-otp`

Send an OTP (One-Time Password) to a phone number for authentication via SMS.

#### Request Body

| Field         | Type   | Required | Description                                      |
|---------------|--------|----------|--------------------------------------------------|
| `phoneNumber` | string | Yes      | Phone number in E.164 format (e.g., +911234567890)|

#### Example Request

```json
{
  "phoneNumber": "+911234567890"
}
```

#### Success Response

**Status**: `200 OK`

```json
{
  "message": "OTP sent successfully",
  "status": "pending",
  "to": "+911234567890"
}
```

#### Error Responses

| Status | Description                                    |
|--------|------------------------------------------------|
| `400`  | Validation failed (invalid phone number format)|
| `500`  | Twilio service not configured or failed to send OTP |

**Example Error (Validation Failed)**:
```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": ["phoneNumber"],
      "message": "Invalid phone number format. Use E.164 format (e.g., +1234567890)"
    }
  ]
}
```

---

### `POST /auth/verify-otp`

Verify the OTP code sent to the phone number and authenticate the user. If the user doesn't exist, a new account will be created.

#### Request Body

| Field         | Type   | Required       | Description                                    |
|---------------|--------|----------------|------------------------------------------------|
| `phoneNumber` | string | Yes            | Phone number in E.164 format                   |
| `code`        | string | Yes            | 6-digit OTP code received via SMS              |
| `role`        | string | For new users  | User role: `PATIENT`, `GUARDIAN`, or `DOCTOR`  |
| `fullName`    | string | For new users  | Full name of the user (min 1 char)            |

> **Note**: `role` and `fullName` are **required** for new users. If the phone number is already registered, these fields are optional and ignored.

#### Example Request (Existing User)

```json
{
  "phoneNumber": "+911234567890",
  "code": "123456"
}
```

#### Example Request (New User)

```json
{
  "phoneNumber": "+911234567890",
  "code": "123456",
  "role": "PATIENT",
  "fullName": "John Doe"
}
```

#### Success Response (Existing User)

**Status**: `200 OK`

```json
{
  "message": "Login successful",
  "userId": "user-uuid-here",
  "isNewUser": false,
  "token": "jwt-token-here"
}
```

Sets an HTTP-only cookie named `token` with the JWT (expires in 7 days).

#### Success Response (New User)

**Status**: `200 OK`

```json
{
  "message": "Registration successful",
  "user": {
    "id": "user-uuid-here",
    "fullName": "John Doe",
    "mobile": "+911234567890",
    "role": "PATIENT",
    "createdAt": "2026-01-23T08:30:00.000Z"
  },
  "isNewUser": true,
  "nextStep": "Please complete your profile",
  "token": "jwt-token-here"
}
```

Sets an HTTP-only cookie named `token` with the JWT (expires in 7 days).

#### Error Responses

| Status | Description                                    |
|--------|------------------------------------------------|
| `400`  | Invalid/expired OTP, validation failed, or missing role/fullName for new users |
| `500`  | Twilio service not configured or verification failed |

**Example Error (Invalid OTP)**:
```json
{
  "message": "Invalid or expired OTP",
  "status": "denied"
}
```

**Example Error (New User Missing Data)**:
```json
{
  "error": "Role and fullName are required for new users",
  "validRoles": ["PATIENT", "GUARDIAN", "DOCTOR"],
  "isNewUser": true,
  "phoneNumber": "+911234567890"
}
```

> **Tip**: When you receive the "new user" error, make the same request again with `role` and `fullName` included (you don't need to request a new OTP).

---

### `GET /auth/refresh`

Refresh the authentication token.

> ⚠️ **Note**: This endpoint is currently not implemented.

---

## Profile

All profile endpoints require authentication via JWT cookie.

---

### `GET /profile/me`

Get the current authenticated user's profile with role-specific data.

#### Headers

| Header   | Value                          |
|----------|--------------------------------|
| `Cookie` | `token=<jwt_token>` (automatic)|

#### Success Response

**Status**: `200 OK`

```json
{
  "user": {
    "id": "user-uuid-here",
    "fullName": "John Doe",
    "email": "john@example.com",
    "mobile": "+1234567890",
    "role": "PATIENT",
    "createdAt": "2026-01-22T00:00:00.000Z"
  },
  "profile": {
    "id": "profile-uuid-here",
    "userId": "user-uuid-here",
    "age": 30,
    "gender": "MALE",
    "emergencyPhone": "+0987654321"
  },
  "profileComplete": true
}
```

#### Error Responses

| Status | Description       |
|--------|-------------------|
| `401`  | Unauthorized      |
| `404`  | User not found    |
| `500`  | Internal error    |

---

### `PATCH /profile/me`

Update basic user information (name, mobile).

#### Request Body

| Field      | Type   | Required | Description                     |
|------------|--------|----------|---------------------------------|
| `fullName` | string | No       | User's full name (min 1 char)   |
| `mobile`   | string | No       | Mobile number (10-15 chars)     |

#### Example Request

```json
{
  "fullName": "John Smith",
  "mobile": "+1234567890"
}
```

#### Success Response

**Status**: `200 OK`

```json
{
  "message": "User updated successfully",
  "user": {
    "id": "user-uuid-here",
    "fullName": "John Smith",
    "email": "john@example.com",
    "mobile": "+1234567890",
    "role": "PATIENT"
  }
}
```

#### Error Responses

| Status | Description                  |
|--------|------------------------------|
| `400`  | Validation failed            |
| `401`  | Unauthorized                 |
| `500`  | Internal error               |

---

### `POST /profile/patient`

Create or update a patient profile. Only users with `PATIENT` role can access this endpoint.

#### Request Body

| Field            | Type   | Required | Description                           |
|------------------|--------|----------|---------------------------------------|
| `age`            | number | Yes      | Patient's age (1-150)                 |
| `gender`         | string | Yes      | `MALE`, `FEMALE`, or `OTHER`          |
| `emergencyPhone` | string | No       | Emergency contact number (10-15 chars)|

#### Example Request

```json
{
  "age": 30,
  "gender": "MALE",
  "emergencyPhone": "+1234567890"
}
```

#### Success Response

**Status**: `200 OK`

```json
{
  "message": "Patient profile created",
  "profile": {
    "id": "profile-uuid-here",
    "userId": "user-uuid-here",
    "age": 30,
    "gender": "MALE",
    "emergencyPhone": "+1234567890"
  }
}
```

#### Error Responses

| Status | Description                                |
|--------|--------------------------------------------|
| `400`  | Validation failed                          |
| `401`  | Unauthorized                               |
| `403`  | Only patients can create patient profiles  |
| `404`  | User not found                             |
| `500`  | Internal error                             |

---

### `POST /profile/guardian`

Create or update a guardian profile. Only users with `GUARDIAN` role can access this endpoint.

#### Request Body

| Field            | Type     | Required | Description                          |
|------------------|----------|----------|--------------------------------------|
| `age`            | number   | Yes      | Guardian's age (18-80)               |
| `gender`         | string   | Yes      | `MALE`, `FEMALE`, or `OTHER`         |
| `locality`       | string   | Yes      | Guardian's locality (min 1 char)     |
| `preferredHospitalIds` | string[] | Yes      | Array of preferred hospital UUIDs    |

#### Example Request

```json
{
  "age": 35,
  "gender": "FEMALE",
  "locality": "Downtown",
  "preferredHospitalIds": ["hospital-uuid-1", "hospital-uuid-2"]
}
```

#### Success Response

**Status**: `200 OK`

```json
{
  "message": "Guardian profile created",
  "profile": {
    "id": "profile-uuid-here",
    "userId": "user-uuid-here",
    "age": 35,
    "gender": "FEMALE",
    "locality": "Downtown",
    "preferredHospitalIds": ["hospital-uuid-1", "hospital-uuid-2"]
  }
}
```

#### Error Responses

| Status | Description                                  |
|--------|----------------------------------------------|
| `400`  | Validation failed                            |
| `401`  | Unauthorized                                 |
| `403`  | Only guardians can create guardian profiles  |
| `404`  | User not found                               |
| `500`  | Internal error                               |

---

### `POST /profile/doctor`

Create or update a doctor profile. Only users with `DOCTOR` role can access this endpoint.

#### Request Body

| Field          | Type   | Required | Description                        |
|----------------|--------|----------|------------------------------------|
| `qualification`| string | Yes      | Doctor's qualification (min 1 char)|
| `experience`   | number | Yes      | Years of experience (min 0)        |
| `hospitalName` | string | Yes      | Hospital name (min 1 char)         |
| `city`         | string | Yes      | City name (min 1 char)             |
| `hospitalId`   | string | Yes      | Hospital UUID                      |

#### Example Request

```json
{
  "qualification": "MBBS, MD",
  "experience": 10,
  "hospitalName": "City Hospital",
  "city": "New York",
  "hospitalId": "hospital-uuid-here"
}
```

#### Success Response

**Status**: `200 OK`

```json
{
  "message": "Doctor profile created",
  "profile": {
    "id": "profile-uuid-here",
    "userId": "user-uuid-here",
    "qualification": "MBBS, MD",
    "experience": 10,
    "hospitalName": "City Hospital",
    "city": "New York",
    "hospitalId": "hospital-uuid-here"
  }
}
```

#### Error Responses

| Status | Description                              |
|--------|------------------------------------------|
| `400`  | Validation failed or hospital not found  |
| `401`  | Unauthorized                             |
| `403`  | Only doctors can create doctor profiles  |
| `404`  | User not found                           |
| `500`  | Internal error                           |

---

### `POST /profile/complete`

Generic profile completion endpoint that automatically routes based on the user's role.

#### Request Body

The request body depends on the user's role:

**For PATIENT:**
```json
{
  "age": 30,
  "gender": "MALE",
  "emergencyPhone": "+1234567890"
}
```

**For GUARDIAN:**
```json
{
  "age": 35,
  "gender": "FEMALE",
  "locality": "Downtown",
  "preferredHospitalIds": ["hospital-uuid-1"]
}
```

**For DOCTOR:**
```json
{
  "qualification": "MBBS, MD",
  "experience": 10,
  "hospitalName": "City Hospital",
  "city": "New York",
  "hospitalId": "hospital-uuid-here"
}
```

#### Success Response

**Status**: `200 OK`

```json
{
  "message": "Patient profile completed",
  "profile": { ... }
}
```

#### Error Responses

| Status | Description                              |
|--------|------------------------------------------|
| `400`  | Validation failed or unknown role        |
| `401`  | Unauthorized                             |
| `404`  | User not found                           |
| `500`  | Internal error                           |

> **Note**: For validation errors on `/profile/complete`, the response may include `details` and `expectedFields` to help debug the request.

---

## Booking

All booking endpoints require authentication via JWT cookie.

---

### `POST /booking`

Create a new booking request (Patient only). The booking will be visible to verified guardians who have the hospital in their preferred hospitals list.

#### Request Body

| Field          | Type     | Required | Description                                         |
|----------------|----------|----------|-----------------------------------------------------|
| `hospitalId`   | string   | Yes      | UUID of the target hospital                         |
| `pickupType`   | string   | Yes      | `HOSPITAL` (meet at hospital) or `HOME` (pickup)    |
| `pickupLat`    | number   | If HOME  | Latitude for home pickup (-90 to 90)                |
| `pickupLng`    | number   | If HOME  | Longitude for home pickup (-180 to 180)             |
| `pickupAddress`| string   | No       | Address description for pickup location             |
| `scheduledAt`  | string   | Yes      | ISO datetime for the scheduled pickup               |
| `notes`        | string   | No       | Additional notes (max 500 chars)                    |
| `serviceIds`   | string[] | No       | Array of service UUIDs to book                      |

#### Example Request (Hospital Pickup)

```json
{
  "hospitalId": "hospital-uuid-here",
  "pickupType": "HOSPITAL",
  "scheduledAt": "2026-01-25T10:00:00.000Z",
  "notes": "I need wheelchair assistance"
}
```

#### Example Request (Home Pickup)

```json
{
  "hospitalId": "hospital-uuid-here",
  "pickupType": "HOME",
  "pickupLat": 17.385044,
  "pickupLng": 78.486671,
  "pickupAddress": "123 Main Street, Hyderabad",
  "scheduledAt": "2026-01-25T10:00:00.000Z"
}
```

#### Success Response

**Status**: `201 Created`

```json
{
  "message": "Booking request created successfully",
  "booking": {
    "id": "booking-uuid-here",
    "patientId": "patient-uuid",
    "hospitalId": "hospital-uuid",
    "pickupType": "HOME",
    "pickupLat": 17.385044,
    "pickupLng": 78.486671,
    "scheduledAt": "2026-01-25T10:00:00.000Z",
    "status": "REQUESTED",
    "hospital": { ... }
  },
  "eligibleGuardiansCount": 5,
  "nextStep": "Waiting for a guardian to accept your request"
}
```

#### Error Responses

| Status | Description                                        |
|--------|----------------------------------------------------|
| `400`  | Validation failed, hospital/services not found     |
| `401`  | Unauthorized                                       |
| `403`  | Only patients with profiles can create bookings    |
| `404`  | Hospital not found or inactive                     |
| `500`  | Internal error                                     |

---

### `GET /booking/pending`

Get pending booking requests for guardians in their preferred hospitals (Guardian only). Only shows bookings that haven't been assigned to any guardian yet.

#### Success Response

**Status**: `200 OK`

```json
{
  "count": 2,
  "bookings": [
    {
      "id": "booking-uuid-here",
      "patient": {
        "name": "John Doe",
        "mobile": "+1234567890",
        "age": 30,
        "gender": "MALE"
      },
      "hospital": {
        "id": "hospital-uuid",
        "name": "City Hospital",
        "address": "123 Hospital Street",
        "city": "Hyderabad"
      },
      "pickupType": "HOME",
      "pickupLocation": {
        "lat": 17.385044,
        "lng": 78.486671,
        "address": "123 Main Street"
      }, // null if pickupType is HOSPITAL
      "scheduledAt": "2026-01-25T10:00:00.000Z",
      "notes": "Need wheelchair",
      "services": [...],
      "createdAt": "2026-01-22T10:00:00.000Z"
    }
  ]
}
```

#### Error Responses

| Status | Description                               |
|--------|-------------------------------------------|
| `401`  | Unauthorized                              |
| `403`  | Only verified guardians can view requests |
| `500`  | Internal error                            |

---

### `POST /booking/respond`

Accept or reject a pending booking request (Guardian only).

#### Request Body

| Field      | Type   | Required | Description                           |
|------------|--------|----------|---------------------------------------|
| `bookingId`| string | Yes      | UUID of the booking to respond to     |
| `action`   | string | Yes      | `ACCEPT` or `REJECT`                  |

#### Example Request

```json
{
  "bookingId": "booking-uuid-here",
  "action": "ACCEPT"
}
```

#### Success Response (Accept)

**Status**: `200 OK`

```json
{
  "message": "Booking accepted! Session will begin soon.",
  "booking": { ... },
  "patientContact": {
    "name": "John Doe",
    "mobile": "+1234567890",
    "emergencyPhone": "+0987654321"
  },
  "pickupDetails": {
    "type": "HOME",
    "hospital": { ... },
    "location": {
      "lat": 17.385044,
      "lng": 78.486671,
      "address": "123 Main Street"
    }, // null if pickupType is HOSPITAL
    "scheduledAt": "2026-01-25T10:00:00.000Z"
  }
}
```

#### Success Response (Reject)

**Status**: `200 OK`

```json
{
  "message": "Booking rejected. The request will be shown to other guardians."
}
```

#### Error Responses

| `400`  | Validation failed                            |
| `401`  | Unauthorized                                 |
| `403`  | Only verified guardians / Hospital not in your preferred list |
| `404`  | Booking not found                            |
| `409`  | Booking not found or already assigned to another guardian |
| `500`  | Internal error                               |

---

### `PATCH /booking/:id/status`

Update booking status. Guardians can update to `IN_PROGRESS` or `COMPLETED`. Both patients and guardians can `CANCEL`.

#### URL Parameters

| Parameter | Type   | Description         |
|-----------|--------|---------------------|
| `id`      | string | UUID of the booking |

#### Request Body

| Field   | Type   | Required | Description                              |
|---------|--------|----------|------------------------------------------|
| `status`| string | Yes      | `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`|

#### Valid Status Transitions

| From        | To                                |
|-------------|-----------------------------------|
| REQUESTED   | CANCELLED                         |
| ACCEPTED    | IN_PROGRESS, CANCELLED            |
| IN_PROGRESS | COMPLETED, CANCELLED              |

#### Success Response

**Status**: `200 OK`

```json
{
  "message": "Session started! Safe travels.",
  "booking": { ... }
}
```

#### Error Responses

| Status | Description                                    |
|--------|------------------------------------------------|
| `400`  | Invalid status transition                      |
| `401`  | Unauthorized                                   |
| `403`  | Patients can only cancel / not assigned guardian|
| `404`  | Booking not found                              |
| `500`  | Internal error                                 |

---

### `GET /booking/my`

Get current user's bookings (works for both patients and guardians).

#### Success Response

**Status**: `200 OK`

```json
{
  "bookings": [
    {
      "id": "booking-uuid",
      "status": "ACCEPTED",
      "pickupType": "HOME",
      "scheduledAt": "2026-01-25T10:00:00.000Z",
      "hospital": { ... },
      "guardian": {
        "user": { "fullName": "Guardian Name", "mobile": "+123" }
      },
      "services": [...],
      "createdAt": "2026-01-22T10:00:00.000Z"
    }
  ]
}
```

---

### `GET /booking/:id`

Get a specific booking by ID. Only accessible by the patient or assigned guardian.

#### URL Parameters

| Parameter | Type   | Description         |
|-----------|--------|---------------------|
| `id`      | string | UUID of the booking |

#### Success Response

**Status**: `200 OK`

```json
{
  "booking": {
    "id": "booking-uuid",
    "patient": { ... },
    "guardian": { ... },
    "hospital": { ... },
    "pickupType": "HOME",
    "pickupLat": 17.385044,
    "pickupLng": 78.486671,
    "scheduledAt": "2026-01-25T10:00:00.000Z",
    "status": "ACCEPTED",
    "services": [...],
    "review": null
  }
}
```

#### Error Responses

| Status | Description                    |
|--------|--------------------------------|
| `401`  | Unauthorized                   |
| `403`  | No access to this booking      |
| `404`  | Booking not found              |
| `500`  | Internal error                 |

---

## Booking Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        BOOKING FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. PATIENT creates booking                                     │
│     POST /booking                                               │
│     Status: REQUESTED                                           │
│                         ↓                                       │
│  2. GUARDIAN views pending requests                             │
│     GET /booking/pending                                        │
│     (filtered by preferred hospitals)                           │
│                         ↓                                       │
│  3. GUARDIAN accepts request                                    │
│     POST /booking/respond { action: "ACCEPT" }                  │
│     Status: ACCEPTED                                            │
│                         ↓                                       │
│  4. GUARDIAN starts session                                     │
│     PATCH /booking/:id/status { status: "IN_PROGRESS" }         │
│     Status: IN_PROGRESS                                         │
│                         ↓                                       │
│  5. GUARDIAN completes session                                  │
│     PATCH /booking/:id/status { status: "COMPLETED" }           │
│     Status: COMPLETED                                           │
│                                                                 │
│  ※ CANCEL possible at REQUESTED/ACCEPTED/IN_PROGRESS stages    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Types

### Gender Enum

```
MALE | FEMALE | OTHER
```

### User Role Enum

```
PATIENT | GUARDIAN | DOCTOR
```

### Booking Status Enum

```
REQUESTED    // Patient created booking, waiting for guardian
ACCEPTED     // Guardian accepted the request
REJECTED     // Guardian rejected (will try next guardian)
IN_PROGRESS  // Session is ongoing
COMPLETED    // Session finished successfully
CANCELLED    // Cancelled by patient or system
```

### Pickup Type Enum

```
HOSPITAL     // Patient will meet at hospital
HOME         // Guardian picks up from patient's location
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Error message here",
  "details": { ... },  // Optional validation details
  "expectedFields": [] // Optional list of expected fields
}
```

---

## Authentication Flow

```
1. User visits: GET /auth/google?role=PATIENT
                        ↓
2. Redirected to Google OAuth consent screen
                        ↓
3. User authorizes the application
                        ↓
4. Google redirects to: GET /auth/google/callback?state=...&code=...
                        ↓
5. Server validates and creates/finds user
                        ↓
6. JWT token set as HTTP-only cookie
                        ↓
7. User can access protected endpoints
```

---

## Notes

- All timestamps are in ISO 8601 format
- UUIDs are used for all IDs
- The JWT token expires after 7 days
- Cookies are set with `httpOnly: true` for security
