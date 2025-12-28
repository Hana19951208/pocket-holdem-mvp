/**
 * RoomManager.ts - 房间管理器
 * 
 * 负责房间的生命周期管理：
 * - 创建/销毁房间
 * - 玩家加入/离开
 * - 座位管理
 * - 状态广播
 */

import { v4 as uuidv4 } from 'uuid';
import {
    type Room,
    type RoomConfig,
    type PublicRoomInfo,
    type PublicPlayerInfo,
    type PublicGameState,
    type GameState,
    GamePhase
} from './Interfaces.js';
import { Player } from './Player.js';
import { PokerEngine } from './PokerEngine.js';

/** 默认房间配置 */
const DEFAULT_ROOM_CONFIG: RoomConfig = {
    initialChips: 1000,
    smallBlind: 5,
    bigBlind: 10,
    maxPlayers: 9,
    turnTimeout: 30
};

/**
 * 房间管理器
 * 
 * 单例模式，管理所有活跃房间
 */
export class RoomManager {
    /** 房间存储（房间号 -> 房间对象） */
    private rooms: Map<string, Room> = new Map();

    /** 玩家 -> 房间映射（用于快速查找玩家所在房间） */
    private playerRoomMap: Map<string, string> = new Map();

    /** Socket -> 玩家映射（用于断线处理） */
    private socketPlayerMap: Map<string, string> = new Map();

    // ========================================
    // 房间管理
    // ========================================

    /**
     * 创建新房间
     * @param hostNickname 房主昵称
     * @param config 房间配置（可选，会与默认配置合并）
     * @param hostSocketId 房主的 Socket ID
     * @returns 房间信息和房主玩家 ID
     */
    createRoom(
        hostNickname: string,
        config: Partial<RoomConfig> = {},
        hostSocketId: string
    ): { room: PublicRoomInfo; playerId: string } {
        // 生成 6 位数字房间号
        const roomId = this.generateRoomId();

        // 创建房主玩家
        const host = new Player({
            nickname: hostNickname,
            chips: 0, // 初始为 0，入座后才获得筹码
            isHost: true,
            socketId: hostSocketId
        });

        // 合并配置
        const finalConfig: RoomConfig = {
            ...DEFAULT_ROOM_CONFIG,
            ...config
        };

        // 创建房间
        const room: Room = {
            id: roomId,
            hostId: host.id,
            config: finalConfig,
            players: new Map([[host.id, host]]),
            seatMap: new Array(finalConfig.maxPlayers).fill(null),
            gameState: null,
            spectators: new Set([host.id]),
            isPlaying: false,
            createdAt: Date.now()
        };

        // 保存房间
        this.rooms.set(roomId, room);
        this.playerRoomMap.set(host.id, roomId);
        this.socketPlayerMap.set(hostSocketId, host.id);

        console.log(`[RoomManager] 房间 ${roomId} 已创建，房主: ${hostNickname}`);

        return {
            room: this.getPublicRoomInfo(room),
            playerId: host.id
        };
    }

    /**
     * 生成唯一的 6 位数字房间号
     */
    private generateRoomId(): string {
        let roomId: string;
        do {
            roomId = Math.floor(100000 + Math.random() * 900000).toString();
        } while (this.rooms.has(roomId));
        return roomId;
    }

    /**
     * 获取房间（内部用）
     */
    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    /**
     * 销毁房间
     */
    destroyRoom(roomId: string): void {
        const room = this.rooms.get(roomId);
        if (!room) return;

        // 清理玩家映射
        room.players.forEach((player) => {
            this.playerRoomMap.delete(player.id);
            if (player.socketId) {
                this.socketPlayerMap.delete(player.socketId);
            }
        });

        this.rooms.delete(roomId);
        console.log(`[RoomManager] 房间 ${roomId} 已销毁`);
    }

    // ========================================
    // 玩家管理
    // ========================================

