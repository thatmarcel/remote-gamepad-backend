import { WebSocketServer } from "ws";
import randomstring from "randomstring";

const actions = {
    incoming: {
        createGameSession: "create-game-session",
        joinGameSession: "join-game-session",
        gameSessionJoinRequestResponse: "game-session-join-request",
        doInput: "do-input"
    },
    outgoing: {
        gameSessionCreationResult: "game-session-creation-result",
        gameSessionJoined: "game-session-joined",
        gameSessionJoinRequestResult: "game-session-join-request",
        gameSessionJoinRequest: "game-session-join-request",
        gameSessionJoinRequestResponseResult: "game-session-join-request-response-result",
        inputReceived: "input-received",
        gameSessionClosed: "game-session-closed"
    }
};

const failureReasons = {
    gameSessionNonExistant: "game-session-non-existant",
    gameSessionAlreadyJoined: "game-session-already-joined",
    invalidJoinRequestCode: "invalid-join-request-code"
}

const wsServer = new WebSocketServer({ port: process.env.PORT || 4000 });

let sockets = {};
let gameSessionIdsForSocketIds = {};
let gameSessions = [];

const handleMessage = (json, socketId) => {
    switch (json["action"]) {
        case actions.incoming.createGameSession: {
            const gameSessionId = randomstring.generate(12);

            gameSessions.push({
                id: gameSessionId,
                hostSocketId: socketId,
                memberSocketIds: [],
                joinRequests: {}
            });

            gameSessionIdsForSocketIds[socketId] = gameSessionId;

            ws.send(JSON.stringify({
                action: actions.outgoing.gameSessionCreationResult,
                success: true,
                gameSessionId: gameSessionId
            }));
            break;
        }
        case actions.incoming.joinGameSession: {
            const gameSessionId = json["gameSessionId"];
            const gameSessionExists = gameSessions.map(session => session.id === gameSessionId).length > 0;

            if (!gameSessionExists) {
                ws.send(JSON.stringify({
                    action: actions.outgoing.gameSessionJoinRequestResult,
                    success: false,
                    failureReason: failureReasons.gameSessionNonExistant
                }));
                return;
            }

            if (gameSession.memberSocketIds.includes(socketId) || gameSession.joinRequestingSocketIds.includes(socketId)) {
                ws.send(JSON.stringify({
                    action: actions.outgoing.gameSessionJoinRequestResult,
                    success: false,
                    failureReason: failureReasons.gameSessionAlreadyJoined
                }));
                return;
            }

            gameSessionIdsForSocketIds[socketId] = gameSessionId;

            const gameSession = gameSessions.map(session => session.id === gameSessionId)[0];

            const joinRequestCode = randomstring.generate(4).toUpperCase();

            gameSession.joinRequests[joinRequestCode] = socketId;

            sockets[gameSession.hostSocketId].send(JSON.stringify({
                action: actions.outgoing.gameSessionJoinRequest,
                joinRequestCode: joinRequestCode
            }));

            ws.send(JSON.stringify({
                action: actions.outgoing.gameSessionJoinRequestResult,
                success: true,
                joinRequestCode: joinRequestCode
            }));

            break;
        }
        case actions.incoming.gameSessionJoinRequestResponse: {
            const gameSessionId = gameSessionIdsForSocketIds[socketId];
            const gameSessionExists = gameSessions.map(session => session.id === gameSessionId).length > 0;

            if (!gameSessionExists) {
                ws.send(JSON.stringify({
                    action: actions.outgoing.gameSessionJoinRequestResponseResult,
                    success: false,
                    failureReason: failureReasons.gameSessionNonExistant
                }));
                return;
            }

            const gameSession = gameSessions.map(session => session.id === gameSessionId)[0];

            const joinRequestCode = json["joinRequestCode"];
            const joinRequestSenderSocketId = gameSession.joinRequests[joinRequestCode];

            if (!joinRequestSenderSocketId) {
                ws.send(JSON.stringify({
                    action: actions.outgoing.gameSessionJoinRequestResponseResult,
                    success: false,
                    failureReason: failureReasons.invalidJoinRequestCode
                }));
                return;
            }

            delete gameSession.joinRequests[joinRequestCode];
            gameSession.memberSocketIds.push(joinRequestSenderSocketId);

            sockets[joinRequestSenderSocketId].send(JSON.stringify({
                action: actions.outgoing.gameSessionJoined,
                success: true
            }));

            sockets[gameSession.hostSocketId].send(JSON.stringify({
                action: actions.outgoing.gameSessionJoinRequestResponseResult,
                success: true,
                joinRequestCode: joinRequestCode,
                joinedMemberId: joinRequestSenderSocketId
            }));

            break;
        }
        case actions.incoming.doInput: {
            const gameSessionId = gameSessionIdsForSocketIds[socketId];
            const gameSessionExists = gameSessions.map(session => session.id === gameSessionId).length > 0;

            if (!gameSessionExists) {
                ws.send(JSON.stringify({
                    action: actions.outgoing.gameSessionJoinRequestResponseResult,
                    success: false,
                    failureReason: failureReasons.gameSessionNonExistant
                }));
                return;
            }

            const gameSession = gameSessions.map(session => session.id === gameSessionId)[0];

            sockets[gameSession.hostSocketId].send(JSON.stringify({
                action: actions.outgoing.inputReceived,
                type: json["type"],
                value: json["value"]
            }));
            break;
        }
        default:
            break;
    }
}

wsServer.on("connection", ws => {
    const socketId = randomstring.generate(16);

    sockets[socketId] = ws;

    ws.on("message", message => {
        const json = JSON.parse(message.toString());

        if (!json || !json["action"]) {
            return;
        }

        handleMessage(json, socketId);
    });

    ws.on("close", () => {
        delete sockets[socketId];
        delete gameSessionIdsForSocketIds[socketId];

        for (const gameSession of gameSessions) {
            gameSession.memberSocketIds = gameSession.memberSocketIds.map(memberSocketId => memberSocketId !== socketId);

            if (gameSession.hostSocketId === socketId) {
                for (const memberSocketId of gameSession.memberSocketIds) {
                    sockets[memberSocketId].send(JSON.stringify({
                        action: actions.outgoing.gameSessionClosed
                    }));
                }
            }
        }
    });
});