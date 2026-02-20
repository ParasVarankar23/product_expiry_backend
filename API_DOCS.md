# API Endpoints Documentation

## Base URL
```
http://localhost:5000/api
```

## SuperAdmin Endpoints

### 1. Health Check
**GET** `/`
```bash
curl http://localhost:5000/
```
**Response:**
```json
{
  "success": true,
  "message": "Backend running 🚀"
}
```

---

### 2. Login
**POST** `/superadmin/login`

**Request:**
```json
{
  "email": "siddhi2006patil@gmail.com",
  "password": "SiddhiPati2684@"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1...",
  "superadmin": {
    "id": "699819b90082939acc0daa42",
    "name": "Siddhi Patil",
    "email": "siddhi2006patil@gmail.com",
    "phoneNumber": null,
    "address": "",
    "avatar": "",
    "provider": "local",
    "role": "superadmin",
    "isVerified": true
  }
}
```

---

### 3. Get Profile (Protected)
**GET** `/superadmin/profile`

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "superadmin": {
    "id": "699819b90082939acc0daa42",
    "name": "Siddhi Patil",
    "email": "siddhi2006patil@gmail.com",
    "role": "superadmin",
    ...
  }
}
```

---

### 4. Create Company (Protected)
**POST** `/superadmin/create-company`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request:**
```json
{
  "ownerName": "John Doe",
  "ownerEmail": "john@example.com",
  "companyName": "ABC Company Ltd",
  "plan": "free"
}
```

**Response (Free Plan):**
```json
{
  "success": true,
  "paymentRequired": false,
  "companyCode": "COMP-A1B2"
}
```

**Response (Paid Plan):**
```json
{
  "success": true,
  "paymentRequired": true,
  "companyId": "...",
  "companyCode": "COMP-X1Y2",
  "amount": 999,
  "key": "rzp_test_..."
}
```

---

### 5. Logout (Protected)
**POST** `/superadmin/logout`

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 6. Change Password (Protected)
**POST** `/superadmin/change-password`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request:**
```json
{
  "oldPassword": "OldPass123@",
  "newPassword": "NewPass123@"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

### 7. Update Profile (Protected)
**PUT** `/superadmin/profile-update`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request:**
```json
{
  "name": "Updated Name",
  "phoneNumber": "+1234567890",
  "address": "123 Main St",
  "avatar": "https://..."
}
```

**Response:**
```json
{
  "success": true,
  "superadmin": {
    ...updated profile
  }
}
```

---

## Testing the API

### Using the test script:
```bash
cd backend
node test-api.js
```

### Using curl:
```bash
# Health Check
curl http://localhost:5000/

# Login
curl -X POST http://localhost:5000/api/superadmin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"siddhi2006patil@gmail.com","password":"SiddhiPati2684@"}'

# Get Profile (replace TOKEN)
curl http://localhost:5000/api/superadmin/profile \
  -H "Authorization: Bearer TOKEN"

# Create Company (replace TOKEN)
curl -X POST http://localhost:5000/api/superadmin/create-company \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ownerName":"Test Owner",
    "ownerEmail":"test@example.com",
    "companyName":"Test Company",
    "plan":"free"
  }'
```

---

## Frontend Integration

The superadmin frontend uses `axiosInstance` which automatically adds the token to requests:

```javascript
import axiosInstance from "@/lib/axiosInstance";

// All requests automatically include Authorization header
const response = await axiosInstance.post('/superadmin/create-company', {
  ownerName: "...",
  ownerEmail: "...",
  companyName: "...",
  plan: "free"
});
```

---

## CORS Configuration

Backend allows requests from:
- `http://localhost:3000` (default Next.js)
- `http://localhost:3001` (alternative port)

Configured in `.env`:
```env
FRONTEND_ORIGIN=http://localhost:3000,http://localhost:3001
```
