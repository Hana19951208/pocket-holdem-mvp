/**
 * poker.test.ts - 德州扑克后端测试用例
 * 
 * 运行: pnpm test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { roomManager, RoomManager } from './RoomManager.js';
import { GameController } from './GameController.js';
import { PokerEngine } from './PokerEngine.js';
import { Player } from './Player.js';
import {
    ActionType,
    GamePhase,
    PlayerStatus,
    type Room,
    type PlayerActionPayload,
    type Card,
    Suit
} from './Interfaces.js';

// ========================================
// 测试辅助函数
// ========================================

/**
 * 创建测试房间并初始化玩家
 */
function createTestRoom(playerCount: number = 3): { room: Room; controller: GameController } {
    const controller = new GameController();

    // 创建房间
    const hostSocketId = `test-socket-host-${uuidv4()}`;
    const { room } = roomManager.createRoom(
        'TestHost',
        { initialChips: 1000, smallBlind: 10, bigBlind: 20 },
        hostSocketId
    );

    const roomObj = roomManager.getRoom(room.id)!;

    // 加入玩家
    for (let i = 1; i < playerCount; i++) {
        const socketId = `test-socket-${i}-${uuidv4()}`;
        const result = roomManager.joinRoom(room.id, `Player${i}`, socketId);
        if (result) {
            // 入座
            roomManager.sitDown(result.playerId, i);
        }
    }

    // 房主入座
    const hostId = Array.from(roomObj.players.keys())[0];
    roomManager.sitDown(hostId, 0);

    return { room: roomObj, controller };
}

/**
 * 执行玩家操作
 */
function doAction(
    room: Room,
    controller: GameController,
    action: ActionType,
    amount?: number
): ReturnType<typeof controller.processAction> {
    const gameState = room.gameState!;
    const player = getPlayerBySeat(room, gameState.currentPlayerIndex!);

    if (!player) {
        return { success: false, error: 'NO_CURRENT_PLAYER' };
    }

    const payload: PlayerActionPayload = {
        action,
        amount,
        roundIndex: gameState.roundIndex,
        requestId: uuidv4()
    };

    return controller.processAction(room, player, payload);
}

/**
 * 获取座位上的玩家
 */
function getPlayerBySeat(room: Room, seatIndex: number): Player | null {
    for (const player of room.players.values()) {
        if (player.seatIndex === seatIndex) {
            return player;
        }
    }
    return null;
}

/**
 * 让所有玩家执行 CHECK 或 CALL 直到下注轮结束
 */
function playUntilRoundEnd(room: Room, controller: GameController): boolean {
    const gameState = room.gameState;
    if (!gameState) return false;

    let iterations = 0;
    const maxIterations = 20;

    while (gameState.currentPlayerIndex !== null && iterations < maxIterations) {
        const player = getPlayerBySeat(room, gameState.currentPlayerIndex);
        if (!player) break;

        const needToCall = player.currentBet < gameState.currentBet;
        const action = needToCall ? ActionType.CALL : ActionType.CHECK;

        const result = doAction(room, controller, action);

        if (!result.success) {
            // 如果 CALL 失败（筹码不足），尝试 ALL_IN
            if (needToCall) {
                doAction(room, controller, ActionType.ALL_IN);
            }
        }

        if (result.shouldEndHand || result.shouldAdvancePhase) {
            return result.shouldEndHand ?? false;
        }

        iterations++;
    }

    return false;
}

// ========================================
// 测试用例
// ========================================

describe('PokerEngine 牌型评估', () => {
    it('应该正确识别皇家同花顺', () => {
        const holeCards: Card[] = [
            { suit: Suit.SPADES, rank: 14 }, // A♠
            { suit: Suit.SPADES, rank: 13 }  // K♠
        ];
        const communityCards: Card[] = [
            { suit: Suit.SPADES, rank: 12 }, // Q♠
            { suit: Suit.SPADES, rank: 11 }, // J♠
            { suit: Suit.SPADES, rank: 10 }, // 10♠
            { suit: Suit.HEARTS, rank: 5 },
            { suit: Suit.CLUBS, rank: 2 }
        ];

        const result = PokerEngine.evaluateHand(holeCards, communityCards);

        expect(result.rankName).toBe('皇家同花顺');
    });

    it('应该正确识别葫芦', () => {
        const holeCards: Card[] = [
            { suit: Suit.SPADES, rank: 10 },
            { suit: Suit.HEARTS, rank: 10 }
        ];
        const communityCards: Card[] = [
            { suit: Suit.DIAMONDS, rank: 10 },
            { suit: Suit.CLUBS, rank: 7 },
            { suit: Suit.SPADES, rank: 7 },
            { suit: Suit.HEARTS, rank: 2 },
            { suit: Suit.DIAMONDS, rank: 3 }
        ];

        const result = PokerEngine.evaluateHand(holeCards, communityCards);

        expect(result.rankName).toBe('葫芦');
    });

    it('应该正确比较两手牌', () => {
        // 一对 vs 两对
        const hand1 = PokerEngine.evaluateHand(
            [{ suit: Suit.SPADES, rank: 10 }, { suit: Suit.HEARTS, rank: 10 }],
            [{ suit: Suit.DIAMONDS, rank: 5 }, { suit: Suit.CLUBS, rank: 7 }, { suit: Suit.SPADES, rank: 2 }]
        );

        const hand2 = PokerEngine.evaluateHand(
            [{ suit: Suit.SPADES, rank: 9 }, { suit: Suit.HEARTS, rank: 9 }],
            [{ suit: Suit.DIAMONDS, rank: 5 }, { suit: Suit.CLUBS, rank: 5 }, { suit: Suit.SPADES, rank: 2 }]
        );

        expect(hand2.score).toBeGreaterThan(hand1.score);
    });
});

