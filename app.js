// Import the library that manages the WebSocket
// server and connection handling
// (https://npmjs.com/package/ws)
import { WebSocketServer } from "ws";
// Import a library used for generating random strings
// (https://npmjs.com/package/randomstring)
import randomstring from "randomstring";

// List of the actions and their identifiers
// that can be sent from or to clients
const actions = {
    incoming: {
        createGameSession: "create-game-session",
        joinGameSession: "join-game-session",
        gameSessionJoinRequestResponse: "game-session-join-request-response",
        doInput: "do-input"
    },
    outgoing: {
        gameSessionCreationResult: "game-session-creation-result",
        gameSessionJoinRequest: "game-session-join-request",
        gameSessionJoinRequestResult: "game-session-join-request-result",
        gameSessionJoinRequestResponseResult: "game-session-join-request-response-result",
        gameSessionJoined: "game-session-joined",
        joinRequestDenied: "join-request-denied",
        inputReceived: "input-received",
        gameSessionClosed: "game-session-closed",
        memberDisconnected: "member-disconnected"
    }
};

// List of possible failure reasons and their identifiers
const failureReasons = {
    gameSessionNonExistant: "game-session-non-existant",
    gameSessionAlreadyJoined: "game-session-already-joined",
    invalidJoinRequestCode: "invalid-join-request-code"
}

// Create a new WebSocket server on the port
// specified in the PORT environment variable
// or 4000 if none specified
const wsServer = new WebSocketServer({ port: process.env.PORT || 4000 });

// Dictionary storing WebSocket objects for socket ids
let sockets = {};
// Dictionary storing game session ids for socket ids
let gameSessionIdsForSocketIds = {};
// List of all active game sessions
let gameSessions = [];

// Handle an incoming message with a set action
const handleMessage = (json, ws, socketId) => {
    switch (json["action"]) {
        case actions.incoming.createGameSession: {
            // Generate a unique identifier for the session
            const gameSessionId = randomstring.generate(12);

            // Create the game session and add it to
            // the list of game sessions
            gameSessions.push({
                id: gameSessionId,
                hostSocketId: socketId,
                memberSocketIds: [],
                joinRequests: {}
            });

            // Store the game session for the socket id
            gameSessionIdsForSocketIds[socketId] = gameSessionId;

            // Inform the client that the game session was
            // created successfully
            ws.send(JSON.stringify({
                action: actions.outgoing.gameSessionCreationResult,
                success: true,
                gameSessionId: gameSessionId
            }));
            break;
        }
        case actions.incoming.joinGameSession: {
            // Check if a game session with the given identifier exists
            const gameSessionId = json["gameSessionId"];
            const gameSessionExists = gameSessions.map(session => session.id === gameSessionId).length > 0;

            // If the game session doesn't exist, inform
            // the client about the error
            if (!gameSessionExists) {
                ws.send(JSON.stringify({
                    action: actions.outgoing.gameSessionJoinRequestResult,
                    success: false,
                    failureReason: failureReasons.gameSessionNonExistant
                }));
                return;
            }

            // If the client is already a member of or trying to join
            // the game session, inform the client about the error
            if (gameSession.memberSocketIds.includes(socketId) || gameSession.joinRequestingSocketIds.includes(socketId)) {
                ws.send(JSON.stringify({
                    action: actions.outgoing.gameSessionJoinRequestResult,
                    success: false,
                    failureReason: failureReasons.gameSessionAlreadyJoined
                }));
                return;
            }

            // Store the game session for the socket id
            gameSessionIdsForSocketIds[socketId] = gameSessionId;

            // Find the correct game session
            const gameSession = gameSessions.map(session => session.id === gameSessionId)[0];

            // Generate a code for the join request
            // (can be displayed in a prompt on the host and on the client
            // so it can be verified that the correct device
            // is trying to join the game)
            const joinRequestCode = randomstring.generate(4).toUpperCase();

            // Add the join request to the game session
            gameSession.joinRequests[joinRequestCode] = socketId;

            // Inform the host about the join request
            sockets[gameSession.hostSocketId].send(JSON.stringify({
                action: actions.outgoing.gameSessionJoinRequest,
                joinRequestCode: joinRequestCode
            }));

            // Inform the client about the successful creation
            // of the join request
            ws.send(JSON.stringify({
                action: actions.outgoing.gameSessionJoinRequestResult,
                success: true,
                joinRequestCode: joinRequestCode
            }));

            break;
        }
        case actions.incoming.gameSessionJoinRequestResponse: {
            // Check if a game session with the given identifier exists
            const gameSessionId = gameSessionIdsForSocketIds[socketId];
            const gameSessionExists = gameSessions.map(session => session.id === gameSessionId).length > 0;

            // If the game session doesn't exist, inform
            // the client about the error
            if (!gameSessionExists) {
                ws.send(JSON.stringify({
                    action: actions.outgoing.gameSessionJoinRequestResponseResult,
                    success: false,
                    failureReason: failureReasons.gameSessionNonExistant
                }));
                return;
            }

            // Find the correct game session
            const gameSession = gameSessions.map(session => session.id === gameSessionId)[0];

            // Check if a join request with the given identifier exists
            const joinRequestCode = json["joinRequestCode"];
            const joinRequestSenderSocketId = gameSession.joinRequests[joinRequestCode];

            // If the join request doesn't exist,
            // inform the client about the error
            if (!joinRequestSenderSocketId) {
                ws.send(JSON.stringify({
                    action: actions.outgoing.gameSessionJoinRequestResponseResult,
                    success: false,
                    failureReason: failureReasons.invalidJoinRequestCode
                }));
                return;
            }

            // Delete the join request
            delete gameSession.joinRequests[joinRequestCode];

            // Check if the join requested has been accepted
            const hasAcceptedJoinRequest = json["hasAccepted"];

            // If the join request was denied,
            // inform the sender of the request
            if (!hasAcceptedJoinRequest) {
                sockets[joinRequestSenderSocketId].send(JSON.stringify({
                    action: actions.outgoing.joinRequestDenied
                }));
                return;
            }

            // Add the client to the members of the game session
            gameSession.memberSocketIds.push(joinRequestSenderSocketId);

            // Inform the sender of the join request
            // about having successfully joined the game session
            sockets[joinRequestSenderSocketId].send(JSON.stringify({
                action: actions.outgoing.gameSessionJoined,
                success: true
            }));

            // Inform the host that the client has joined
            // the game session and send the identifier of the new member
            ws.send(JSON.stringify({
                action: actions.outgoing.gameSessionJoinRequestResponseResult,
                success: true,
                joinRequestCode: joinRequestCode,
                joinedMemberId: joinRequestSenderSocketId
            }));

            break;
        }
        case actions.incoming.doInput: {
            // Check if a game session with the given identifier exists
            const gameSessionId = gameSessionIdsForSocketIds[socketId];
            const gameSessionExists = gameSessions.map(session => session.id === gameSessionId).length > 0;

            // If the game session doesn't exist, fail silently
            if (!gameSessionExists) {
                return;
            }

            // Find the correct game session
            const gameSession = gameSessions.map(session => session.id === gameSessionId)[0];

            // Inform the host about the client's input type and value
            // (e.g. type: left stick moved, value: 0.6)
            sockets[gameSession.hostSocketId].send(JSON.stringify({
                action: actions.outgoing.inputReceived,
                memberId: socketId,
                type: json["type"],
                value: json["value"]
            }));
            break;
        }
        default:
            break;
    }
}

