/**
 * index.ts - 服务器入口
 * 
 * Socket.io WebSocket 服务器，处理所有客户端事件并广播状态更新。
 * 整合 GameController 实现完整游戏流程。
 */

import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { roomManager } from './RoomManager.js';
import { gameController } from './GameController.js';
import { GamePhase } from './Interfaces.js';
import {
    ClientEvent,
    ServerEvent,
    type CreateRoomPayload,
    type JoinRoomPayload,
    type SitDownPayload,
    type PlayerActionPayload,
    type KickPlayerPayload,
    type ReconnectPayload,
    type ErrorPayload,
    type Room
} from './Interfaces.js';

const PORT = process.env.PORT || 3000;

// 创建 HTTP 服务器
const httpServer = createServer();

// 创建 Socket.io 服务器
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

console.log('🎰 Pocket Holdem 德州扑克服务器启动中...');

// ========================================
// 设置 GameController 超时回调
// ========================================

gameController.setTimeoutCallback((roomId: string, playerId: string) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const result = gameController.handleTimeout(room, playerId);
    if (result.success) {
        handleActionResult(room, result);
    }
});

// ========================================
// Socket 连接处理
// ========================================

io.on('connection', (socket: Socket) => {
    console.log(`[Socket] 新连接: ${socket.id}`);

    // ------------------------
    // 创建房间
    // ------------------------
    socket.on(ClientEvent.CREATE_ROOM, (payload: CreateRoomPayload) => {
        try {
            const { room, playerId } = roomManager.createRoom(
                payload.hostNickname,
                payload.config,
                socket.id
            );

            socket.join(room.id);

            socket.emit(ServerEvent.ROOM_CREATED, {
                room,
                myPlayerId: playerId,
                stateVersion: 0
            });

            console.log(`[Socket] 房间 ${room.id} 已创建`);
        } catch (error) {
            sendError(socket, 'CREATE_ROOM_FAILED', (error as Error).message);
        }
    });

    // ------------------------
    // 加入房间
    // ------------------------
    socket.on(ClientEvent.JOIN_ROOM, (payload: JoinRoomPayload) => {
        try {
            const result = roomManager.joinRoom(
                payload.roomId,
                payload.nickname,
                socket.id,
                payload.playerId
            );

            if (!result) {
                sendError(socket, 'ROOM_NOT_FOUND', '房间不存在', true);
                return;
            }

            socket.join(payload.roomId);

            const room = roomManager.getRoom(payload.roomId);
            const stateVersion = room?.gameState?.stateVersion ?? 0;

            socket.emit(ServerEvent.ROOM_JOINED, {
                room: result.room,
                myPlayerId: result.playerId,
                isReconnect: result.isReconnect,
                stateVersion
            });

            if (!result.isReconnect) {
                socket.to(payload.roomId).emit(ServerEvent.PLAYER_JOINED, {
                    room: result.room,
                    newPlayerId: result.playerId,
                    stateVersion
                });
            }

            console.log(`[Socket] 玩家加入房间 ${payload.roomId}`);
        } catch (error) {
            sendError(socket, 'JOIN_ROOM_FAILED', (error as Error).message);
        }
    });

    // ------------------------
    // 坐下
    // ------------------------
    socket.on(ClientEvent.SIT_DOWN, (payload: SitDownPayload) => {
        try {
            const playerInfo = roomManager.getPlayerBySocketId(socket.id);
            if (!playerInfo) {
                sendError(socket, 'NOT_IN_ROOM', '您不在任何房间中');
                return;
            }

            const result = roomManager.sitDown(playerInfo.player.id, payload.seatIndex);

            if (!result.success) {
                sendError(socket, result.error!, getSitDownErrorMessage(result.error!));
                return;
            }

            const room = roomManager.getRoom(playerInfo.room.id);
            if (room) {
                broadcastRoomState(room, ServerEvent.PLAYER_SAT, {
                    playerId: playerInfo.player.id,
                    seatIndex: payload.seatIndex
                });
            }
        } catch (error) {
            sendError(socket, 'SIT_DOWN_FAILED', (error as Error).message);
        }
    });

    // ------------------------
    // 站起
    // ------------------------
    socket.on(ClientEvent.STAND_UP, () => {
        try {
            const playerInfo = roomManager.getPlayerBySocketId(socket.id);
            if (!playerInfo) {
                sendError(socket, 'NOT_IN_ROOM', '您不在任何房间中');
                return;
            }

            const result = roomManager.standUp(playerInfo.player.id);

            if (!result.success) {
                sendError(socket, result.error!, getStandUpErrorMessage(result.error!));
                return;
            }

            const room = roomManager.getRoom(playerInfo.room.id);
            if (room) {
                broadcastRoomState(room, ServerEvent.PLAYER_STOOD, {
                    playerId: playerInfo.player.id
                });
            }
        } catch (error) {
            sendError(socket, 'STAND_UP_FAILED', (error as Error).message);
        }
    });

    // ------------------------
    // 开始游戏
    // ------------------------
    socket.on(ClientEvent.START_GAME, () => {
        try {
            const playerInfo = roomManager.getPlayerBySocketId(socket.id);
            if (!playerInfo) {
                sendError(socket, 'NOT_IN_ROOM', '您不在任何房间中');
                return;
            }

            // 检查权限
            const room = roomManager.getRoom(playerInfo.room.id);
            if (!room) {
                sendError(socket, 'ROOM_NOT_FOUND', '房间不存在');
                return;
            }

            if (playerInfo.player.id !== room.hostId) {
                sendError(socket, 'NOT_HOST', '只有房主可以开始游戏');
                return;
            }

            if (room.isPlaying) {
                sendError(socket, 'GAME_ALREADY_STARTED', '游戏已经开始了');
                return;
            }

            // 检查玩家人数
            const seatedPlayers = Array.from(room.players.values()).filter(p => p.seatIndex !== null);
            if (seatedPlayers.length < 2) {
                sendError(socket, 'NOT_ENOUGH_PLAYERS', '需要至少2名玩家才能开始');
                return;
            }

            // 通过 GameController 开始新手牌
            room.isPlaying = true;
            room.gameState = gameController.startNewHand(room);

            // 广播游戏开始
            const publicRoom = roomManager.getPublicRoomInfo(room);
            io.to(room.id).emit(ServerEvent.GAME_STARTED, {
                room: publicRoom,
                stateVersion: room.gameState.stateVersion,
                handId: room.gameState.handId
            });

            // 单独发送每个玩家的手牌
            room.players.forEach((player) => {
                if (player.socketId && player.holeCards.length > 0) {
                    io.to(player.socketId).emit(ServerEvent.DEAL_CARDS, {
                        holeCards: player.holeCards,
                        stateVersion: room.gameState!.stateVersion,
                        handId: room.gameState!.handId
                    });
                }
            });

            // 广播当前玩家回合
            if (room.gameState.currentPlayerIndex !== null) {
                io.to(room.id).emit(ServerEvent.PLAYER_TURN, {
                    playerIndex: room.gameState.currentPlayerIndex,
                    timeout: room.gameState.turnTimeout,
                    stateVersion: room.gameState.stateVersion
                });
            }

            console.log(`[Socket] 房间 ${room.id} 游戏开始，手牌 #${room.gameState.handNumber}`);
        } catch (error) {
            sendError(socket, 'START_GAME_FAILED', (error as Error).message);
        }
    });

    // ------------------------
    // 玩家操作（核心）
    // ------------------------
    socket.on(ClientEvent.PLAYER_ACTION, (payload: PlayerActionPayload) => {
        try {
            const playerInfo = roomManager.getPlayerBySocketId(socket.id);
            if (!playerInfo) {
                sendError(socket, 'NOT_IN_ROOM', '您不在任何房间中');
                return;
            }

            const room = roomManager.getRoom(playerInfo.room.id);
            if (!room || !room.gameState) {
                sendError(socket, 'GAME_NOT_STARTED', '游戏尚未开始');
                return;
            }

            // 通过 GameController 处理操作
            const result = gameController.processAction(room, playerInfo.player, payload);

            if (!result.success) {
                sendError(socket, result.error!, getActionErrorMessage(result.error!));
                return;
            }

            // 处理操作结果
            handleActionResult(room, result);

        } catch (error) {
            sendError(socket, 'ACTION_FAILED', (error as Error).message);
        }
    });

    // ------------------------
    // 踢出玩家
    // ------------------------
    socket.on(ClientEvent.KICK_PLAYER, (payload: KickPlayerPayload) => {
        try {
            const playerInfo = roomManager.getPlayerBySocketId(socket.id);
            if (!playerInfo) {
                sendError(socket, 'NOT_IN_ROOM', '您不在任何房间中');
                return;
            }

            const result = roomManager.kickPlayer(
                playerInfo.player.id,
                payload.targetPlayerId
            );

            if (!result.success) {
                sendError(socket, result.error!, getKickPlayerErrorMessage(result.error!));
                return;
            }

            const room = roomManager.getRoom(playerInfo.room.id);
            if (room) {
                broadcastRoomState(room, ServerEvent.PLAYER_LEFT, {
                    playerId: payload.targetPlayerId,
                    reason: 'kicked'
                });
            }
        } catch (error) {
            sendError(socket, 'KICK_PLAYER_FAILED', (error as Error).message);
        }
    });

    // ------------------------
    // 断线重连
    // ------------------------
    socket.on(ClientEvent.RECONNECT, (payload: ReconnectPayload) => {
        try {
            const result = roomManager.joinRoom(
                payload.roomId,
                '',
                socket.id,
                payload.playerId
            );

            if (!result) {
                sendError(socket, 'RECONNECT_FAILED', '重连失败，房间可能已不存在', true);
                return;
            }

            socket.join(payload.roomId);

            const room = roomManager.getRoom(payload.roomId);
            const player = room?.players.get(payload.playerId);

            socket.emit(ServerEvent.RECONNECTED, {
                room: result.room,
                myPlayerId: result.playerId,
                myCards: player?.holeCards || [],
                stateVersion: room?.gameState?.stateVersion ?? 0,
                handId: room?.gameState?.handId,
                roundId: room?.gameState?.roundId
            });

            console.log(`[Socket] 玩家 ${payload.playerId} 重连成功`);
        } catch (error) {
            sendError(socket, 'RECONNECT_FAILED', (error as Error).message);
        }
    });

    // ------------------------
    // 离开房间
    // ------------------------
    socket.on(ClientEvent.LEAVE_ROOM, () => {
        handlePlayerLeave(socket);
    });

    // ------------------------
    // 断开连接
    // ------------------------
    socket.on('disconnect', () => {
        console.log(`[Socket] 连接断开: ${socket.id}`);
        const playerInfo = roomManager.getPlayerBySocketId(socket.id);
        if (playerInfo) {
            playerInfo.player.markDisconnected();
            console.log(`[Socket] 玩家 ${playerInfo.player.nickname} 已断线，等待重连`);
        }
    });
});

