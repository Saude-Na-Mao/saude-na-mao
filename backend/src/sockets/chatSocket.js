function setupChatSocket(io) {
  io.on("connection", (socket) => {
    socket.on("join:support", ({ ticketId, userId } = {}) => {
      if (!ticketId) {
        socket.emit("error", { message: "ticketId é obrigatório" });
        return;
      }

      const room = "support:" + ticketId;
      socket.join(room);
      socket.emit("joined", { room });
      console.log(`Usuário ${userId} entrou no suporte ${ticketId}`);
    });

    socket.on("join:support:admin", ({ userId } = {}) => {
      socket.join("support:admin");
      socket.emit("joined:admin", { room: "support:admin" });
      console.log(`Atendente ${userId} entrou no painel de suporte`);
    });

    socket.on("join:pharmacy:support", ({ pharmacyId, userId } = {}) => {
      if (!pharmacyId) {
        socket.emit("error", { message: "pharmacyId é obrigatório" });
        return;
      }

      const room = `pharmacy:${pharmacyId}:support`;
      socket.join(room);
      socket.emit("joined", { room });
      console.log(
        `Farmacêutico ${userId} entrou no painel de suporte da farmácia ${pharmacyId}`,
      );
    });

    socket.on("leave:pharmacy:support", ({ pharmacyId } = {}) => {
      if (!pharmacyId) return;
      socket.leave(`pharmacy:${pharmacyId}:support`);
    });

    socket.on("support:typing", ({ ticketId, userId, isTyping } = {}) => {
      if (!ticketId) {
        socket.emit("error", { message: "ticketId é obrigatório" });
        return;
      }

      socket.to("support:" + ticketId).emit("support:typing", {
        userId,
        isTyping,
      });
    });

    socket.on("support:read", ({ ticketId, userId } = {}) => {
      if (!ticketId) {
        socket.emit("error", { message: "ticketId é obrigatório" });
        return;
      }

      io.to("support:" + ticketId).emit("support:messages_read", { userId });
    });

    // Chat ao vivo de receita
    socket.on(
      "join:prescription-chat",
      ({ chat_sessao_id: chatSessaoId, userId } = {}) => {
        if (!chatSessaoId) {
          socket.emit("error", {
            message: "chat_sessao_id é obrigatório",
          });
          return;
        }
        const room = `prescription-chat:${chatSessaoId}`;
        socket.join(room);
        socket.emit("joined:prescription-chat", { room });
        console.log(
          `Usuário ${userId || socket.id} entrou no chat de receita ${chatSessaoId}`,
        );
      },
    );

    socket.on(
      "leave:prescription-chat",
      ({ chat_sessao_id: chatSessaoId } = {}) => {
        if (!chatSessaoId) return;
        socket.leave(`prescription-chat:${chatSessaoId}`);
      },
    );

    socket.on(
      "prescription-chat:typing",
      ({ chat_sessao_id: chatSessaoId, isTyping, tipoRemetente } = {}) => {
        if (!chatSessaoId) return;
        socket
          .to(`prescription-chat:${chatSessaoId}`)
          .emit("prescription-chat:typing", {
            isTyping: !!isTyping,
            tipoRemetente: tipoRemetente || null,
          });
      },
    );

    socket.on("disconnect", () => {
      console.log(`Cliente desconectado do suporte: ${socket.id}`);
    });
  });
}

module.exports = { setupChatSocket };