// When a new client connects
wsServer.on("connection", ws => {
    // Generate a unique identifier for the client
    const socketId = randomstring.generate(16);

    // Store the socket object for the socket identifier
    sockets[socketId] = ws;

    // When a client sends a message
    ws.on("message", message => {
        try {
            // Parse the message into JSON
            const json = JSON.parse(message.toString());

            // Ignore the message if it doesn't have an action set
            if (!json || !json["action"]) {
                return;
            }

            // Handle the message correctly
            handleMessage(json, ws, socketId);
        } catch (error) {
            // Catch JSON parsing errors etc.
            console.log("Error while handling message: " + error);
        }
    });

    // When a client disconnects
    ws.on("close", () => {
        // Delete references to the socket
        delete sockets[socketId];
        delete gameSessionIdsForSocketIds[socketId];

        // Check if the client was a member of any game sessions
        for (const gameSession of gameSessions) {
            // If the client was the host of a game session
            if (gameSession.hostSocketId === socketId) {
                // Send a notice to all members that the game session is closing
                for (const memberSocketId of gameSession.memberSocketIds) {
                    sockets[memberSocketId].send(JSON.stringify({
                        action: actions.outgoing.gameSessionClosed
                    }));
                }

                // Delete the game session
                gameSessions = gameSessions.map(session => session.id !== gameSession.id);
            } else {
                // Remove the client from the game session's members if they
                // were a member and check if they were a member
                const updatedMemberList = gameSession.memberSocketIds.map(memberSocketId => memberSocketId !== socketId);
                const wasMemberOfGameSession = updatedMemberList.length !== gameSession.memberSocketIds.length;
                gameSession.memberSocketIds = updatedMemberList;

                // If they were a member of the session
                if (wasMemberOfGameSession) {
                    // Inform the host that a member has disconnected
                    sockets[gameSession.hostSocketId].send(JSON.stringify({
                        action: actions.outgoing.memberDisconnected,
                        memberId: socketId
                    }));
                }
            }
        }
    });
});