// ========================================
// 游戏流程辅助函数
// ========================================

/**
 * 处理操作结果
 */
function handleActionResult(room: Room, result: ReturnType<typeof gameController.processAction>): void {
    const gameState = room.gameState!;

    // 广播玩家操作
    io.to(room.id).emit(ServerEvent.PLAYER_ACTED, {
        room: roomManager.getPublicRoomInfo(room),
        stateVersion: gameState.stateVersion
    });

    // 检查是否需要结束手牌
    if (result.shouldEndHand) {
        endCurrentHand(room);
        return;
    }

    // 检查是否需要推进阶段
    if (result.shouldAdvancePhase) {
        const nextPhase = gameController.advancePhaseOrShowdown(room);

        if (nextPhase === 'END_HAND' || nextPhase === 'SHOWDOWN') {
            endCurrentHand(room);
        } else {
            // 开始新的下注轮
            gameController.startBettingRound(room, nextPhase);

            // 广播新阶段
            io.to(room.id).emit(ServerEvent.SYNC_STATE, {
                room: roomManager.getPublicRoomInfo(room),
                stateVersion: gameState.stateVersion,
                handId: gameState.handId,
                roundId: gameState.roundId
            });

            // 广播当前玩家回合
            if (gameState.currentPlayerIndex !== null) {
                io.to(room.id).emit(ServerEvent.PLAYER_TURN, {
                    playerIndex: gameState.currentPlayerIndex,
                    timeout: gameState.turnTimeout,
                    stateVersion: gameState.stateVersion
                });
            }
        }
    } else {
        // 广播当前玩家回合
        if (gameState.currentPlayerIndex !== null) {
            io.to(room.id).emit(ServerEvent.PLAYER_TURN, {
                playerIndex: gameState.currentPlayerIndex,
                timeout: gameState.turnTimeout,
                stateVersion: gameState.stateVersion
            });
        }
    }
}

