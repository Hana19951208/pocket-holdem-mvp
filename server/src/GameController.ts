/**
 * GameController.ts - 游戏控制器
 * 
 * 核心职责：
 * 1. 管理单手牌的完整生命周期
 * 2. 处理玩家操作（PLAYER_ACTION）
 * 3. 控制下注轮流转
 * 4. 执行摊牌结算
 * 5. 管理行动超时
 */

import { v4 as uuidv4 } from 'uuid';
import {
    type Room,
    type GameState,
    type Card,
    type Pot,
    type ActionRecord,
    type PlayerActionPayload,
    type EvaluatedHand,
    GamePhase,
    ActionType,
    PlayerStatus
} from './Interfaces.js';
import { Player } from './Player.js';
import { PokerEngine } from './PokerEngine.js';

/** 操作结果 */
export interface ActionResult {
    success: boolean;
    error?: string;
    shouldAdvancePhase?: boolean;
    shouldEndHand?: boolean;
    newState?: GameState;
}

/** 手牌结果 */
export interface HandResult {
    winners: {
        playerId: string;
        nickname: string;
        amount: number;
        handRank?: string;
        cards?: Card[];
    }[];
    pots: Pot[];
    showdownCards: { playerId: string; cards: Card[] }[];
}

/**
 * 游戏控制器
 */
export class GameController {
    /** 已处理的 requestId 缓存（LRU，最多保留 500 个） */
    private processedRequests: Set<string> = new Set();
    private requestQueue: string[] = [];
    private readonly MAX_REQUESTS = 500;

    /** 超时定时器映射（roomId -> timerId） */
    private timeoutTimers: Map<string, NodeJS.Timeout> = new Map();

    /** 超时回调（由外部注入） */
    private onTimeout?: (roomId: string, playerId: string) => void;

    /**
     * 设置超时回调
     */
    setTimeoutCallback(callback: (roomId: string, playerId: string) => void): void {
        this.onTimeout = callback;
    }

    // ========================================
    // 手牌生命周期管理
    // ========================================

    /**
     * 开始新一手牌
     */
    startNewHand(room: Room): GameState {
        const players = this.getSeatedPlayers(room);
        const activePlayers = players.filter(p => p.chips > 0 && p.status !== PlayerStatus.ELIMINATED);

        if (activePlayers.length < 2) {
            throw new Error('NOT_ENOUGH_ACTIVE_PLAYERS');
        }

        // 1. 创建并洗牌
        const deck = PokerEngine.shuffleDeck(PokerEngine.createDeck());

        // 2. 确定庄家位置
        const previousDealerIndex = room.gameState?.dealerIndex ?? -1;
        const dealerIndex = PokerEngine.getNextDealerIndex(previousDealerIndex, activePlayers);

        // 3. 确定盲注位置
        const { smallBlindIndex, bigBlindIndex } = PokerEngine.getBlindsIndexes(dealerIndex, activePlayers);

        // 4. 重置玩家状态并设置庄家标记
        players.forEach(p => {
            p.resetForNewHand();
            p.isDealer = p.seatIndex === dealerIndex;
            // 有筹码且在座位上的玩家变为 ACTIVE
            if (p.chips > 0 && p.seatIndex !== null && p.status !== PlayerStatus.ELIMINATED) {
                p.status = PlayerStatus.ACTIVE;
            }
        });

        // 5. 创建新手牌 ID
        const handId = uuidv4();
        const roundId = uuidv4();

        // 6. 创建游戏状态
        const gameState: GameState = {
            phase: GamePhase.PRE_FLOP,
            communityCards: [],
            pots: [{ amount: 0, eligiblePlayerIds: activePlayers.map(p => p.id) }],
            currentPlayerIndex: null,
            dealerIndex,
            smallBlindIndex,
            bigBlindIndex,
            currentBet: room.config.bigBlind,
            minRaise: room.config.bigBlind,
            roundIndex: (room.gameState?.roundIndex ?? 0) + 1,
            turnTimeout: 0,
            stateVersion: (room.gameState?.stateVersion ?? 0) + 1,
            handId,
            roundId,
            deck,
            handNumber: (room.gameState?.handNumber ?? 0) + 1,
            actionHistory: []
        };

        // 7. 收取盲注
        const smallBlindPlayer = activePlayers.find(p => p.seatIndex === smallBlindIndex);
        const bigBlindPlayer = activePlayers.find(p => p.seatIndex === bigBlindIndex);

        if (smallBlindPlayer) {
            const sbAmount = smallBlindPlayer.deductChips(room.config.smallBlind);
            gameState.pots[0].amount += sbAmount;
        }

        if (bigBlindPlayer) {
            const bbAmount = bigBlindPlayer.deductChips(room.config.bigBlind);
            gameState.pots[0].amount += bbAmount;
            bigBlindPlayer.hasActed = true; // 大盲视为已行动（除非有加注）
        }

        // 8. 发底牌
        PokerEngine.dealHoleCards(activePlayers, deck, dealerIndex);

        // 9. 确定第一个行动者（大盲后一位）
        const firstActorIndex = PokerEngine.getNextActingPlayer(activePlayers, bigBlindIndex);
        gameState.currentPlayerIndex = firstActorIndex;

        if (firstActorIndex !== null) {
            const firstPlayer = activePlayers.find(p => p.seatIndex === firstActorIndex);
            if (firstPlayer) {
                firstPlayer.isCurrentTurn = true;
                // 设置超时
                gameState.turnTimeout = Date.now() + room.config.turnTimeout * 1000;
                this.startActionTimer(room.id, firstPlayer.id, room.config.turnTimeout);
            }
        }

        // 10. 更新版本
        gameState.stateVersion++;

        console.log(`[GameController] 新手牌开始: handId=${handId}, 庄家=${dealerIndex}, 小盲=${smallBlindIndex}, 大盲=${bigBlindIndex}`);

        return gameState;
    }

