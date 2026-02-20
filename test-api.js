// API Test File for Product Expiry Backend
// Test all superadmin endpoints

const BASE_URL = "http://localhost:5000/api";

// Test data
const testEmail = "siddhi2006patil@gmail.com";
const testPassword = "SiddhiPati2684@";

async function testAPI() {
    console.log("🧪 Starting API Tests...\n");

    try {
        // 1. Test Health Check
        console.log("1️⃣ Testing Health Check...");
        const healthResponse = await fetch("http://localhost:5000/");
        const healthData = await healthResponse.json();
        console.log("✅ Health Check:", healthData);
        console.log("");

        // 2. Test Login
        console.log("2️⃣ Testing SuperAdmin Login...");
        const loginResponse = await fetch(`${BASE_URL}/superadmin/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testEmail,
                password: testPassword
            })
        });
        const loginData = await loginResponse.json();

        if (loginData.success) {
            console.log("✅ Login Successful");
            console.log("   Token:", loginData.token.substring(0, 30) + "...");
            console.log("   User:", loginData.superadmin.name);
            console.log("   Role:", loginData.superadmin.role);
            console.log("");

            const token = loginData.token;

            // 3. Test Get Profile
            console.log("3️⃣ Testing Get Profile...");
            const profileResponse = await fetch(`${BASE_URL}/superadmin/profile`, {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });
            const profileData = await profileResponse.json();
            console.log("✅ Profile:", profileData);
            console.log("");

            // 4. Test Create Company (Protected Route)
            console.log("4️⃣ Testing Create Company Endpoint...");
            const companyResponse = await fetch(`${BASE_URL}/superadmin/create-company`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ownerName: "Test Company Owner",
                    ownerEmail: "testcompany" + Date.now() + "@example.com",
                    companyName: "Test Company Ltd",
                    plan: "free"
                })
            });
            const companyData = await companyResponse.json();
            console.log("✅ Create Company:", companyData);
            console.log("");

            // 5. Test Logout
            console.log("5️⃣ Testing Logout...");
            const logoutResponse = await fetch(`${BASE_URL}/superadmin/logout`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });
            const logoutData = await logoutResponse.json();
            console.log("✅ Logout:", logoutData);
            console.log("");

        } else {
            console.log("❌ Login Failed:", loginData.message);
        }

        console.log("✅ All API Tests Completed!");

    } catch (error) {
        console.error("❌ API Test Error:", error.message);
    }
}

// Run tests
testAPI();