describe('边池计算', () => {
    it('应该正确计算简单边池', () => {
        const players = [
            new Player({ nickname: 'A', chips: 0 }),
            new Player({ nickname: 'B', chips: 0 }),
            new Player({ nickname: 'C', chips: 0 })
        ];

        players[0].seatIndex = 0;
        players[0].totalBetThisHand = 50;
        players[0].status = PlayerStatus.ALL_IN;

        players[1].seatIndex = 1;
        players[1].totalBetThisHand = 100;
        players[1].status = PlayerStatus.ACTIVE;

        players[2].seatIndex = 2;
        players[2].totalBetThisHand = 100;
        players[2].status = PlayerStatus.ACTIVE;

        const pots = PokerEngine.calculateSidePots(players);

        expect(pots.length).toBe(2);
        expect(pots[0].amount).toBe(150); // 50 * 3
        expect(pots[1].amount).toBe(100); // (100-50) * 2
    });

    it('应该正确处理弃牌玩家的边池资格', () => {
        const players = [
            new Player({ nickname: 'A', chips: 0 }),
            new Player({ nickname: 'B', chips: 0 }),
            new Player({ nickname: 'C', chips: 0 }),
            new Player({ nickname: 'D', chips: 0 })
        ];

        players[0].seatIndex = 0;
        players[0].totalBetThisHand = 50;
        players[0].status = PlayerStatus.ALL_IN;

        players[1].seatIndex = 1;
        players[1].totalBetThisHand = 100;
        players[1].status = PlayerStatus.ACTIVE;

        players[2].seatIndex = 2;
        players[2].totalBetThisHand = 200;
        players[2].status = PlayerStatus.ACTIVE;

        players[3].seatIndex = 3;
        players[3].totalBetThisHand = 200;
        players[3].isFolded = true;
        players[3].status = PlayerStatus.FOLDED;

        const pots = PokerEngine.calculateSidePots(players);

        // 池1: 50*4 = 200, eligible: [A, B, C] (D弃牌)
        // 池2: (100-50)*3 = 150, eligible: [B, C]
        // 池3: (200-100)*2 = 200, eligible: [C] (D弃牌不分配)
        expect(pots.length).toBe(3);
        expect(pots[0].eligiblePlayerIds).not.toContain(players[3].id);
    });
});

describe('完整游戏流程', () => {
    it('应该能完成一局完整的德州游戏', () => {
        const { room, controller } = createTestRoom(3);

        // 开始游戏
        room.isPlaying = true;
        room.gameState = controller.startNewHand(room);

        expect(room.gameState).not.toBeNull();
        expect(room.gameState!.phase).toBe(GamePhase.PRE_FLOP);
        expect(room.gameState!.handId).toBeDefined();
        expect(room.gameState!.stateVersion).toBeGreaterThan(0);

        // 验证盲注已收取
        expect(room.gameState!.pots[0].amount).toBe(30); // 10 + 20

        // 循环执行所有下注轮直到结束
        let handEnded = false;
        const maxPhases = 10;
        let phaseCount = 0;

        while (!handEnded && phaseCount < maxPhases) {
            // 执行当前下注轮
            handEnded = playUntilRoundEnd(room, controller);

            if (!handEnded) {
                // 推进到下一阶段
                const nextPhase = controller.advancePhaseOrShowdown(room);
                if (typeof nextPhase === 'string') {
                    // SHOWDOWN 或 END_HAND
                    handEnded = true;
                } else {
                    controller.startBettingRound(room, nextPhase);
                }
            }
            phaseCount++;
        }

        // 验证游戏能正常结算
        controller.clearRoomTimers(room.id);
        const { result } = controller.endHand(room);

        expect(result.winners.length).toBeGreaterThan(0);
    });

    it('只剩一人未弃牌时应直接结束', () => {
        const { room, controller } = createTestRoom(3);

        room.isPlaying = true;
        room.gameState = controller.startNewHand(room);

        // 第一个玩家弃牌
        let result = doAction(room, controller, ActionType.FOLD);
        expect(result.success).toBe(true);

        // 第二个玩家弃牌
        result = doAction(room, controller, ActionType.FOLD);
        expect(result.success).toBe(true);
        expect(result.shouldEndHand).toBe(true);

        // 结算
        controller.clearRoomTimers(room.id);
        const { result: handResult } = controller.endHand(room);

        expect(handResult.winners.length).toBe(1);
        expect(handResult.showdownCards.length).toBe(0); // 无需摊牌
    });

    it('玩家淘汰后不应再发牌', () => {
        const { room, controller } = createTestRoom(3);

        room.isPlaying = true;
        room.gameState = controller.startNewHand(room);

        // 找到一个玩家，清空筹码模拟淘汰
        const player = getPlayerBySeat(room, 0)!;
        player.chips = 0;
        player.markAsEliminated();

        // 开始新手牌
        room.gameState = controller.startNewHand(room);

        // 被淘汰的玩家不应有手牌
        expect(player.holeCards.length).toBe(0);
        expect(player.status).toBe(PlayerStatus.ELIMINATED);
    });
});