    /**
     * 玩家加入房间
     * @param roomId 房间号
     * @param nickname 昵称
     * @param socketId Socket ID
     * @param existingPlayerId 可选，用于重连
     * @returns 房间信息和玩家 ID，或 null（房间不存在）
     */
    joinRoom(
        roomId: string,
        nickname: string,
        socketId: string,
        existingPlayerId?: string
    ): { room: PublicRoomInfo; playerId: string; isReconnect: boolean } | null {
        const room = this.rooms.get(roomId);
        if (!room) {
            return null;
        }

        // 检查是否为重连
        if (existingPlayerId) {
            const existingPlayer = room.players.get(existingPlayerId);
            if (existingPlayer) {
                // 重连：更新 Socket ID
                existingPlayer.updateSocketId(socketId);
                this.socketPlayerMap.set(socketId, existingPlayerId);

                console.log(`[RoomManager] 玩家 ${nickname} 重连到房间 ${roomId}`);

                return {
                    room: this.getPublicRoomInfo(room),
                    playerId: existingPlayerId,
                    isReconnect: true
                };
            }
        }

        // 新玩家加入
        const player = new Player({
            nickname,
            chips: 0, // 入座后才获得筹码
            socketId
        });

        room.players.set(player.id, player);
        room.spectators.add(player.id);
        this.playerRoomMap.set(player.id, roomId);
        this.socketPlayerMap.set(socketId, player.id);

        console.log(`[RoomManager] 玩家 ${nickname} 加入房间 ${roomId}`);

        return {
            room: this.getPublicRoomInfo(room),
            playerId: player.id,
            isReconnect: false
        };
    }

    /**
     * 玩家离开房间
     */
    leaveRoom(playerId: string): {
        roomId: string;
        shouldDestroyRoom: boolean;
        newHostId?: string;
    } | null {
        const roomId = this.playerRoomMap.get(playerId);
        if (!roomId) return null;

        const room = this.rooms.get(roomId);
        if (!room) return null;

        const player = room.players.get(playerId);
        if (!player) return null;

        // 游戏进行中不允许离开（只能断开连接）
        if (room.isPlaying && player.seatIndex !== null) {
            console.log(`[RoomManager] 玩家 ${player.nickname} 尝试在游戏中离开，已拒绝`);
            return null;
        }

        // 如果在座位上，先站起
        if (player.seatIndex !== null) {
            this.standUp(playerId);
        }

        // 移除玩家
        room.players.delete(playerId);
        room.spectators.delete(playerId);
        this.playerRoomMap.delete(playerId);
        if (player.socketId) {
            this.socketPlayerMap.delete(player.socketId);
        }

        console.log(`[RoomManager] 玩家 ${player.nickname} 离开房间 ${roomId}`);

        // 检查是否需要销毁房间或转移房主
        if (room.players.size === 0) {
            this.destroyRoom(roomId);
            return { roomId, shouldDestroyRoom: true };
        }

        // 如果离开的是房主，转移房主身份
        let newHostId: string | undefined;
        if (player.isHost) {
            const newHost = room.players.values().next().value;
            if (newHost) {
                newHost.isHost = true;
                room.hostId = newHost.id;
                newHostId = newHost.id;
                console.log(`[RoomManager] 房主转移给 ${newHost.nickname}`);
            }
        }

        return { roomId, shouldDestroyRoom: false, newHostId };
    }

    /**
     * 通过 Socket ID 获取玩家信息
     */
    getPlayerBySocketId(socketId: string): {
        player: Player;
        room: Room;
    } | null {
        const playerId = this.socketPlayerMap.get(socketId);
        if (!playerId) return null;

        const roomId = this.playerRoomMap.get(playerId);
        if (!roomId) return null;

        const room = this.rooms.get(roomId);
        if (!room) return null;

        const player = room.players.get(playerId);
        if (!player) return null;

        return { player, room };
    }

    // ========================================
    // 座位管理
    // ========================================

    /**
     * 玩家入座
     * @param playerId 玩家 ID
     * @param seatIndex 座位索引
     * @returns 成功返回 true，失败返回 false 和原因
     */
    sitDown(
        playerId: string,
        seatIndex: number
    ): { success: boolean; error?: string } {
        const roomId = this.playerRoomMap.get(playerId);
        if (!roomId) {
            return { success: false, error: 'PLAYER_NOT_IN_ROOM' };
        }

        const room = this.rooms.get(roomId);
        if (!room) {
            return { success: false, error: 'ROOM_NOT_FOUND' };
        }

        const player = room.players.get(playerId);
        if (!player) {
            return { success: false, error: 'PLAYER_NOT_FOUND' };
        }

        // 检查座位索引是否有效
        if (seatIndex < 0 || seatIndex >= room.config.maxPlayers) {
            return { success: false, error: 'INVALID_SEAT_INDEX' };
        }

        // 检查座位是否已被占用
        if (room.seatMap[seatIndex] !== null) {
            return { success: false, error: 'SEAT_OCCUPIED' };
        }

        // 检查玩家是否已经在座位上
        if (player.seatIndex !== null) {
            return { success: false, error: 'ALREADY_SEATED' };
        }

        // 游戏进行中，新玩家只能等待下一局
        const isWaitingForNextHand = room.isPlaying;

        // 入座
        room.seatMap[seatIndex] = playerId;
        room.spectators.delete(playerId);
        player.sitDown(seatIndex);
        player.chips = room.config.initialChips;

        // 如果游戏进行中，标记为等待下一局
        if (isWaitingForNextHand) {
            player.markAsWaiting();
        }

        console.log(`[RoomManager] 玩家 ${player.nickname} 入座位置 ${seatIndex}` +
            (isWaitingForNextHand ? '（等待下一局）' : ''));

        return { success: true };
    }

