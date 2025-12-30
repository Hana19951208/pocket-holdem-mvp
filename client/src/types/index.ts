/**
 * types/index.ts - 客户端类型定义
 * 
 * 与服务端共享的核心类型定义。
 * 注意：这里只包含客户端需要的类型，不包含服务端内部类型。
 */

// ========================================
// 基础枚举定义
// ========================================

/** 扑克牌花色 */
export enum Suit {
    SPADES = 'SPADES',       // ♠ 黑桃
    HEARTS = 'HEARTS',       // ♥ 红心
    DIAMONDS = 'DIAMONDS',   // ♦ 方块
    CLUBS = 'CLUBS'          // ♣ 梅花
}

/** 扑克牌点数（2-14，其中 14 = A） */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

/** 玩家状态 */
export enum PlayerStatus {
    WAITING = 'WAITING',         // 等待下一局
    ACTIVE = 'ACTIVE',           // 当前局参与中
    FOLDED = 'FOLDED',           // 本局已弃牌
    ALL_IN = 'ALL_IN',           // 本局已全押
    ELIMINATED = 'ELIMINATED',   // 已淘汰
    SPECTATING = 'SPECTATING'    // 观战中
}

/** 游戏阶段 */
export enum GamePhase {
    IDLE = 'IDLE',               // 空闲
    PRE_FLOP = 'PRE_FLOP',       // 翻牌前
    FLOP = 'FLOP',               // 翻牌圈
    TURN = 'TURN',               // 转牌圈
    RIVER = 'RIVER',             // 河牌圈
    SHOWDOWN = 'SHOWDOWN'        // 摊牌
}

/** 玩家操作类型 */
export enum ActionType {
    FOLD = 'FOLD',               // 弃牌
    CHECK = 'CHECK',             // 过牌
    CALL = 'CALL',               // 跟注
    RAISE = 'RAISE',             // 加注
    ALL_IN = 'ALL_IN'            // 全押
}

// ========================================
// 核心数据结构
// ========================================

/** 扑克牌 */
export interface Card {
    suit: Suit;
    rank: Rank;
}

/** 玩家信息（公开部分） */
export interface PublicPlayerInfo {
    id: string;
    nickname: string;
    seatIndex: number | null;
    chips: number;
    status: PlayerStatus;
    currentBet: number;
    isDealer: boolean;
    isCurrentTurn: boolean;
    hasActed: boolean;
    isFolded: boolean;
    isAllIn: boolean;
    isHost: boolean;
    isReady: boolean;  // 新增：玩家是否准备就绪
}

/** 底池信息 */
export interface Pot {
    amount: number;
    eligiblePlayerIds: string[];
}

/** 游戏状态（公开版本） */
export interface PublicGameState {
    phase: GamePhase;
    communityCards: Card[];
    pots: Pot[];
    currentPlayerIndex: number | null;
    dealerIndex: number;
    smallBlindIndex: number;
    bigBlindIndex: number;
    currentBet: number;
    minRaise: number;
    roundIndex: number;
    turnTimeout: number;
    // 版本化字段
    stateVersion: number;
    handId: string;
    roundId: string;
}

/** 房间配置 */
export interface RoomConfig {
    initialChips: number;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    turnTimeout: number;
}

/** 房间状态（公开版本） */
export interface PublicRoomInfo {
    id: string;
    hostId: string;
    config: RoomConfig;
    players: PublicPlayerInfo[];
    gameState: PublicGameState | null;
    isPlaying: boolean;
    createdAt: number;
}

// ========================================
// WebSocket 事件
// ========================================

export enum ClientEvent {
    JOIN_ROOM = 'JOIN_ROOM',
    CREATE_ROOM = 'CREATE_ROOM',
    SIT_DOWN = 'SIT_DOWN',
    STAND_UP = 'STAND_UP',
    START_GAME = 'START_GAME',
    PLAYER_ACTION = 'PLAYER_ACTION',
    PLAYER_READY = 'PLAYER_READY',  // 新增
    RECONNECT = 'RECONNECT',
    LEAVE_ROOM = 'LEAVE_ROOM',
    KICK_PLAYER = 'KICK_PLAYER'
}

export enum ServerEvent {
    ROOM_CREATED = 'ROOM_CREATED',
    ROOM_JOINED = 'ROOM_JOINED',
    ROOM_UPDATED = 'ROOM_UPDATED',
    PLAYER_JOINED = 'PLAYER_JOINED',
    PLAYER_LEFT = 'PLAYER_LEFT',
    PLAYER_SAT = 'PLAYER_SAT',
    PLAYER_STOOD = 'PLAYER_STOOD',
    PLAYER_KICKED = 'PLAYER_KICKED',   // 新增：被踢出
    HOST_TRANSFERRED = 'HOST_TRANSFERRED', // 房主转移
    GAME_STARTED = 'GAME_STARTED',
    SYNC_STATE = 'SYNC_STATE',
    DEAL_CARDS = 'DEAL_CARDS',
    PLAYER_TURN = 'PLAYER_TURN',
    PLAYER_ACTED = 'PLAYER_ACTED',
    HAND_RESULT = 'HAND_RESULT',
    GAME_ENDED = 'GAME_ENDED',
    READY_STATE_CHANGED = 'READY_STATE_CHANGED',  // 新增
    ERROR = 'ERROR',
    RECONNECTED = 'RECONNECTED'
}

// ========================================
// 工具函数
// ========================================

/** 获取牌的显示名称 */
export function getCardDisplay(card: Card): { symbol: string; color: string } {
    const suitSymbols: Record<Suit, string> = {
        [Suit.SPADES]: '♠',
        [Suit.HEARTS]: '♥',
        [Suit.DIAMONDS]: '♦',
        [Suit.CLUBS]: '♣'
    };

    const rankNames: Record<number, string> = {
        11: 'J', 12: 'Q', 13: 'K', 14: 'A'
    };

    const rankDisplay = rankNames[card.rank] || card.rank.toString();
    const symbol = `${suitSymbols[card.suit]}${rankDisplay}`;
    const color = card.suit === Suit.HEARTS || card.suit === Suit.DIAMONDS ? 'red' : 'black';

    return { symbol, color };
}

/** 格式化筹码数量 */
export function formatChips(chips: number): string {
    if (chips >= 1000000) {
        return `${(chips / 1000000).toFixed(1)}M`;
    }
    if (chips >= 1000) {
        return `${(chips / 1000).toFixed(1)}K`;
    }
    return chips.toString();
}
