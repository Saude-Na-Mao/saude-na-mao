const Product = require("../models/Product");

function setupStockSocket(io) {
  io.on("connection", (socket) => {
    socket.on("join:pharmacy", ({ pharmacyId } = {}) => {
      if (!pharmacyId) {
        socket.emit("error", { message: "pharmacyId é obrigatório" });
        return;
      }

      const room = `pharmacy:${pharmacyId}`;
      socket.join(room);
      socket.emit("joined", { room });
      console.log(`Farmácia ${pharmacyId} conectada`);
    });

    socket.on("join:product", async ({ productId } = {}) => {
      try {
        if (!productId) {
          socket.emit("error", { message: "productId é obrigatório" });
          return;
        }

        socket.join(`product:${productId}`);

        const produto = await Product.findById(productId).select("estoque");
        if (!produto) {
          socket.emit("error", { message: "Produto não encontrado" });
          return;
        }

        socket.emit("stock:update", {
          productId,
          estoque: produto.estoque,
          atualizadoEm: new Date(),
        });

        console.log(`Cliente inscrito no produto ${productId}`);
      } catch (error) {
        socket.emit("error", {
          message: error.message || "Erro ao acompanhar produto",
        });
      }
    });

    socket.on(
      "stock:update",
      async ({ productId, novoEstoque, pharmacyId } = {}) => {
        try {
          if (novoEstoque < 0) {
            socket.emit("error", {
              message: "novoEstoque deve ser maior ou igual a 0",
            });
            return;
          }

          const produto = await Product.findByIdAndUpdate(
            productId,
            { estoque: novoEstoque },
            { new: true },
          );

          if (!produto) {
            socket.emit("error", { message: "Produto não encontrado" });
            return;
          }

          io.to(`product:${productId}`).emit("stock:update", {
            productId,
            estoque: novoEstoque,
            atualizadoEm: new Date(),
          });

          socket.to(`pharmacy:${pharmacyId}`).emit("stock:confirmed", {
            productId,
            novoEstoque,
          });

          console.log(
            `Estoque do produto ${productId} atualizado para ${novoEstoque}`,
          );
        } catch (error) {
          socket.emit("error", {
            message: error.message || "Erro ao atualizar estoque",
          });
        }
      },
    );

    socket.on("disconnect", () => {
      console.log(`Cliente desconectado: ${socket.id}`);
    });
  });
}

module.exports = { setupStockSocket };
