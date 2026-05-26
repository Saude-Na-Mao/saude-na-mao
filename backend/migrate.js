const mongoose = require("mongoose");
const User = require("./src/models/User");

async function migrate() {
  try {
    console.log("Conectando ao MongoDB...");
    await mongoose.connect("mongodb://localhost:27017/ssm");
    
    console.log("Iniciando migração de role...");
    
    // Buscar usuários sem role
    const usersWithoutRole = await User.find({ role: { $exists: false } });
    console.log(`Encontrados ${usersWithoutRole.length} usuários sem role`);
    
    // Atualizar cada um
    for (const user of usersWithoutRole) {
      let newRole = "cliente";
      if (user.tipo_usuario === "administrador") newRole = "admin";
      if (user.tipo_usuario === "dono_farmacia") newRole = "dono_farmacia";
      if (user.tipo_usuario === "farmaceutico") newRole = "farmaceutico";
      if (user.tipo_usuario === "entregador") newRole = "entregador";
      
      user.role = newRole;
      await user.save();
      console.log(`✅ ${user.nome} -> role: ${newRole}`);
    }
    
    // Listar todos
    const allUsers = await User.find().select("nome email tipo_usuario role");
    console.log("\n=== USUÁRIOS NO SISTEMA ===");
    allUsers.forEach(u => {
      console.log(`${u.nome} (${u.email}) -> role: ${u.role}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro:", error.message);
    process.exit(1);
  }
}

migrate();