    /**
     * 开始新的下注轮
     */
    startBettingRound(room: Room, phase: GamePhase): void {
        const gameState = room.gameState!;
        const players = this.getActivePlayers(room);

        // 重置下注轮状态
        gameState.phase = phase;
        gameState.roundId = uuidv4();
        gameState.currentBet = 0;

        // 重置玩家下注状态
        players.forEach(p => {
            p.currentBet = 0;
            p.hasActed = false;
        });

        // 发公共牌
        if (phase === GamePhase.FLOP) {
            const flop = PokerEngine.dealCommunityCards(gameState.deck, 3);
            gameState.communityCards = flop;
        } else if (phase === GamePhase.TURN || phase === GamePhase.RIVER) {
            const card = PokerEngine.dealCommunityCards(gameState.deck, 1);
            gameState.communityCards.push(...card);
        }

        // 确定第一个行动者（庄家后一位）
        const firstActorIndex = PokerEngine.getNextActingPlayer(players, gameState.dealerIndex);
        gameState.currentPlayerIndex = firstActorIndex;

        // 清除之前的当前玩家标记
        players.forEach(p => p.isCurrentTurn = false);

        if (firstActorIndex !== null) {
            const firstPlayer = players.find(p => p.seatIndex === firstActorIndex);
            if (firstPlayer) {
                firstPlayer.isCurrentTurn = true;
                gameState.turnTimeout = Date.now() + room.config.turnTimeout * 1000;
                this.startActionTimer(room.id, firstPlayer.id, room.config.turnTimeout);
            }
        } else {
            // 没有可行动的玩家，直接结束本轮
            this.advancePhaseOrShowdown(room);
        }

        gameState.stateVersion++;

        console.log(`[GameController] 进入阶段: ${phase}, 公共牌: ${gameState.communityCards.length}张`);
    }

    // ========================================
    // 玩家操作处理
    // ========================================