/**
 * 结束当前手牌
 */
function endCurrentHand(room: Room): void {
    const { result, gameEnded } = gameController.endHand(room);

    // 广播手牌结果
    io.to(room.id).emit(ServerEvent.HAND_RESULT, {
        ...result,
        stateVersion: room.gameState!.stateVersion,
        handId: room.gameState!.handId
    });

    if (gameEnded) {
        // 游戏结束
        room.isPlaying = false;
        room.gameState!.phase = GamePhase.IDLE;

        io.to(room.id).emit(ServerEvent.GAME_ENDED, {
            room: roomManager.getPublicRoomInfo(room),
            winner: result.winners[0],
            stateVersion: room.gameState!.stateVersion
        });

        console.log(`[Socket] 房间 ${room.id} 游戏结束`);
    } else {
        // 延迟后开始新手牌
        setTimeout(() => {
            if (room.isPlaying) {
                startNewHandInRoom(room);
            }
        }, 3000);
    }
}

/**
 * 在房间内开始新手牌
 */
function startNewHandInRoom(room: Room): void {
    try {
        room.gameState = gameController.startNewHand(room);

        // 广播新手牌开始
        io.to(room.id).emit(ServerEvent.SYNC_STATE, {
            room: roomManager.getPublicRoomInfo(room),
            stateVersion: room.gameState.stateVersion,
            handId: room.gameState.handId,
            roundId: room.gameState.roundId
        });

        // 发送每个玩家的手牌
        room.players.forEach((player) => {
            if (player.socketId && player.holeCards.length > 0) {
                io.to(player.socketId).emit(ServerEvent.DEAL_CARDS, {
                    holeCards: player.holeCards,
                    stateVersion: room.gameState!.stateVersion,
                    handId: room.gameState!.handId
                });
            }
        });

        // 广播当前玩家回合
        if (room.gameState.currentPlayerIndex !== null) {
            io.to(room.id).emit(ServerEvent.PLAYER_TURN, {
                playerIndex: room.gameState.currentPlayerIndex,
                timeout: room.gameState.turnTimeout,
                stateVersion: room.gameState.stateVersion
            });
        }

        console.log(`[Socket] 房间 ${room.id} 新手牌 #${room.gameState.handNumber} 开始`);
    } catch (error) {
        console.error(`[Socket] 开始新手牌失败:`, error);
        room.isPlaying = false;
    }
}

