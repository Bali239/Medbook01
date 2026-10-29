export const emitToUser = (io, userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

export const emitToRoom = (io, room, event, data) => {
  if (io) {
    io.to(room).emit(event, data);
  }
};
