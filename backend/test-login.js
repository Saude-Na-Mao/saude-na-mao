const axios = require("axios");

async function testLogin() {
  try {
    console.log("\n📤 Testando login via backend direto...");
    const response = await axios.post("http://localhost:5000/api/v1/auth/login", {
      email: "farmaceutico@saudenamao.com",
      senha: "Farm@123",
    });

    console.log("✅ SUCCESS! Status:", response.status);
    console.log("Token:", response.data.data.accessToken.substring(0, 30) + "...");
    console.log("User Role:", response.data.data.user.role);
  } catch (error) {
    console.error("❌ ERRO:", error.response?.status, error.response?.data?.message);
  }
}

testLogin();