describe('状态版本控制', () => {
    it('stateVersion 应该在每次操作后递增', () => {
        const { room, controller } = createTestRoom(3);

        room.isPlaying = true;
        room.gameState = controller.startNewHand(room);

        const initialVersion = room.gameState!.stateVersion;

        // 执行一次操作
        doAction(room, controller, ActionType.CALL);

        expect(room.gameState!.stateVersion).toBe(initialVersion + 1);
    });

    it('应该拒绝重复的 requestId', () => {
        const { room, controller } = createTestRoom(3);

        room.isPlaying = true;
        room.gameState = controller.startNewHand(room);

        const player = getPlayerBySeat(room, room.gameState!.currentPlayerIndex!)!;
        const requestId = uuidv4();

        // 第一次请求
        const payload1: PlayerActionPayload = {
            action: ActionType.CALL,
            roundIndex: room.gameState!.roundIndex,
            requestId
        };
        const result1 = controller.processAction(room, player, payload1);
        expect(result1.success).toBe(true);

        // 第二次相同 requestId
        const payload2: PlayerActionPayload = {
            action: ActionType.CALL,
            roundIndex: room.gameState!.roundIndex,
            requestId // 相同的 requestId
        };

        // 需要找到下一个玩家来测试
        const nextPlayer = getPlayerBySeat(room, room.gameState!.currentPlayerIndex!)!;
        const result2 = controller.processAction(room, nextPlayer, payload2);

        expect(result2.success).toBe(false);
        expect(result2.error).toBe('DUPLICATE_REQUEST');
    });

    it('应该拒绝过期的 roundIndex', () => {
        const { room, controller } = createTestRoom(3);

        room.isPlaying = true;
        room.gameState = controller.startNewHand(room);

        const player = getPlayerBySeat(room, room.gameState!.currentPlayerIndex!)!;

        // 使用错误的 roundIndex
        const payload: PlayerActionPayload = {
            action: ActionType.CALL,
            roundIndex: room.gameState!.roundIndex + 999, // 错误的轮次
            requestId: uuidv4()
        };

        const result = controller.processAction(room, player, payload);

        expect(result.success).toBe(false);
        expect(result.error).toBe('STALE_REQUEST');
    });

    it('handId 应该在新手牌时变化', () => {
        const { room, controller } = createTestRoom(3);

        room.isPlaying = true;
        room.gameState = controller.startNewHand(room);

        const firstHandId = room.gameState!.handId;

        // 快速结束这手牌（所有人弃牌）
        doAction(room, controller, ActionType.FOLD);
        doAction(room, controller, ActionType.FOLD);

        controller.clearRoomTimers(room.id);
        controller.endHand(room);

        // 开始新手牌
        room.gameState = controller.startNewHand(room);

        expect(room.gameState!.handId).not.toBe(firstHandId);
    });
});

describe('新局状态重置', () => {
    it('新局应该正确重置玩家状态', () => {
        const { room, controller } = createTestRoom(3);

        room.isPlaying = true;
        room.gameState = controller.startNewHand(room);

        // 让玩家弃牌
        const player = getPlayerBySeat(room, room.gameState!.currentPlayerIndex!)!;
        doAction(room, controller, ActionType.FOLD);

        expect(player.isFolded).toBe(true);
        expect(player.status).toBe(PlayerStatus.FOLDED);

        // 结束这手牌
        doAction(room, controller, ActionType.FOLD);
        controller.clearRoomTimers(room.id);
        controller.endHand(room);

        // 开始新手牌
        room.gameState = controller.startNewHand(room);

        // 验证状态已重置
        expect(player.isFolded).toBe(false);
        expect(player.currentBet).toBeLessThanOrEqual(20); // 可能是盲注
        expect(player.hasActed).toBe(player.seatIndex === room.gameState!.bigBlindIndex); // 大盲视为已行动
    });
});
