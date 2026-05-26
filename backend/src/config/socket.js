const { Server } = require("socket.io");
const { validateCorsOrigin } = require("./cors");

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: validateCorsOrigin,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    socket.on("disconnect", () => {
      return undefined;
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error("Socket.io não foi inicializado");
  }

  return io;
}

module.exports = { initSocket, getIO };
