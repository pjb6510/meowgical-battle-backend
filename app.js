require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const { broadcastedActions } = require("./constants");

const port = process.env.PORT;
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
  },
});

const games = {};

io.on("connection", (socket) => {
  const createGame = (data) => {
    const { playerId } = data;

    games[playerId] = { host: playerId };
    socket.data.playerState = {
      playerId,
      roomCode: playerId,
      isHost: true,
    };

    socket.join(playerId);
  };

  const removeGame = (data) => {
    const { playerId } = data;

    delete games[playerId];
    delete socket.data.playerState;

    socket.leave(playerId);

    socket.broadcast.to(playerId).emit(
      "notifyRoomState",
      {
        action: broadcastedActions.ENTER,
        payload: false,
        from: playerId,
      }
    );
  };

  const joinGame = (data) => {
    const { invitationCode, playerId } = data;

    if (!games[invitationCode]) {
      socket.emit("notifyJoinResult", {
        result: false,
        message: "해당 코드의 게임을 찾을 수 없습니다.",
      });

      return;
    }

    if (games[invitationCode].guest) {
      socket.emit("notifyJoinResult", {
        result: false,
        message: "이미 인원이 가득 찬 게임입니다.",
      });

      return;
    }

    games[invitationCode].guest = playerId;
    socket.data.playerState = {
      playerId,
      roomCode: invitationCode,
      isHost: false,
    };

    socket.join(invitationCode);
    socket.broadcast.to(invitationCode).emit(
      "notifyRoomState",
      {
        action: broadcastedActions.ENTER,
        payload: true,
        from: playerId,
      }
    );

    socket.emit("notifyJoinResult", {
      result: true,
    });
  };

  const leaveGame = (data) => {
    const { playerId, invitationCode } = data;

    delete socket.data.playerState;
    if (games[invitationCode]) {
      delete games[invitationCode].guest;
    }

    socket.broadcast.to(invitationCode).emit(
      "notifyRoomState",
      {
        action: broadcastedActions.ENTER,
        payload: false,
        from: playerId,
      }
    );

    socket.leave(invitationCode);
  };

  const broadcastAction = (data) => {
    if (!socket.data.playerState) {
      return;
    }

    socket.broadcast.to(socket.data.playerState.roomCode).emit(
      "notifyRoomState",
      data
    );
  };

  socket.on("createGame", createGame);
  socket.on("removeGame", removeGame);
  socket.on("joinGame", joinGame);
  socket.on("leaveGame", leaveGame);
  socket.on("broadcastAction", broadcastAction);

  socket.on("disconnect", () => {
    if (!socket.data.playerState) {
      return;
    }

    const { playerId, isHost, roomCode } = socket.data.playerState;

    if (isHost) {
      removeGame({ playerId });
    } else {
      leaveGame({ playerId, roomCode });
    }
  });
});

server.listen(port, () => {
  console.log(`Socket server is listening on port ${port}`);
});