    /**
     * 玩家站起
     */
    standUp(playerId: string): { success: boolean; error?: string } {
        const roomId = this.playerRoomMap.get(playerId);
        if (!roomId) {
            return { success: false, error: 'PLAYER_NOT_IN_ROOM' };
        }

        const room = this.rooms.get(roomId);
        if (!room) {
            return { success: false, error: 'ROOM_NOT_FOUND' };
        }

        const player = room.players.get(playerId);
        if (!player) {
            return { success: false, error: 'PLAYER_NOT_FOUND' };
        }

        // 检查玩家是否在座位上
        if (player.seatIndex === null) {
            return { success: false, error: 'NOT_SEATED' };
        }

        // 游戏进行中不允许站起
        if (room.isPlaying) {
            return { success: false, error: 'GAME_IN_PROGRESS' };
        }

        // 站起
        const seatIndex = player.seatIndex;
        room.seatMap[seatIndex] = null;
        room.spectators.add(playerId);
        player.standUp();

        console.log(`[RoomManager] 玩家 ${player.nickname} 从位置 ${seatIndex} 站起`);

        return { success: true };
    }

    /**
     * 踢出玩家（仅房主可用）
     */
    kickPlayer(
        hostId: string,
        targetPlayerId: string
    ): { success: boolean; error?: string } {
        const roomId = this.playerRoomMap.get(hostId);
        if (!roomId) {
            return { success: false, error: 'HOST_NOT_IN_ROOM' };
        }

        const room = this.rooms.get(roomId);
        if (!room) {
            return { success: false, error: 'ROOM_NOT_FOUND' };
        }

        const host = room.players.get(hostId);
        if (!host || !host.isHost) {
            return { success: false, error: 'NOT_HOST' };
        }

        // 游戏进行中不允许踢人
        if (room.isPlaying) {
            return { success: false, error: 'GAME_IN_PROGRESS' };
        }

        // 不能踢自己
        if (hostId === targetPlayerId) {
            return { success: false, error: 'CANNOT_KICK_SELF' };
        }

        const target = room.players.get(targetPlayerId);
        if (!target) {
            return { success: false, error: 'TARGET_NOT_FOUND' };
        }

        // 执行踢出
        this.leaveRoom(targetPlayerId);

        console.log(`[RoomManager] 房主踢出玩家 ${target.nickname}`);

        return { success: true };
    }

    // ========================================
    // 游戏状态管理
    // ========================================

    /**
     * 开始游戏（仅房主可用）
     */
    startGame(hostId: string): {
        success: boolean;
        error?: string;
        gameState?: PublicGameState;
    } {
        const roomId = this.playerRoomMap.get(hostId);
        if (!roomId) {
            return { success: false, error: 'HOST_NOT_IN_ROOM' };
        }

        const room = this.rooms.get(roomId);
        if (!room) {
            return { success: false, error: 'ROOM_NOT_FOUND' };
        }

        const host = room.players.get(hostId);
        if (!host || !host.isHost) {
            return { success: false, error: 'NOT_HOST' };
        }

        // 检查是否已在游戏中
        if (room.isPlaying) {
            return { success: false, error: 'GAME_ALREADY_STARTED' };
        }

        // 检查玩家人数
        const seatedPlayers = this.getSeatedPlayers(room);
        if (seatedPlayers.length < 2) {
            return { success: false, error: 'NOT_ENOUGH_PLAYERS' };
        }

        // 初始化游戏状态
        room.isPlaying = true;
        room.gameState = this.initializeGameState(room, seatedPlayers);

        console.log(`[RoomManager] 房间 ${roomId} 游戏开始`);

        return {
            success: true,
            gameState: this.getPublicGameState(room.gameState)
        };
    }

