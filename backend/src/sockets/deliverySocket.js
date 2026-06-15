/**
 * Salas em tempo real da entrega:
 *  - delivery:<id>  → atualizações de uma entrega específica (entregador/cliente)
 *  - driver:<id>    → canal pessoal do entregador
 *  - drivers:available → fila de entregas disponíveis (todos os entregadores online)
 *
 * O deliveryService emite "delivery:status", "delivery:ready", "delivery:accepted",
 * "delivery:location" para delivery:<id>; e "delivery:order-ready" para drivers:available.
 */
function setupDeliverySocket(io) {
  io.on("connection", (socket) => {
    socket.on("join:delivery", ({ deliveryId } = {}) => {
      if (!deliveryId) {
        socket.emit("error", { message: "deliveryId é obrigatório" });
        return;
      }
      const room = "delivery:" + deliveryId;
      socket.join(room);
      socket.emit("joined", { room });
    });

    socket.on("leave:delivery", ({ deliveryId } = {}) => {
      if (!deliveryId) return;
      socket.leave("delivery:" + deliveryId);
    });

    socket.on("join:driver", ({ driverId } = {}) => {
      socket.join("drivers:available");
      if (driverId) {
        socket.join("driver:" + driverId);
      }
      socket.emit("joined", { room: driverId ? "driver:" + driverId : "drivers:available" });
    });

    socket.on("leave:driver", ({ driverId } = {}) => {
      socket.leave("drivers:available");
      if (driverId) socket.leave("driver:" + driverId);
    });
  });
}

module.exports = { setupDeliverySocket };