    /**
     * 处理玩家操作
     */
    processAction(room: Room, player: Player, payload: PlayerActionPayload): ActionResult {
        const gameState = room.gameState;

        if (!gameState) {
            return { success: false, error: 'GAME_NOT_STARTED' };
        }

        // 1. requestId 去重
        if (this.processedRequests.has(payload.requestId)) {
            return { success: false, error: 'DUPLICATE_REQUEST' };
        }

        // 2. roundIndex 校验
        if (payload.roundIndex !== gameState.roundIndex) {
            return { success: false, error: 'STALE_REQUEST' };
        }

        // 3. 检查是否是当前行动者
        if (player.seatIndex !== gameState.currentPlayerIndex) {
            return { success: false, error: 'NOT_YOUR_TURN' };
        }

        // 4. 检查玩家状态
        if (!player.canAct()) {
            return { success: false, error: 'CANNOT_ACT' };
        }

        // 5. 清除超时定时器
        this.clearActionTimer(room.id);

        // 6. 执行操作
        let result: ActionResult;
        switch (payload.action) {
            case ActionType.FOLD:
                result = this.executeFold(room, player);
                break;
            case ActionType.CHECK:
                result = this.executeCheck(room, player);
                break;
            case ActionType.CALL:
                result = this.executeCall(room, player);
                break;
            case ActionType.RAISE:
                result = this.executeRaise(room, player, payload.amount ?? 0);
                break;
            case ActionType.ALL_IN:
                result = this.executeAllIn(room, player);
                break;
            default:
                result = { success: false, error: 'INVALID_ACTION' };
        }

        if (!result.success) {
            return result;
        }

        // 7. 记录 requestId
        this.addProcessedRequest(payload.requestId);

        // 8. 记录操作历史
        gameState.actionHistory.push({
            playerId: player.id,
            action: payload.action,
            amount: payload.amount ?? 0,
            phase: gameState.phase,
            timestamp: Date.now()
        });

        // 9. 检查下注轮是否结束
        const allPlayers = this.getSeatedPlayers(room);
        if (this.isRoundComplete(allPlayers, gameState.currentBet)) {
            result.shouldAdvancePhase = true;
        }

        // 10. 检查是否只剩一人
        const remainingPlayers = allPlayers.filter(p =>
            p.isInHand() && !p.isFolded && p.status !== PlayerStatus.ELIMINATED
        );
        if (remainingPlayers.length <= 1) {
            result.shouldEndHand = true;
        }

        // 11. 找到下一个行动者或推进阶段
        if (!result.shouldEndHand && !result.shouldAdvancePhase) {
            this.moveToNextPlayer(room);
        }

        // 12. 更新版本
        gameState.stateVersion++;

        return result;
    }

    /**
     * 执行弃牌
     */
    private executeFold(room: Room, player: Player): ActionResult {
        player.fold();
        player.isCurrentTurn = false;

        console.log(`[GameController] ${player.nickname} FOLD`);
        return { success: true };
    }

    /**
     * 执行过牌
     */
    private executeCheck(room: Room, player: Player): ActionResult {
        const gameState = room.gameState!;

        // 只有当不需要跟注时才能过牌
        if (player.currentBet < gameState.currentBet) {
            return { success: false, error: 'CANNOT_CHECK_MUST_CALL' };
        }

        player.hasActed = true;
        player.isCurrentTurn = false;

        console.log(`[GameController] ${player.nickname} CHECK`);
        return { success: true };
    }

    /**
     * 执行跟注
     */
    private executeCall(room: Room, player: Player): ActionResult {
        const gameState = room.gameState!;
        const callAmount = gameState.currentBet - player.currentBet;

        if (callAmount <= 0) {
            return { success: false, error: 'NOTHING_TO_CALL' };
        }

        const actualAmount = player.deductChips(callAmount);
        // 确保 pots 存在
        if (gameState.pots.length === 0) {
            gameState.pots = [{ amount: 0, eligiblePlayerIds: [] }];
        }
        gameState.pots[0].amount += actualAmount;

        player.hasActed = true;
        player.isCurrentTurn = false;

        console.log(`[GameController] ${player.nickname} CALL ${actualAmount}`);
        return { success: true };
    }

