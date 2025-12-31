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
// 为支持 ngrok 穿透，默认使用空字符串以利用 Vite Proxy 代理到后端
const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

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

    // 当前回合超时时间戳 (用于倒计时 UI)
    const turnTimeout = ref<number>(0);

    // 手牌结算结果 (用于 Showdown UI)
    const handResult = ref<{
        winners: { playerId: string; amount: number; handRank?: string; cards?: Card[] }[];
        pots: { amount: number; eligiblePlayerIds: string[] }[];
        showdownCards: { playerId: string; cards: Card[] }[];
    } | null>(null);

    // 是否处于 Showdown 展示阶段
    const isShowdown = ref(false);

    // 是否被踢出房间
    const isKicked = ref(false);
    const kickReason = ref<string>('');

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

        // 游戏开始 - 核心修复：重置 Showdown 状态
        socket.value.on(ServerEvent.GAME_STARTED, (data: { room: PublicRoomInfo }) => {
            room.value = data.room;
            // 新一局开始，清除旧的 Showdown 状态（关键！）
            isShowdown.value = false;
            handResult.value = null;
            console.log('[Socket] 新一局开始，Showdown 状态已重置');
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
            // 强制替换整个对象，确保 Vue 响应式触发
            room.value = JSON.parse(JSON.stringify(data.room));
            // 仅当明确有新手牌时才更新，不清除已有手牌
            if (data.myCards && data.myCards.length > 0) {
                myCards.value = data.myCards;
            }
            // 新局开始，隐藏 Showdown
            isShowdown.value = false;
            handResult.value = null;
        });

        // 玩家已行动（核心：修复行动面板不隐藏问题）
        socket.value.on(ServerEvent.PLAYER_ACTED, (data: { room: PublicRoomInfo }) => {
            // 强制深拷贝替换，确保 computed 属性重新计算
            room.value = JSON.parse(JSON.stringify(data.room));
            console.log('[Socket] 玩家已行动，状态已更新, stateVersion:', data.room.gameState?.stateVersion);
        });

        // 轮到玩家行动（携带超时时间戳）
        socket.value.on(ServerEvent.PLAYER_TURN, (data: { playerIndex: number; timeout: number; stateVersion: number }) => {
            turnTimeout.value = data.timeout;
            console.log('[Socket] 轮到玩家行动:', data.playerIndex, '超时时间:', new Date(data.timeout).toLocaleTimeString());
        });

        // 手牌结算结果（Showdown）
        socket.value.on(ServerEvent.HAND_RESULT, (data: {
            winners: { playerId: string; amount: number; handRank?: string; cards?: Card[] }[];
            pots: { amount: number; eligiblePlayerIds: string[] }[];
            showdownCards: { playerId: string; cards: Card[] }[];
        }) => {
            handResult.value = data;
            isShowdown.value = true;
            console.log('[Socket] 收到手牌结果:', data.winners.map(w => w.playerId).join(', '));
        });

        // 准备状态变更（新增）
        socket.value.on(ServerEvent.READY_STATE_CHANGED, (data: {
            room: PublicRoomInfo;
            playerId: string;
            isReady: boolean;
        }) => {
            room.value = JSON.parse(JSON.stringify(data.room));
            console.log(`[Socket] 玩家准备状态变更: ${data.playerId} -> ${data.isReady ? '已准备' : '未准备'}`);
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

        // 被踢出房间处理
        socket.value.on(ServerEvent.PLAYER_KICKED, (data: { reason: string; message: string }) => {
            isKicked.value = true;
            kickReason.value = data.reason;
            clearSession();
            room.value = null;
            myCards.value = [];
            console.log('[Socket] 您已被踢出房间:', data.reason, data.message);
        });

        // 房主转移处理
        socket.value.on(ServerEvent.HOST_TRANSFERRED, (data: { newHostId: string; newHostNickname: string }) => {
            console.log('[Socket] 房主已转移给:', data.newHostNickname);
            // 房间状态会在下一次 SYNC_STATE 或 ROOM_UPDATED 中更新
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
     * 玩家准备就绪（新增）
     */
    const playerReady = () => {
        socket.value?.emit(ClientEvent.PLAYER_READY);
    };

    /**
     * 玩家操作
     */
    const playerAction = (action: ActionType, amount?: number) => {
        socket.value?.emit(ClientEvent.PLAYER_ACTION, {
            action,
            amount,
            roundIndex: room.value?.gameState?.roundIndex || 0,
            requestId: generateUUID()
        });
    };

    /**
     * 生成 UUID (兼容非安全上下文)
     */
    const generateUUID = () => {
        // 1. 优先使用标准 API (仅在 HTTPS/Localhost 可用)
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }

        // 2. 尝试使用 getRandomValues (支持非安全上下文的现代浏览器)
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
            try {
                return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
                    (parseInt(c) ^ crypto!.getRandomValues(new Uint8Array(1))[0] & 15 >> parseInt(c) / 4).toString(16)
                );
            } catch (e) {
                console.warn('[UUID] getRandomValues failed, falling back to Math.random');
            }
        }

        // 3. 兜底方案 (纯数学随机，足够用于请求 ID)
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
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
        // 新增：倒计时与 Showdown 状态
        turnTimeout,
        handResult,
        isShowdown,
        // 新增：被踢出状态
        isKicked,
        kickReason,

        // 方法
        connect,
        disconnect,
        createRoom,
        joinRoom,
        sitDown,
        standUp,
        startGame,
        playerAction,
        playerReady,  // 新增
        kickPlayer,
        leaveRoom,
        clearSession
    };
};
