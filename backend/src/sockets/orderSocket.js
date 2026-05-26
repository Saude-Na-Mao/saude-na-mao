const Order = require("../models/Order");

function setupOrderSocket(io) {
  io.on("connection", (socket) => {
    socket.on("join:order", async ({ orderId, userId } = {}) => {
      try {
        if (!orderId) {
          socket.emit("error", { message: "orderId é obrigatório" });
          return;
        }

        socket.join("order:" + orderId);

        const pedido = await Order.findById(orderId).select(
          "status historico_status entregador tempo_estimado_entrega",
        );

        if (!pedido) {
          socket.emit("error", { message: "Pedido não encontrado" });
          return;
        }

        socket.emit("order:current", pedido);
        console.log(`Usuário ${userId} acompanhando pedido ${orderId}`);
      } catch (error) {
        socket.emit("error", {
          message: error.message || "Erro ao acompanhar pedido",
        });
      }
    });

    socket.on("join:pharmacy", ({ pharmacyId } = {}) => {
      if (!pharmacyId) {
        socket.emit("error", { message: "pharmacyId é obrigatório" });
        return;
      }

      const id = String(pharmacyId);
      const room = "pharmacy:orders:" + id;
      socket.join(room);
      socket.emit("joined", { room });
    });

    socket.on("join:drivers:available", ({ driverId } = {}) => {
      socket.join("drivers:available");
      if (driverId) {
        socket.join("driver:" + driverId);
      }
      socket.emit("joined", { room: "drivers:available" });
    });

    socket.on(
      "delivery:location:update",
      ({ orderId, latitude, longitude } = {}) => {
        if (!orderId) {
          socket.emit("error", { message: "orderId é obrigatório" });
          return;
        }

        io.to("order:" + orderId).emit("delivery:location", {
          latitude,
          longitude,
          atualizadoEm: new Date(),
        });
      },
    );

    socket.on("disconnect", () => {
      console.log(`Cliente desconectado: ${socket.id}`);
    });
  });
}

module.exports = { setupOrderSocket };
