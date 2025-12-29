/**
 * Pocket Holdem - 核心类型定义
 * 
 * 本文件定义了整个德州扑克系统的核心数据结构和接口。
 * 设计原则：服务端单一真理源，前端仅接收可见状态。
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
    WAITING = 'WAITING',         // 等待下一局（新加入/局间）
    ACTIVE = 'ACTIVE',           // 当前局参与中
    FOLDED = 'FOLDED',           // 本局已弃牌
    ALL_IN = 'ALL_IN',           // 本局已全押
    ELIMINATED = 'ELIMINATED',   // 已淘汰（筹码归零）
    SPECTATING = 'SPECTATING'    // 观战中（站起状态）
}

/** 游戏阶段 */
export enum GamePhase {
    IDLE = 'IDLE',               // 空闲（等待开始）
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

/** 玩家信息（公开部分，可广播） */
export interface PublicPlayerInfo {
    id: string;                  // 玩家唯一 ID (UUID)
    nickname: string;            // 昵称
    seatIndex: number | null;    // 座位索引（0-8），null 表示站立观战
    chips: number;               // 当前筹码
    status: PlayerStatus;        // 玩家状态
    currentBet: number;          // 当前轮已下注额
    isDealer: boolean;           // 是否为庄家
    isCurrentTurn: boolean;      // 是否是当前行动者
    hasActed: boolean;           // 本轮是否已行动
    isFolded: boolean;           // 是否已弃牌（冗余字段，方便前端）
    isAllIn: boolean;            // 是否已全押
    isHost: boolean;             // 是否为房主
    isReady: boolean;            // 新增：玩家是否准备就绪
}

/** 玩家信息（服务端完整版，含手牌） */
export interface Player extends PublicPlayerInfo {
    holeCards: Card[];           // 底牌（仅服务端持有，不广播给他人）
    socketId: string | null;     // WebSocket 连接 ID（用于断线检测）
    lastActionTime: number;      // 最后操作时间戳
}

/** 底池信息（含边池） */
export interface Pot {
    amount: number;              // 底池金额
    eligiblePlayerIds: string[]; // 有资格分配此池的玩家 ID 列表
}

/** 游戏状态（广播版本，不含敏感信息） */
export interface PublicGameState {
    phase: GamePhase;            // 当前阶段
    communityCards: Card[];      // 公共牌
    pots: Pot[];                 // 底池列表（含边池）
    currentPlayerIndex: number | null; // 当前行动玩家的座位索引
    dealerIndex: number;         // 庄家座位索引
    smallBlindIndex: number;     // 小盲座位索引
    bigBlindIndex: number;       // 大盲座位索引
    currentBet: number;          // 当前轮最高下注额
    minRaise: number;            // 最小加注额
    roundIndex: number;          // 当前手牌轮次（用于幂等校验）
    turnTimeout: number;         // 行动超时时间戳
    // === 版本化字段 ===
    stateVersion: number;        // 全局递增版本号
    handId: string;              // 当前手牌唯一标识
    roundId: string;             // 当前下注轮唯一标识
}

/** 操作历史记录 */
export interface ActionRecord {
    playerId: string;
    action: ActionType;
    amount: number;
    phase: GamePhase;
    timestamp: number;
}

/** 游戏状态（服务端完整版） */
export interface GameState extends PublicGameState {
    deck: Card[];                // 剩余牌堆
    handNumber: number;          // 当前第几手牌
    actionHistory: ActionRecord[]; // 操作历史（用于日志/调试）
}

/** 房间配置 */
export interface RoomConfig {
    initialChips: number;        // 初始筹码
    smallBlind: number;          // 小盲注
    bigBlind: number;            // 大盲注
    maxPlayers: number;          // 最大玩家数（6-9）
    turnTimeout: number;         // 行动超时秒数（默认30）
}

/** 房间状态（广播版本） */
export interface PublicRoomInfo {
    id: string;                  // 房间号（6位数字）
    hostId: string;              // 房主 ID
    config: RoomConfig;
    players: PublicPlayerInfo[]; // 玩家列表（公开信息）
    gameState: PublicGameState | null; // 游戏状态（游戏中才有）
    isPlaying: boolean;          // 是否游戏进行中
    createdAt: number;           // 创建时间戳
}

/** 房间（服务端完整版） */
export interface Room extends Omit<PublicRoomInfo, 'players' | 'gameState'> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    players: Map<string, any>; // 玩家映射表（实际类型为 Player 类）
    seatMap: (string | null)[];   // 座位表，索引为座位号，值为玩家 ID 或 null
    gameState: GameState | null;
    spectators: Set<string>;      // 观战者 ID 集合
}

// ========================================
// WebSocket 事件协议定义
// ========================================