// ========================================
// 通用辅助函数
// ========================================

/**
 * 广播房间状态
 */
function broadcastRoomState(room: Room, event: ServerEvent, extra?: object): void {
    const publicRoom = roomManager.getPublicRoomInfo(room);
    io.to(room.id).emit(event, {
        room: publicRoom,
        stateVersion: room.gameState?.stateVersion ?? 0,
        ...extra
    });
}

/**
 * 发送错误消息
 */
function sendError(socket: Socket, code: string, message: string, shouldClearSession = false): void {
    const payload: ErrorPayload & { shouldClearSession?: boolean } = {
        code,
        message,
        shouldClearSession
    };
    socket.emit(ServerEvent.ERROR, payload);
}

/**
 * 处理玩家离开
 */
function handlePlayerLeave(socket: Socket): void {
    const playerInfo = roomManager.getPlayerBySocketId(socket.id);
    if (!playerInfo) return;

    const roomId = playerInfo.room.id;
    const result = roomManager.leaveRoom(playerInfo.player.id);

    if (result) {
        socket.leave(roomId);

        if (!result.shouldDestroyRoom) {
            const room = roomManager.getRoom(roomId);
            if (room) {
                broadcastRoomState(room, ServerEvent.PLAYER_LEFT, {
                    playerId: playerInfo.player.id,
                    reason: 'left'
                });

                if (result.newHostId) {
                    broadcastRoomState(room, ServerEvent.ROOM_UPDATED, {
                        message: '房主已变更'
                    });
                }
            }
        } else {
            // 房间已销毁，清理相关计时器
            gameController.clearRoomTimers(roomId);
        }
    }
}

// ========================================
// 错误消息翻译
// ========================================

function getSitDownErrorMessage(error: string): string {
    const messages: Record<string, string> = {
        'PLAYER_NOT_IN_ROOM': '您不在任何房间中',
        'ROOM_NOT_FOUND': '房间不存在',
        'PLAYER_NOT_FOUND': '玩家不存在',
        'INVALID_SEAT_INDEX': '无效的座位',
        'SEAT_OCCUPIED': '该座位已被占用',
        'ALREADY_SEATED': '您已经在座位上了'
    };
    return messages[error] || '入座失败';
}

function getStandUpErrorMessage(error: string): string {
    const messages: Record<string, string> = {
        'NOT_SEATED': '您没有在座位上',
        'GAME_IN_PROGRESS': '游戏进行中无法站起'
    };
    return messages[error] || '站起失败';
}

function getKickPlayerErrorMessage(error: string): string {
    const messages: Record<string, string> = {
        'NOT_HOST': '只有房主可以踢人',
        'GAME_IN_PROGRESS': '游戏进行中无法踢人',
        'CANNOT_KICK_SELF': '不能踢出自己',
        'TARGET_NOT_FOUND': '目标玩家不存在'
    };
    return messages[error] || '踢出失败';
}

function getActionErrorMessage(error: string): string {
    const messages: Record<string, string> = {
        'GAME_NOT_STARTED': '游戏尚未开始',
        'DUPLICATE_REQUEST': '重复请求',
        'STALE_REQUEST': '请求已过期',
        'NOT_YOUR_TURN': '不是您的回合',
        'CANNOT_ACT': '无法执行操作',
        'CANNOT_CHECK_MUST_CALL': '必须跟注才能继续',
        'NOTHING_TO_CALL': '无需跟注',
        'RAISE_TOO_SMALL': '加注金额太小',
        'NOT_ENOUGH_CHIPS': '筹码不足'
    };
    return messages[error] || '操作失败';
}

// ========================================
// 启动服务器
// ========================================

httpServer.listen(PORT, () => {
    console.log(`🎰 Pocket Holdem 服务器已启动`);
    console.log(`   监听端口: ${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
});