    /**
     * 执行加注
     */
    private executeRaise(room: Room, player: Player, raiseAmount: number): ActionResult {
        const gameState = room.gameState!;
        const minTotalBet = gameState.currentBet + gameState.minRaise;

        // 验证加注金额
        if (raiseAmount < minTotalBet && raiseAmount < player.chips + player.currentBet) {
            return { success: false, error: 'RAISE_TOO_SMALL' };
        }

        const amountToAdd = raiseAmount - player.currentBet;

        if (amountToAdd > player.chips) {
            return { success: false, error: 'NOT_ENOUGH_CHIPS' };
        }

        // 执行加注
        const actualAmount = player.deductChips(amountToAdd);
        // 确保 pots 存在
        if (gameState.pots.length === 0) {
            gameState.pots = [{ amount: 0, eligiblePlayerIds: [] }];
        }
        gameState.pots[0].amount += actualAmount;

        // 更新当前最高下注和最小加注额
        const raiseBy = raiseAmount - gameState.currentBet;
        gameState.currentBet = raiseAmount;
        gameState.minRaise = Math.max(gameState.minRaise, raiseBy);

        // 加注后其他人需要重新行动
        const allPlayers = this.getSeatedPlayers(room);
        allPlayers.forEach(p => {
            if (p.id !== player.id && !p.isFolded && !p.isAllIn) {
                p.hasActed = false;
            }
        });

        player.hasActed = true;
        player.isCurrentTurn = false;

        console.log(`[GameController] ${player.nickname} RAISE to ${raiseAmount}`);
        return { success: true };
    }

    /**
     * 执行全押
     */
    private executeAllIn(room: Room, player: Player): ActionResult {
        const gameState = room.gameState!;
        const allInAmount = player.chips;
        const totalBet = player.currentBet + allInAmount;

        const actualAmount = player.allIn();
        // 确保 pots 存在
        if (gameState.pots.length === 0) {
            gameState.pots = [{ amount: 0, eligiblePlayerIds: [] }];
        }
        gameState.pots[0].amount += actualAmount;

        // 如果 all-in 金额大于当前下注，视为加注
        if (totalBet > gameState.currentBet) {
            const raiseBy = totalBet - gameState.currentBet;
            gameState.currentBet = totalBet;
            gameState.minRaise = Math.max(gameState.minRaise, raiseBy);

            // 其他人需要重新行动
            const allPlayers = this.getSeatedPlayers(room);
            allPlayers.forEach(p => {
                if (p.id !== player.id && !p.isFolded && !p.isAllIn) {
                    p.hasActed = false;
                }
            });
        }

        player.hasActed = true;
        player.isCurrentTurn = false;

        console.log(`[GameController] ${player.nickname} ALL-IN ${actualAmount}`);
        return { success: true };
    }

    /**
     * 处理超时
     */
    handleTimeout(room: Room, playerId: string): ActionResult {
        const player = room.players.get(playerId);
        if (!player || !room.gameState) {
            return { success: false, error: 'INVALID_STATE' };
        }

        // 检查是否仍是该玩家的回合
        if (player.seatIndex !== room.gameState.currentPlayerIndex) {
            return { success: false, error: 'NOT_YOUR_TURN' };
        }

        // 根据情况自动执行操作
        const needToCall = player.currentBet < room.gameState.currentBet;

        const payload: PlayerActionPayload = {
            action: needToCall ? ActionType.FOLD : ActionType.CHECK,
            roundIndex: room.gameState.roundIndex,
            requestId: `timeout-${uuidv4()}`
        };

        console.log(`[GameController] ${player.nickname} 超时，自动执行 ${payload.action}`);

        return this.processAction(room, player, payload);
    }

    // ========================================
    // 下注轮控制
    // ========================================

    /**
     * 移动到下一个行动者
     */
    private moveToNextPlayer(room: Room): void {
        const gameState = room.gameState!;
        const players = this.getActivePlayers(room);

        // 清除当前玩家标记
        players.forEach(p => p.isCurrentTurn = false);

        const nextIndex = PokerEngine.getNextActingPlayer(players, gameState.currentPlayerIndex!);
        gameState.currentPlayerIndex = nextIndex;

        if (nextIndex !== null) {
            const nextPlayer = players.find(p => p.seatIndex === nextIndex);
            if (nextPlayer) {
                nextPlayer.isCurrentTurn = true;
                gameState.turnTimeout = Date.now() + room.config.turnTimeout * 1000;
                this.startActionTimer(room.id, nextPlayer.id, room.config.turnTimeout);
            }
        }
    }

