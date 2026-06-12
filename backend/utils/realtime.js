// realtime.js
// A tiny bridge so any controller can push a Socket.IO event to a specific user
// without importing the whole server. server.js calls setIO(io) once at startup;
// each connected socket joins a room named after its userId (see server.js), so
// emitToUser can target just that user's browser tab(s).

let io = null;

function setIO(instance) {
  io = instance;
}

function emitToUser(userId, event, payload) {
  if (io && userId) {
    io.to(String(userId)).emit(event, payload);
  }
}

module.exports = { setIO, emitToUser };
