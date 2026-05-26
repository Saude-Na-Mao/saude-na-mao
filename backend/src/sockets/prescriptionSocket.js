function setupPrescriptionSocket(io) {
  io.on("connection", (socket) => {
    socket.on("join:pharmacy:prescriptions", ({ pharmacyId } = {}) => {
      if (!pharmacyId) {
        socket.emit("error", {
          message: "pharmacyId é obrigatório",
        });
        return;
      }

      const room = `pharmacy:${pharmacyId}:prescriptions`;
      socket.join(room);
      socket.emit("joined", { room });
      console.log(`Farmacêutico conectado às receitas de ${pharmacyId}`);
    });

    socket.on("leave:pharmacy:prescriptions", ({ pharmacyId } = {}) => {
      if (!pharmacyId) return;
      socket.leave(`pharmacy:${pharmacyId}:prescriptions`);
    });

    socket.on("join:admin:prescriptions", () => {
      socket.join("admin:prescriptions");
      socket.emit("joined", { room: "admin:prescriptions" });
    });

    // Canal pessoal do usuário (notificações privadas)
    // Aceita tanto join:user(userId) quanto join:user({ userId })
    socket.on("join:user", (payload) => {
      const userId =
        typeof payload === "string" ? payload : payload?.userId;
      if (!userId) return;
      const room = `user:${userId}`;
      socket.join(room);
      socket.emit("joined:user", { room });
    });
  });
}

module.exports = { setupPrescriptionSocket };