    /**
     * 检查下注轮是否完成
     */
    private isRoundComplete(players: Player[], currentBet: number): boolean {
        const activePlayers = players.filter(p =>
            p.seatIndex !== null &&
            !p.isFolded &&
            p.status !== PlayerStatus.ELIMINATED &&
            p.status !== PlayerStatus.WAITING
        );

        // 只剩一人
        if (activePlayers.length <= 1) {
            return true;
        }

        // 非 all-in 玩家
        const nonAllInPlayers = activePlayers.filter(p => !p.isAllIn);

        // 全部 all-in
        if (nonAllInPlayers.length === 0) {
            return true;
        }

        // 检查下注额一致且都已行动
        return nonAllInPlayers.every(p => p.hasActed && p.currentBet === currentBet);
    }

    /**
     * 推进到下一阶段或摊牌
     */
    advancePhaseOrShowdown(room: Room): GamePhase | 'SHOWDOWN' | 'END_HAND' {
        const gameState = room.gameState!;
        const players = this.getSeatedPlayers(room);

        // 检查是否只剩一人
        const remainingPlayers = players.filter(p =>
            p.isInHand() && !p.isFolded && p.status !== PlayerStatus.ELIMINATED
        );

        if (remainingPlayers.length <= 1) {
            return 'END_HAND';
        }

        // 计算边池（每轮结束时）
        gameState.pots = PokerEngine.calculateSidePots(players);

        // 重置玩家下注
        players.forEach(p => p.resetForNewRound());

        // 推进阶段
        const phaseOrder = [GamePhase.PRE_FLOP, GamePhase.FLOP, GamePhase.TURN, GamePhase.RIVER, GamePhase.SHOWDOWN];
        const currentIndex = phaseOrder.indexOf(gameState.phase);
        const nextPhase = phaseOrder[currentIndex + 1];

        if (nextPhase === GamePhase.SHOWDOWN || !nextPhase) {
            return 'SHOWDOWN';
        }

        // 检查是否所有人都 all-in（跳过剩余下注轮）
        const nonAllInPlayers = remainingPlayers.filter(p => !p.isAllIn);
        if (nonAllInPlayers.length <= 1) {
            // 直接发完所有公共牌
            while (gameState.communityCards.length < 5) {
                const cards = PokerEngine.dealCommunityCards(gameState.deck,
                    gameState.communityCards.length === 0 ? 3 : 1
                );
                gameState.communityCards.push(...cards);
            }
            return 'SHOWDOWN';
        }

        return nextPhase;
    }

    // ========================================
    // 摊牌与结算
    // ========================================

    /**
     * 执行摊牌
     */
    evaluateShowdown(room: Room): HandResult {
        const gameState = room.gameState!;
        const players = this.getSeatedPlayers(room);

        // 确保公共牌发满 5 张
        while (gameState.communityCards.length < 5 && gameState.deck.length > 0) {
            const cards = PokerEngine.dealCommunityCards(gameState.deck,
                gameState.communityCards.length === 0 ? 3 : 1
            );
            gameState.communityCards.push(...cards);
        }

        // 获取未弃牌的玩家
        const showdownPlayers = players.filter(p =>
            p.isInHand() && !p.isFolded && p.holeCards.length === 2
        );

        // 评估每个玩家的牌型
        const playerHands = new Map<string, EvaluatedHand>();
        showdownPlayers.forEach(p => {
            const evaluated = PokerEngine.evaluateHand(p.holeCards, gameState.communityCards);
            playerHands.set(p.id, evaluated);
        });

        // 确保边池已计算
        if (gameState.pots.length === 0 || gameState.pots[0].amount === 0) {
            gameState.pots = PokerEngine.calculateSidePots(players);
        }

        // 分配底池
        const winnings = PokerEngine.awardPots(gameState.pots, playerHands, players);

        // 构建结果
        const winners: HandResult['winners'] = [];
        winnings.forEach((amount, playerId) => {
            if (amount > 0) {
                const player = players.find(p => p.id === playerId);
                const hand = playerHands.get(playerId);
                if (player) {
                    player.addChips(amount);
                    winners.push({
                        playerId,
                        nickname: player.nickname,
                        amount,
                        handRank: hand?.rankName,
                        cards: player.holeCards
                    });
                }
            }
        });

        // 构建摊牌展示
        const showdownCards = showdownPlayers.map(p => ({
            playerId: p.id,
            cards: p.holeCards
        }));

        console.log(`[GameController] 摊牌结算完成，赢家: ${winners.map(w => w.nickname).join(', ')}`);

        return {
            winners,
            pots: gameState.pots,
            showdownCards
        };
    }