    /**
     * 初始化游戏状态
     */
    private initializeGameState(room: Room, players: Player[]): GameState {
        // 创建并洗牌
        const deck = PokerEngine.shuffleDeck(PokerEngine.createDeck());

        // 确定庄家位置（第一局：随机选一个座位作为庄家）
        const randomDealerIndex = players[Math.floor(Math.random() * players.length)].seatIndex!;

        // 确定盲注位置
        const { smallBlindIndex, bigBlindIndex } = PokerEngine.getBlindsIndexes(
            randomDealerIndex,
            players
        );

        // 设置庄家标记
        players.forEach(p => {
            p.isDealer = p.seatIndex === randomDealerIndex;
        });

        // 创建游戏状态
        const gameState: GameState = {
            phase: GamePhase.PRE_FLOP,
            communityCards: [],
            pots: [{ amount: 0, eligiblePlayerIds: players.map(p => p.id) }],
            currentPlayerIndex: null,
            dealerIndex: randomDealerIndex,
            smallBlindIndex,
            bigBlindIndex,
            currentBet: room.config.bigBlind,
            minRaise: room.config.bigBlind,
            roundIndex: 1,
            turnTimeout: Date.now() + room.config.turnTimeout * 1000,
            // 版本化字段
            stateVersion: 1,
            handId: uuidv4(),
            roundId: uuidv4(),
            deck,
            handNumber: 1,
            actionHistory: []
        };

        // 收取盲注
        const smallBlindPlayer = players.find(p => p.seatIndex === smallBlindIndex);
        const bigBlindPlayer = players.find(p => p.seatIndex === bigBlindIndex);

        if (smallBlindPlayer) {
            smallBlindPlayer.deductChips(room.config.smallBlind);
            gameState.pots[0].amount += room.config.smallBlind;
        }

        if (bigBlindPlayer) {
            bigBlindPlayer.deductChips(room.config.bigBlind);
            gameState.pots[0].amount += room.config.bigBlind;
        }

        // 发底牌
        PokerEngine.dealHoleCards(players, deck, randomDealerIndex);

        // 重置玩家状态
        players.forEach(p => p.resetForNewHand());
        players.forEach(p => {
            if (p.chips > 0 && p.seatIndex !== null) {
                p.status = 'ACTIVE' as any;
            }
        });

        // 确定第一个行动的玩家（大盲后面）
        const firstActorIndex = PokerEngine.getNextActingPlayer(players, bigBlindIndex);
        gameState.currentPlayerIndex = firstActorIndex;

        if (firstActorIndex !== null) {
            const firstPlayer = players.find(p => p.seatIndex === firstActorIndex);
            if (firstPlayer) {
                firstPlayer.isCurrentTurn = true;
            }
        }

        return gameState;
    }

    /**
     * 获取已入座的玩家列表
     */
    getSeatedPlayers(room: Room): Player[] {
        return Array.from(room.players.values())
            .filter(p => p.seatIndex !== null)
            .sort((a, b) => a.seatIndex! - b.seatIndex!);
    }

    /**
     * 获取可参与游戏的玩家列表（有座位且有筹码的）
     */
    getActivePlayers(room: Room): Player[] {
        return this.getSeatedPlayers(room).filter(p =>
            p.chips > 0 &&
            p.status !== 'ELIMINATED' &&
            p.status !== 'WAITING'
        );
    }

    // ========================================
    // 数据导出（公开版本，不含敏感信息）
    // ========================================

    /**
     * 获取房间的公开信息
     */
    getPublicRoomInfo(room: Room): PublicRoomInfo {
        return {
            id: room.id,
            hostId: room.hostId,
            config: room.config,
            players: Array.from(room.players.values()).map(p => p.toPublicInfo()),
            gameState: room.gameState ? this.getPublicGameState(room.gameState) : null,
            isPlaying: room.isPlaying,
            createdAt: room.createdAt
        };
    }

    /**
     * 获取游戏状态的公开信息（不含牌堆）
     */
    getPublicGameState(gameState: GameState): PublicGameState {
        return {
            phase: gameState.phase,
            communityCards: gameState.communityCards,
            pots: gameState.pots,
            currentPlayerIndex: gameState.currentPlayerIndex,
            dealerIndex: gameState.dealerIndex,
            smallBlindIndex: gameState.smallBlindIndex,
            bigBlindIndex: gameState.bigBlindIndex,
            currentBet: gameState.currentBet,
            minRaise: gameState.minRaise,
            roundIndex: gameState.roundIndex,
            turnTimeout: gameState.turnTimeout,
            stateVersion: gameState.stateVersion,
            handId: gameState.handId,
            roundId: gameState.roundId
        };
    }

    // ========================================
    // 调试和统计
    // ========================================

    /**
     * 获取所有房间列表（调试用）
     */
    getAllRooms(): PublicRoomInfo[] {
        return Array.from(this.rooms.values()).map(r => this.getPublicRoomInfo(r));
    }

    /**
     * 获取统计信息
     */
    getStats(): { roomCount: number; playerCount: number } {
        return {
            roomCount: this.rooms.size,
            playerCount: this.playerRoomMap.size
        };
    }
}

// 导出单例实例
export const roomManager = new RoomManager();
