/**
 * composables/useSocket.ts - Socket.io 连接层
 * 
 * 封装 WebSocket 连接管理、事件监听与状态同步。
 * 提供响应式的连接状态和消息处理。
 */

import { ref, onMounted, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';
import {
    ClientEvent,
    ServerEvent,
    type PublicRoomInfo,
    type Card,
    type ActionType
} from '../types';

// 服务器地址（开发环境）
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

/**
 * Socket 连接状态
 */
export const useSocket = () => {
    // Socket 实例
    const socket = ref<Socket | null>(null);

    // 连接状态
    const isConnected = ref(false);
    const isConnecting = ref(false);

    // 当前玩家 ID
    const myPlayerId = ref<string | null>(null);

    // 当前房间信息
    const room = ref<PublicRoomInfo | null>(null);

    // 我的手牌
    const myCards = ref<Card[]>([]);

    // 错误信息
    const error = ref<string | null>(null);

    // 本地存储的 key
    const PLAYER_ID_KEY = 'pocket_holdem_player_id';
    const ROOM_ID_KEY = 'pocket_holdem_room_id';

    /**
     * 建立连接
     */
    const connect = () => {
        if (socket.value?.connected) return;

        isConnecting.value = true;
        error.value = null;

        socket.value = io(SERVER_URL, {
            transports: ['websocket'],
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        // 连接成功
        socket.value.on('connect', () => {
            isConnected.value = true;
            isConnecting.value = false;
            console.log('[Socket] 已连接');

            // 尝试自动重连
            tryAutoReconnect();
        });

        // 断开连接
        socket.value.on('disconnect', () => {
            isConnected.value = false;
            console.log('[Socket] 已断开');
        });

        // 连接错误
        socket.value.on('connect_error', (err) => {
            isConnecting.value = false;
            error.value = `连接失败: ${err.message}`;
            console.error('[Socket] 连接错误:', err);
        });

        // 注册服务器事件监听
        registerServerEvents();
    };

    /**
     * 断开连接
     */
    const disconnect = () => {
        if (socket.value) {
            socket.value.disconnect();
            socket.value = null;
        }
        isConnected.value = false;
        myPlayerId.value = null;
        room.value = null;
        myCards.value = [];
    };

    /**
     * 注册服务器事件监听
     */
    const registerServerEvents = () => {
        if (!socket.value) return;

        // 房间创建成功
        socket.value.on(ServerEvent.ROOM_CREATED, (data: {
            room: PublicRoomInfo;
            myPlayerId: string
        }) => {
            room.value = data.room;
            myPlayerId.value = data.myPlayerId;
            saveSession(data.myPlayerId, data.room.id);
            console.log('[Socket] 房间已创建:', data.room.id);
        });

        // 加入房间成功
        socket.value.on(ServerEvent.ROOM_JOINED, (data: {
            room: PublicRoomInfo;
            myPlayerId: string;
            isReconnect: boolean;
        }) => {
            room.value = data.room;
            myPlayerId.value = data.myPlayerId;
            saveSession(data.myPlayerId, data.room.id);
            console.log('[Socket] 已加入房间:', data.room.id);
        });

        // 房间更新
        socket.value.on(ServerEvent.ROOM_UPDATED, (data: { room: PublicRoomInfo }) => {
            room.value = data.room;
        });

        // 玩家加入
        socket.value.on(ServerEvent.PLAYER_JOINED, (data: { room: PublicRoomInfo }) => {
            room.value = data.room;
        });

        // 玩家离开
        socket.value.on(ServerEvent.PLAYER_LEFT, (data: { room: PublicRoomInfo }) => {
            room.value = data.room;
        });

        // 玩家入座
        socket.value.on(ServerEvent.PLAYER_SAT, (data: { room: PublicRoomInfo }) => {
            room.value = data.room;
        });

        // 玩家站起
        socket.value.on(ServerEvent.PLAYER_STOOD, (data: { room: PublicRoomInfo }) => {
            room.value = data.room;
        });

        // 游戏开始
        socket.value.on(ServerEvent.GAME_STARTED, (data: { room: PublicRoomInfo }) => {
            room.value = data.room;
        });

        // 发牌（仅自己的手牌）
        socket.value.on(ServerEvent.DEAL_CARDS, (data: { holeCards: Card[] }) => {
            myCards.value = data.holeCards;
            console.log('[Socket] 收到手牌:', data.holeCards);
        });

        // 状态同步
        socket.value.on(ServerEvent.SYNC_STATE, (data: {
            room: PublicRoomInfo;
            myCards?: Card[];
        }) => {
            room.value = data.room;
            if (data.myCards) {
                myCards.value = data.myCards;
            }
        });

        // 重连成功
        socket.value.on(ServerEvent.RECONNECTED, (data: {
            room: PublicRoomInfo;
            myPlayerId: string;
            myCards: Card[];
        }) => {
            room.value = data.room;
            myPlayerId.value = data.myPlayerId;
            myCards.value = data.myCards;
            console.log('[Socket] 重连成功');
        });

        // 错误处理
        socket.value.on(ServerEvent.ERROR, (data: { code: string; message: string }) => {
            error.value = data.message;
            console.error('[Socket] 服务器错误:', data);
        });
    };

    /**
     * 保存会话信息（用于断线重连）
     */
    const saveSession = (playerId: string, roomId: string) => {
        localStorage.setItem(PLAYER_ID_KEY, playerId);
        localStorage.setItem(ROOM_ID_KEY, roomId);
    };

    /**
     * 清除会话信息
     */
    const clearSession = () => {
        localStorage.removeItem(PLAYER_ID_KEY);
        localStorage.removeItem(ROOM_ID_KEY);
    };

    /**
     * 尝试自动重连
     */
    const tryAutoReconnect = () => {
        const savedPlayerId = localStorage.getItem(PLAYER_ID_KEY);
        const savedRoomId = localStorage.getItem(ROOM_ID_KEY);

        if (savedPlayerId && savedRoomId) {
            console.log('[Socket] 尝试自动重连...');
            socket.value?.emit(ClientEvent.RECONNECT, {
                playerId: savedPlayerId,
                roomId: savedRoomId
            });
        }
    };

    // ========================================
    // 客户端操作方法
    // ========================================

    /**
     * 创建房间
     */
    const createRoom = (nickname: string, config?: Partial<{
        initialChips: number;
        smallBlind: number;
        bigBlind: number;
        maxPlayers: number;
    }>) => {
        socket.value?.emit(ClientEvent.CREATE_ROOM, {
            hostNickname: nickname,
            config: config || {}
        });
    };

    /**
     * 加入房间
     */
    const joinRoom = (roomId: string, nickname: string) => {
        socket.value?.emit(ClientEvent.JOIN_ROOM, {
            roomId,
            nickname
        });
    };

    /**
     * 坐下
     */
    const sitDown = (seatIndex: number) => {
        socket.value?.emit(ClientEvent.SIT_DOWN, { seatIndex });
    };

    /**
     * 站起
     */
    const standUp = () => {
        socket.value?.emit(ClientEvent.STAND_UP);
    };

    /**
     * 开始游戏（仅房主）
     */
    const startGame = () => {
        socket.value?.emit(ClientEvent.START_GAME);
    };

    /**
     * 玩家操作
     */
    const playerAction = (action: ActionType, amount?: number) => {
        socket.value?.emit(ClientEvent.PLAYER_ACTION, {
            action,
            amount,
            roundIndex: room.value?.gameState?.roundIndex || 0,
            requestId: crypto.randomUUID()
        });
    };

    /**
     * 踢出玩家（仅房主）
     */
    const kickPlayer = (targetPlayerId: string) => {
        socket.value?.emit(ClientEvent.KICK_PLAYER, { targetPlayerId });
    };

    /**
     * 离开房间
     */
    const leaveRoom = () => {
        socket.value?.emit(ClientEvent.LEAVE_ROOM);
        clearSession();
        room.value = null;
        myCards.value = [];
    };

    // 生命周期
    onMounted(() => {
        connect();
    });

    onUnmounted(() => {
        disconnect();
    });

    return {
        // 状态
        socket,
        isConnected,
        isConnecting,
        myPlayerId,
        room,
        myCards,
        error,

        // 方法
        connect,
        disconnect,
        createRoom,
        joinRoom,
        sitDown,
        standUp,
        startGame,
        playerAction,
        kickPlayer,
        leaveRoom,
        clearSession
    };
};