    /**
     * 仅剩一人时的结算（无需摊牌）
     */
    settleSingleWinner(room: Room): HandResult {
        const gameState = room.gameState!;
        const players = this.getSeatedPlayers(room);

        // 找到唯一未弃牌的玩家
        const winner = players.find(p =>
            p.isInHand() && !p.isFolded && p.status !== PlayerStatus.ELIMINATED
        );

        if (!winner) {
            throw new Error('NO_WINNER_FOUND');
        }

        // 计算总底池
        const totalPot = gameState.pots.reduce((sum, pot) => sum + pot.amount, 0);

        // 给赢家加筹码
        winner.addChips(totalPot);

        console.log(`[GameController] 单人获胜: ${winner.nickname} 赢得 ${totalPot}`);

        return {
            winners: [{
                playerId: winner.id,
                nickname: winner.nickname,
                amount: totalPot
            }],
            pots: gameState.pots,
            showdownCards: []
        };
    }

    /**
     * 结束这手牌
     */
    endHand(room: Room): { result: HandResult; gameEnded: boolean } {
        const players = this.getSeatedPlayers(room);

        // 清除超时定时器
        this.clearActionTimer(room.id);

        // 检查是否只剩一人
        const remainingPlayers = players.filter(p =>
            p.isInHand() && !p.isFolded && p.status !== PlayerStatus.ELIMINATED
        );

        let result: HandResult;
        if (remainingPlayers.length <= 1) {
            result = this.settleSingleWinner(room);
        } else {
            result = this.evaluateShowdown(room);
        }

        // 标记淘汰玩家
        players.forEach(p => {
            if (p.chips === 0 && p.seatIndex !== null) {
                p.markAsEliminated();
            }
        });

        // 检查游戏是否结束（只剩一人有筹码）
        const playersWithChips = players.filter(p =>
            p.chips > 0 && p.seatIndex !== null
        );
        const gameEnded = playersWithChips.length <= 1;

        // 更新游戏状态
        room.gameState!.phase = GamePhase.SHOWDOWN;
        room.gameState!.stateVersion++;

        return { result, gameEnded };
    }

    // ========================================
    // 超时管理
    // ========================================

    /**
     * 启动行动计时器
     */
    private startActionTimer(roomId: string, playerId: string, timeoutSeconds: number): void {
        this.clearActionTimer(roomId);

        const timer = setTimeout(() => {
            console.log(`[GameController] 玩家 ${playerId} 行动超时`);
            if (this.onTimeout) {
                this.onTimeout(roomId, playerId);
            }
        }, timeoutSeconds * 1000);

        this.timeoutTimers.set(roomId, timer);
    }

    /**
     * 清除行动计时器
     */
    private clearActionTimer(roomId: string): void {
        const timer = this.timeoutTimers.get(roomId);
        if (timer) {
            clearTimeout(timer);
            this.timeoutTimers.delete(roomId);
        }
    }

    /**
     * 清除房间的所有计时器
     */
    clearRoomTimers(roomId: string): void {
        this.clearActionTimer(roomId);
    }

    // ========================================
    // 辅助方法
    // ========================================

    /**
     * 获取已入座的玩家
     */
    private getSeatedPlayers(room: Room): Player[] {
        return Array.from(room.players.values())
            .filter(p => p.seatIndex !== null)
            .sort((a, b) => a.seatIndex! - b.seatIndex!);
    }

    /**
     * 获取可行动的玩家
     */
    private getActivePlayers(room: Room): Player[] {
        return this.getSeatedPlayers(room).filter(p =>
            !p.isFolded &&
            !p.isAllIn &&
            p.status === PlayerStatus.ACTIVE
        );
    }

    /**
     * 添加已处理请求（LRU）
     */
    private addProcessedRequest(requestId: string): void {
        if (this.processedRequests.size >= this.MAX_REQUESTS) {
            const oldest = this.requestQueue.shift();
            if (oldest) {
                this.processedRequests.delete(oldest);
            }
        }
        this.processedRequests.add(requestId);
        this.requestQueue.push(requestId);
    }
}

// 导出单例
export const gameController = new GameController();
