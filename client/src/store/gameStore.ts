/**
 * store/gameStore.ts - Pinia 游戏状态管理
 * 
 * 集中管理游戏状态，提供全局可访问的响应式数据。
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
    PublicRoomInfo,
    Card,
    PublicPlayerInfo,
    PublicGameState
} from '../types';

export const useGameStore = defineStore('game', () => {
    // ========================================
    // 状态
    // ========================================

    /** 当前房间信息 */
    const room = ref<PublicRoomInfo | null>(null);

    /** 我的玩家 ID */
    const myPlayerId = ref<string | null>(null);

    /** 我的手牌 */
    const myCards = ref<Card[]>([]);

    /** 连接状态 */
    const isConnected = ref(false);

    /** 错误信息 */
    const error = ref<string | null>(null);

    /** 当前视图（home/room/game） */
    const currentView = ref<'home' | 'room' | 'game'>('home');

    // ========================================
    // 计算属性
    // ========================================

    /** 我是否为房主 */
    const isHost = computed(() => {
        return myPlayerId.value === room.value?.hostId;
    });

    /** 我的玩家信息 */
    const myPlayer = computed(() => {
        if (!myPlayerId.value || !room.value) return null;
        return room.value.players.find(p => p.id === myPlayerId.value) || null;
    });

    /** 我是否已入座 */
    const isSeated = computed(() => {
        return myPlayer.value?.seatIndex !== null;
    });

    /** 是否轮到我行动 */
    const isMyTurn = computed(() => {
        return myPlayer.value?.isCurrentTurn ?? false;
    });

    /** 游戏是否进行中 */
    const isPlaying = computed(() => {
        return room.value?.isPlaying ?? false;
    });

    /** 当前游戏阶段 */
    const gamePhase = computed(() => {
        return room.value?.gameState?.phase ?? null;
    });

    /** 公共牌 */
    const communityCards = computed(() => {
        return room.value?.gameState?.communityCards ?? [];
    });

    /** 底池总额 */
    const totalPot = computed(() => {
        if (!room.value?.gameState?.pots) return 0;
        return room.value.gameState.pots.reduce((sum, pot) => sum + pot.amount, 0);
    });

    /** 已入座的玩家数量 */
    const seatedPlayerCount = computed(() => {
        if (!room.value) return 0;
        return room.value.players.filter(p => p.seatIndex !== null).length;
    });

    /** 座位地图（索引 -> 玩家） */
    const seatMap = computed(() => {
        const map = new Map<number, PublicPlayerInfo>();
        if (room.value) {
            room.value.players.forEach(p => {
                if (p.seatIndex !== null) {
                    map.set(p.seatIndex, p);
                }
            });
        }
        return map;
    });

    /** 当前需要跟注的金额 */
    const callAmount = computed(() => {
        if (!room.value?.gameState || !myPlayer.value) return 0;
        return room.value.gameState.currentBet - myPlayer.value.currentBet;
    });

    /** 最小加注额 */
    const minRaiseAmount = computed(() => {
        return room.value?.gameState?.minRaise ?? 0;
    });

    // ========================================
    // 操作方法
    // ========================================

    /** 设置房间信息 */
    const setRoom = (newRoom: PublicRoomInfo | null) => {
        room.value = newRoom;
        if (newRoom) {
            currentView.value = newRoom.isPlaying ? 'game' : 'room';
        }
    };

    /** 设置我的玩家 ID */
    const setMyPlayerId = (id: string | null) => {
        myPlayerId.value = id;
    };

    /** 设置我的手牌 */
    const setMyCards = (cards: Card[]) => {
        myCards.value = cards;
    };

    /** 设置连接状态 */
    const setConnected = (connected: boolean) => {
        isConnected.value = connected;
    };

    /** 设置错误信息 */
    const setError = (msg: string | null) => {
        error.value = msg;
        // 自动清除错误
        if (msg) {
            setTimeout(() => {
                error.value = null;
            }, 5000);
        }
    };

    /** 返回首页 */
    const goHome = () => {
        currentView.value = 'home';
        room.value = null;
        myCards.value = [];
    };

    /** 重置所有状态 */
    const reset = () => {
        room.value = null;
        myPlayerId.value = null;
        myCards.value = [];
        isConnected.value = false;
        error.value = null;
        currentView.value = 'home';
    };

    return {
        // 状态
        room,
        myPlayerId,
        myCards,
        isConnected,
        error,
        currentView,

        // 计算属性
        isHost,
        myPlayer,
        isSeated,
        isMyTurn,
        isPlaying,
        gamePhase,
        communityCards,
        totalPot,
        seatedPlayerCount,
        seatMap,
        callAmount,
        minRaiseAmount,

        // 方法
        setRoom,
        setMyPlayerId,
        setMyCards,
        setConnected,
        setError,
        goHome,
        reset
    };
});