export enum ClientEvent {
    JOIN_ROOM = 'JOIN_ROOM',           // 加入房间
    CREATE_ROOM = 'CREATE_ROOM',       // 创建房间
    SIT_DOWN = 'SIT_DOWN',             // 坐下入座
    STAND_UP = 'STAND_UP',             // 站起观战
    START_GAME = 'START_GAME',         // 开始游戏
    PLAYER_ACTION = 'PLAYER_ACTION',   // 玩家操作
    PLAYER_READY = 'PLAYER_READY',     // 新增：玩家准备就绪
    RECONNECT = 'RECONNECT',           // 断线重连
    LEAVE_ROOM = 'LEAVE_ROOM',         // 离开房间
    KICK_PLAYER = 'KICK_PLAYER'        // 踢出玩家（房主）
}

/** 服务端发送的事件 */
export enum ServerEvent {
    ROOM_CREATED = 'ROOM_CREATED',     // 房间已创建
    ROOM_JOINED = 'ROOM_JOINED',       // 已加入房间
    ROOM_UPDATED = 'ROOM_UPDATED',     // 房间状态更新
    PLAYER_JOINED = 'PLAYER_JOINED',   // 玩家加入
    PLAYER_LEFT = 'PLAYER_LEFT',       // 玩家离开
    PLAYER_SAT = 'PLAYER_SAT',         // 玩家入座
    PLAYER_STOOD = 'PLAYER_STOOD',     // 玩家站起
    PLAYER_KICKED = 'PLAYER_KICKED',   // 新增：玩家被踢出
    GAME_STARTED = 'GAME_STARTED',     // 游戏开始
    SYNC_STATE = 'SYNC_STATE',         // 状态同步
    DEAL_CARDS = 'DEAL_CARDS',         // 发牌（仅发给自己的手牌）
    PLAYER_TURN = 'PLAYER_TURN',       // 轮到谁行动
    PLAYER_ACTED = 'PLAYER_ACTED',     // 玩家已行动
    HAND_RESULT = 'HAND_RESULT',       // 本局结果
    GAME_ENDED = 'GAME_ENDED',         // 游戏结束
    READY_STATE_CHANGED = 'READY_STATE_CHANGED',  // 新增：准备状态变更
    ERROR = 'ERROR',                   // 错误消息
    RECONNECTED = 'RECONNECTED'        // 重连成功
}

// ========================================
// 事件 Payload 类型定义
// ========================================

/** 创建房间请求 */
export interface CreateRoomPayload {
    hostNickname: string;
    config: Partial<RoomConfig>;
}

/** 加入房间请求 */
export interface JoinRoomPayload {
    roomId: string;
    playerId?: string;           // 可选，用于重连
    nickname: string;
}

/** 坐下请求 */
export interface SitDownPayload {
    seatIndex: number;           // 目标座位（0-8）
}

/** 玩家操作请求 */
export interface PlayerActionPayload {
    action: ActionType;
    amount?: number;             // 加注金额（仅 RAISE 需要）
    roundIndex: number;          // 轮次索引（幂等校验）
    requestId: string;           // 请求唯一 ID（幂等去重）
}

/** 踢出玩家请求 */
export interface KickPlayerPayload {
    targetPlayerId: string;
}

/** 重连请求 */
export interface ReconnectPayload {
    playerId: string;
    roomId: string;
}

/** 错误响应 */
export interface ErrorPayload {
    code: string;
    message: string;
}

/** 发牌响应（私密，仅发给对应玩家） */
export interface DealCardsPayload {
    holeCards: Card[];
}

/** 玩家行动广播 */
export interface PlayerActedPayload {
    playerId: string;
    action: ActionType;
    amount: number;
    newChips: number;
    potTotal: number;
}

/** 本局结果 */
export interface HandResultPayload {
    winners: {
        playerId: string;
        amount: number;
        handRank?: string;         // 牌型名称
        cards?: Card[];            // 最终手牌（摊牌时展示）
    }[];
    pots: Pot[];
    showdownCards: {             // 摊牌展示的所有手牌
        playerId: string;
        cards: Card[];
    }[];
}

/** 同步状态响应 */
export interface SyncStatePayload {
    room: PublicRoomInfo;
    myCards?: Card[];            // 仅发给自己的手牌
    myPlayerId: string;
}

// ========================================
// 牌型定义
// ========================================

/** 牌型等级（值越大越强） */
export enum HandRank {
    HIGH_CARD = 1,         // 高牌
    ONE_PAIR = 2,          // 一对
    TWO_PAIR = 3,          // 两对
    THREE_OF_A_KIND = 4,   // 三条
    STRAIGHT = 5,          // 顺子
    FLUSH = 6,             // 同花
    FULL_HOUSE = 7,        // 葫芦
    FOUR_OF_A_KIND = 8,    // 四条
    STRAIGHT_FLUSH = 9,    // 同花顺
    ROYAL_FLUSH = 10       // 皇家同花顺
}

/** 牌型评估结果 */
export interface EvaluatedHand {
    rank: HandRank;              // 牌型等级
    rankName: string;            // 牌型名称
    bestCards: Card[];           // 最佳5张牌
    kickers: Rank[];             // 踢脚牌（用于同等级比较）
    score: number;               // 综合分数（用于快速比较）
}
