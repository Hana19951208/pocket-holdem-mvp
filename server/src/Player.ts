/**
 * Player.ts - 玩家类
 * 
 * 封装玩家的属性和行为方法。
 * 设计原则：状态变更由 RoomManager 或 PokerEngine 驱动，Player 仅提供原子操作。
 */

import { v4 as uuidv4 } from 'uuid';
import {
    type Player as IPlayer,
    type PublicPlayerInfo,
    type Card,
    PlayerStatus
} from './Interfaces.js';

/**
 * 玩家类
 * 
 * 管理单个玩家的状态和行为
 */
export class Player implements IPlayer {
    id: string;
    nickname: string;
    seatIndex: number | null;
    chips: number;
    status: PlayerStatus;
    currentBet: number;
    totalBetThisHand: number;  // 新增：这手牌累计投入
    isDealer: boolean;
    isCurrentTurn: boolean;
    hasActed: boolean;
    isFolded: boolean;
    isAllIn: boolean;
    isHost: boolean;
    isReady: boolean;  // 新增：玩家是否准备就绪
    holeCards: Card[];
    socketId: string | null;
    lastActionTime: number;

    constructor(options: {
        nickname: string;
        chips: number;
        isHost?: boolean;
        socketId?: string;
        id?: string;
    }) {
        this.id = options.id || uuidv4();
        this.nickname = options.nickname;
        this.seatIndex = null;
        this.chips = options.chips;
        this.status = PlayerStatus.SPECTATING;
        this.currentBet = 0;
        this.totalBetThisHand = 0;  // 新增：初始化为 0
        this.isDealer = false;
        this.isCurrentTurn = false;
        this.hasActed = false;
        this.isFolded = false;
        this.isAllIn = false;
        this.isHost = options.isHost ?? false;
        this.isReady = false;  // 新增：默认未准备
        this.holeCards = [];
        this.socketId = options.socketId ?? null;
        this.lastActionTime = Date.now();
    }

    // ========================================
    // 筹码操作
    // ========================================

    /**
     * 扣除筹码（下注/盲注）
     * @param amount 扣除金额
     * @returns 实际扣除金额（可能小于请求金额，如 All-in）
     */
    deductChips(amount: number): number {
        const actualAmount = Math.min(amount, this.chips);
        this.chips -= actualAmount;
        this.currentBet += actualAmount;
        this.totalBetThisHand += actualAmount;  // 新增：累加到整手牌投入

        // 检查是否 All-in
        if (this.chips === 0 && this.status === PlayerStatus.ACTIVE) {
            this.isAllIn = true;
            this.status = PlayerStatus.ALL_IN;
        }

        return actualAmount;
    }

    /**
     * 增加筹码（赢得底池）
     * @param amount 增加金额
     */
    addChips(amount: number): void {
        this.chips += amount;

        // 如果之前是淘汰状态，现在有筹码了（这种情况在 MVP 中不应发生）
        if (this.status === PlayerStatus.ELIMINATED && this.chips > 0) {
            this.status = PlayerStatus.WAITING;
        }
    }

    // ========================================
    // 状态操作
    // ========================================

    /**
     * 入座
     * @param seatIndex 座位索引
     */
    sitDown(seatIndex: number): void {
        this.seatIndex = seatIndex;
        // 新入座的玩家默认等待下一局
        this.status = PlayerStatus.WAITING;
    }

    /**
     * 站起（回到观战席）
     */
    standUp(): void {
        this.seatIndex = null;
        this.status = PlayerStatus.SPECTATING;
        this.resetForNewHand();
    }

    /**
     * 弃牌
     */
    fold(): void {
        this.isFolded = true;
        this.status = PlayerStatus.FOLDED;
        this.hasActed = true;
    }

    /**
     * 全押
     * @returns 全押金额
     */
    allIn(): number {
        const amount = this.chips;
        this.deductChips(amount);
        return amount;
    }

    /**
     * 重置为新一手牌的初始状态
     */
    resetForNewHand(): void {
        this.holeCards = [];
        this.currentBet = 0;
        this.totalBetThisHand = 0;  // 新增：重置累计投入
        this.isDealer = false;
        this.isCurrentTurn = false;
        this.hasActed = false;
        this.isFolded = false;
        this.isAllIn = false;
        this.isReady = false;  // 新增：每局重置准备状态

        // 状态转换：如果有筹码且在座位上，变为 ACTIVE；否则保持淘汰/观战状态
        if (this.seatIndex !== null) {
            if (this.chips > 0) {
                this.status = PlayerStatus.ACTIVE;
            } else {
                this.status = PlayerStatus.ELIMINATED;
            }
        }
    }

    /**
     * 重置为新一轮下注的初始状态
     */
    resetForNewRound(): void {
        this.currentBet = 0;
        this.hasActed = false;
        // 不重置 isFolded 和 isAllIn，因为这些状态贯穿整手牌
    }

    /**
     * 标记为等待下一局（新加入的玩家）
     */
    markAsWaiting(): void {
        this.status = PlayerStatus.WAITING;
    }

    /**
     * 标记为已淘汰
     */
    markAsEliminated(): void {
        this.status = PlayerStatus.ELIMINATED;
        this.holeCards = [];
    }

    // ========================================
    // 状态查询
    // ========================================

    /**
     * 是否可以参与当前手牌
     */
    canPlay(): boolean {
        return (
            this.seatIndex !== null &&
            this.chips > 0 &&
            this.status !== PlayerStatus.ELIMINATED &&
            this.status !== PlayerStatus.SPECTATING &&
            this.status !== PlayerStatus.WAITING
        );
    }

    /**
     * 是否仍在手牌中（未弃牌/未淘汰）
     */
    isInHand(): boolean {
        return (
            this.canPlay() &&
            !this.isFolded
        );
    }

    /**
     * 是否可以行动（未弃牌、未全押、有轮到）
     */
    canAct(): boolean {
        return (
            this.isInHand() &&
            !this.isAllIn &&
            this.isCurrentTurn
        );
    }

    /**
     * 更新 Socket 连接 ID
     */
    updateSocketId(socketId: string): void {
        this.socketId = socketId;
        this.lastActionTime = Date.now();
    }

    /**
     * 标记为断开连接
     */
    markDisconnected(): void {
        this.socketId = null;
    }

    /**
     * 是否已断开连接
     */
    isDisconnected(): boolean {
        return this.socketId === null;
    }

    // ========================================
    // 数据导出
    // ========================================

    /**
     * 导出公开信息（用于广播给其他玩家）
     */
    toPublicInfo(): PublicPlayerInfo {
        return {
            id: this.id,
            nickname: this.nickname,
            seatIndex: this.seatIndex,
            chips: this.chips,
            status: this.status,
            currentBet: this.currentBet,
            isDealer: this.isDealer,
            isCurrentTurn: this.isCurrentTurn,
            hasActed: this.hasActed,
            isFolded: this.isFolded,
            isAllIn: this.isAllIn,
            isHost: this.isHost,
            isReady: this.isReady  // 新增
        };
    }

    /**
     * 导出完整信息（仅服务端内部使用）
     */
    toJSON(): IPlayer {
        return {
            ...this.toPublicInfo(),
            holeCards: this.holeCards,
            socketId: this.socketId,
            lastActionTime: this.lastActionTime
        };
    }
}
