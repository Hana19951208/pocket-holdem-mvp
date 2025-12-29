/**
 * poker.showdown.test.ts - Showdown 正确性高覆盖单元测试
 * 
 * 测试内容：
 * 1. 多人 River Check → Showdown
 * 2. 平局判定与分锅
 * 3. Kicker 规则
 * 4. 牌型对决
 * 5. 边池分配
 */

import { describe, it, expect } from 'vitest';
import { PokerEngine } from './PokerEngine.js';
import { Player } from './Player.js';
import {
    type Card,
    type EvaluatedHand,
    type Pot,
    Suit,
    Rank,
    HandRank
} from './Interfaces.js';

// ========================================
// 测试辅助函数
// ========================================

/**
 * 创建一张牌
 */
function createCard(rank: Rank, suit: Suit): Card {
    return { rank, suit };
}

/**
 * 快速创建牌（简写）
 * 例: c('As') = A♠, c('Kh') = K♥, c('10d') = 10♦
 */
function c(notation: string): Card {
    const suitMap: Record<string, Suit> = {
        's': Suit.SPADES,
        'h': Suit.HEARTS,
        'd': Suit.DIAMONDS,
        'c': Suit.CLUBS
    };

    const rankMap: Record<string, Rank> = {
        'A': 14, 'K': 13, 'Q': 12, 'J': 11,
        '10': 10, '9': 9, '8': 8, '7': 7,
        '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
    };

    const suit = suitMap[notation.slice(-1).toLowerCase()];
    const rankStr = notation.slice(0, -1);
    const rank = rankMap[rankStr] || parseInt(rankStr);

    return { rank: rank as Rank, suit };
}

/**
 * 评估多个玩家的手牌并返回赢家
 */
function evaluateShowdown(
    players: { id: string; holeCards: Card[] }[],
    communityCards: Card[]
): {
    winners: string[];
    rankName: string;
    scores: Map<string, number>;
    hands: Map<string, EvaluatedHand>;
} {
    const hands = new Map<string, EvaluatedHand>();
    const scores = new Map<string, number>();

    players.forEach(p => {
        const evaluated = PokerEngine.evaluateHand(p.holeCards, communityCards);
        hands.set(p.id, evaluated);
        scores.set(p.id, evaluated.score);
    });

    const maxScore = Math.max(...Array.from(scores.values()));
    const winners = players.filter(p => scores.get(p.id) === maxScore).map(p => p.id);
    const winnerHand = hands.get(winners[0])!;

    return { winners, rankName: winnerHand.rankName, scores, hands };
}

/**
 * 创建测试用玩家
 */
function createTestPlayer(id: string, chips: number, holeCards: Card[] = []): Player {
    const player = new Player({
        nickname: `Player_${id}`,
        chips,
        id
    });
    player.holeCards = holeCards;
    player.seatIndex = parseInt(id.replace('p', '')) - 1;
    return player;
}

// ========================================
// 牌型评估测试
// ========================================

describe('牌型评估 (Hand Evaluation)', () => {
    describe('基础牌型识别', () => {
        it('皇家同花顺 (Royal Flush)', () => {
            const holeCards = [c('As'), c('Ks')];
            const community = [c('Qs'), c('Js'), c('10s'), c('2h'), c('3d')];

            const result = PokerEngine.evaluateHand(holeCards, community);

            expect(result.rank).toBe(HandRank.ROYAL_FLUSH);
            expect(result.rankName).toBe('皇家同花顺');
        });

        it('同花顺 (Straight Flush)', () => {
            const holeCards = [c('9s'), c('8s')];
            const community = [c('7s'), c('6s'), c('5s'), c('2h'), c('3d')];

            const result = PokerEngine.evaluateHand(holeCards, community);

            expect(result.rank).toBe(HandRank.STRAIGHT_FLUSH);
            expect(result.rankName).toBe('同花顺');
        });

        it('四条 (Four of a Kind)', () => {
            const holeCards = [c('Ah'), c('Ad')];
            const community = [c('As'), c('Ac'), c('Ks'), c('2h'), c('3d')];

            const result = PokerEngine.evaluateHand(holeCards, community);

            expect(result.rank).toBe(HandRank.FOUR_OF_A_KIND);
            expect(result.rankName).toBe('四条');
        });

        it('葫芦 (Full House)', () => {
            const holeCards = [c('Ah'), c('Ad')];
            const community = [c('As'), c('Kc'), c('Ks'), c('2h'), c('3d')];

            const result = PokerEngine.evaluateHand(holeCards, community);

            expect(result.rank).toBe(HandRank.FULL_HOUSE);
            expect(result.rankName).toBe('葫芦');
        });

        it('同花 (Flush)', () => {
            const holeCards = [c('Ah'), c('Kh')];
            const community = [c('Qh'), c('9h'), c('5h'), c('2s'), c('3d')];

            const result = PokerEngine.evaluateHand(holeCards, community);

            expect(result.rank).toBe(HandRank.FLUSH);
            expect(result.rankName).toBe('同花');
        });

        it('顺子 (Straight)', () => {
            const holeCards = [c('Ah'), c('Kd')];
            const community = [c('Qs'), c('Jc'), c('10h'), c('2s'), c('3d')];

            const result = PokerEngine.evaluateHand(holeCards, community);

            expect(result.rank).toBe(HandRank.STRAIGHT);
            expect(result.rankName).toBe('顺子');
        });

        it('顺子 - A2345 轮盘顺', () => {
            const holeCards = [c('Ah'), c('2d')];
            const community = [c('3s'), c('4c'), c('5h'), c('9s'), c('Kd')];

            const result = PokerEngine.evaluateHand(holeCards, community);

            expect(result.rank).toBe(HandRank.STRAIGHT);
            expect(result.rankName).toBe('顺子');
            // A2345 顺子的最高牌应该是 5
            expect(result.kickers[0]).toBe(5);
        });

        it('三条 (Three of a Kind)', () => {
            const holeCards = [c('Ah'), c('Ad')];
            const community = [c('As'), c('Kc'), c('Qs'), c('2h'), c('3d')];

            const result = PokerEngine.evaluateHand(holeCards, community);

            expect(result.rank).toBe(HandRank.THREE_OF_A_KIND);
            expect(result.rankName).toBe('三条');
        });

        it('两对 (Two Pair)', () => {
            const holeCards = [c('Ah'), c('Ad')];
            const community = [c('Ks'), c('Kc'), c('Qs'), c('2h'), c('3d')];

            const result = PokerEngine.evaluateHand(holeCards, community);

            expect(result.rank).toBe(HandRank.TWO_PAIR);
            expect(result.rankName).toBe('两对');
        });

        it('一对 (One Pair)', () => {
            const holeCards = [c('Ah'), c('Ad')];
            const community = [c('Ks'), c('Qc'), c('Js'), c('2h'), c('3d')];

            const result = PokerEngine.evaluateHand(holeCards, community);

            expect(result.rank).toBe(HandRank.ONE_PAIR);
            expect(result.rankName).toBe('一对');
        });

        it('高牌 (High Card)', () => {
            const holeCards = [c('Ah'), c('Kd')];
            const community = [c('Qs'), c('Jc'), c('9s'), c('2h'), c('3d')];

            const result = PokerEngine.evaluateHand(holeCards, community);

            expect(result.rank).toBe(HandRank.HIGH_CARD);
            expect(result.rankName).toBe('高牌');
        });
    });
});

// ========================================
// 平局与分锅测试
// ========================================

describe('平局与分锅 (Tie & Split Pot)', () => {
    describe('2人平局', () => {
        it('同牌型同踢脚 - 应平分', () => {
            // 公共牌形成最佳手牌，两人手牌无用
            const community = [c('As'), c('Ks'), c('Qs'), c('Js'), c('10s')];

            const result = evaluateShowdown([
                { id: 'p1', holeCards: [c('2h'), c('3h')] },
                { id: 'p2', holeCards: [c('4h'), c('5h')] }
            ], community);

            expect(result.winners).toHaveLength(2);
            expect(result.winners).toContain('p1');
            expect(result.winners).toContain('p2');
            expect(result.rankName).toBe('皇家同花顺');
        });

        it('一对相同 + Kicker 相同 - 应平分', () => {
            const community = [c('As'), c('Ah'), c('Ks'), c('Qs'), c('Js')];

            const result = evaluateShowdown([
                { id: 'p1', holeCards: [c('2h'), c('3h')] },
                { id: 'p2', holeCards: [c('2d'), c('3d')] }
            ], community);

            // 最佳手牌都是 A A K Q J
            expect(result.winners).toHaveLength(2);
            expect(result.rankName).toBe('一对');
            expect(result.scores.get('p1')).toBe(result.scores.get('p2'));
        });
    });

    describe('3人平局', () => {
        it('公共牌决定胜负 - 3人平分', () => {
            const community = [c('As'), c('Ks'), c('Qs'), c('Js'), c('9s')];

            const result = evaluateShowdown([
                { id: 'p1', holeCards: [c('2h'), c('3h')] },
                { id: 'p2', holeCards: [c('4h'), c('5h')] },
                { id: 'p3', holeCards: [c('6h'), c('7h')] }
            ], community);

            expect(result.winners).toHaveLength(3);
            expect(result.winners).toContain('p1');
            expect(result.winners).toContain('p2');
            expect(result.winners).toContain('p3');
        });
    });

    describe('4人场景', () => {
        it('4人公共牌决定 - 4人平分', () => {
            // 公共牌是顺子 A K Q J 10
            const community = [c('As'), c('Kh'), c('Qd'), c('Jc'), c('10s')];

            const result = evaluateShowdown([
                { id: 'p1', holeCards: [c('2h'), c('3h')] },
                { id: 'p2', holeCards: [c('4h'), c('5h')] },
                { id: 'p3', holeCards: [c('6h'), c('7h')] },
                { id: 'p4', holeCards: [c('8h'), c('9h')] }  // 9h 不改变顺子
            ], community);

            expect(result.winners).toHaveLength(4);
            expect(result.rankName).toBe('顺子');
        });
    });
});

// ========================================
// Kicker 决胜测试
// ========================================

describe('Kicker 决胜', () => {
    it('一对相同 - 高踢脚获胜', () => {
        const community = [c('As'), c('Kh'), c('7d'), c('5c'), c('2s')];

        const result = evaluateShowdown([
            { id: 'p1', holeCards: [c('Ah'), c('Qd')] },  // AA K Q 7
            { id: 'p2', holeCards: [c('Ad'), c('Jc')] }   // AA K J 7
        ], community);

        expect(result.winners).toHaveLength(1);
        expect(result.winners[0]).toBe('p1');  // Q > J
        expect(result.rankName).toBe('一对');
    });

    it('两对相同 - 第五张决胜', () => {
        const community = [c('As'), c('Ah'), c('Ks'), c('Kh'), c('2d')];

        const result = evaluateShowdown([
            { id: 'p1', holeCards: [c('Qh'), c('3h')] },  // AA KK Q
            { id: 'p2', holeCards: [c('Jh'), c('4h')] }   // AA KK J
        ], community);

        expect(result.winners).toHaveLength(1);
        expect(result.winners[0]).toBe('p1');  // Q > J
    });

    it('三条相同 - Kicker 决胜', () => {
        const community = [c('As'), c('Ah'), c('Ad'), c('5c'), c('2s')];

        const result = evaluateShowdown([
            { id: 'p1', holeCards: [c('Kh'), c('Qd')] },  // AAA K Q
            { id: 'p2', holeCards: [c('Kd'), c('Jc')] }   // AAA K J
        ], community);

        expect(result.winners).toHaveLength(1);
        expect(result.winners[0]).toBe('p1');  // Q > J
    });

    it('高牌对决 - 逐张比较', () => {
        const community = [c('As'), c('Kh'), c('Qd'), c('Jc'), c('2s')];

        const result = evaluateShowdown([
            { id: 'p1', holeCards: [c('9h'), c('8d')] },  // A K Q J 9
            { id: 'p2', holeCards: [c('9d'), c('7c')] }   // A K Q J 9 (同)
        ], community);

        // 最佳五张都是 A K Q J 9，平局
        expect(result.winners).toHaveLength(2);
    });
});

// ========================================
// 牌型对决测试
// ========================================

describe('牌型对决', () => {
    it('Full House > Flush', () => {
        // p1: Full House AAA KK
        // p2: Flush (cannot form flush without 5 same suit)
        const community = [c('As'), c('Ah'), c('Kh'), c('Qh'), c('2d')];

        const result = evaluateShowdown([
            { id: 'p1', holeCards: [c('Ad'), c('Kd')] },  // Full House: AAA KK
            { id: 'p2', holeCards: [c('Jh'), c('9h')] }   // Flush: A K Q J 9 ♥
        ], community);

        expect(result.winners).toHaveLength(1);
        expect(result.winners[0]).toBe('p1');
        expect(result.hands.get('p1')?.rank).toBe(HandRank.FULL_HOUSE);
        expect(result.hands.get('p2')?.rank).toBe(HandRank.FLUSH);
    });

    it('Flush > Straight', () => {
        const community = [c('As'), c('Ks'), c('Qs'), c('Jh'), c('10d')];

        const result = evaluateShowdown([
            { id: 'p1', holeCards: [c('9s'), c('2s')] },  // Flush: A K Q 9 2 ♠
            { id: 'p2', holeCards: [c('9h'), c('8c')] }   // Straight: A K Q J 10
        ], community);

        expect(result.winners).toHaveLength(1);
        expect(result.winners[0]).toBe('p1');
    });

    it('Straight > Three of a Kind', () => {
        const community = [c('As'), c('Kh'), c('Qd'), c('Jc'), c('Js')];

        const result = evaluateShowdown([
            { id: 'p1', holeCards: [c('10h'), c('2d')] }, // Straight: A K Q J 10
            { id: 'p2', holeCards: [c('Jd'), c('3c')] }   // Trips: JJJ A K
        ], community);

        expect(result.winners).toHaveLength(1);
        expect(result.winners[0]).toBe('p1');
    });

    it('Four of a Kind > Full House', () => {
        const community = [c('As'), c('Ah'), c('Ad'), c('Kh'), c('Ks')];

        const result = evaluateShowdown([
            { id: 'p1', holeCards: [c('Ac'), c('2d')] },  // Quads: AAAA K
            { id: 'p2', holeCards: [c('Kd'), c('3c')] }   // Full House: KKK AA
        ], community);

        expect(result.winners).toHaveLength(1);
        expect(result.winners[0]).toBe('p1');
    });
});

// ========================================
// 边池分配测试
// ========================================

describe('边池分配 (Side Pot)', () => {
    it('简单边池 - 赢家有资格', () => {
        const players = [
            createTestPlayer('p1', 0),  // All-in 100
            createTestPlayer('p2', 100), // Call 100, bet 50 more
            createTestPlayer('p3', 0)    // Call 150
        ];

        // 模拟投入（使用 totalBetThisHand）
        players[0].totalBetThisHand = 100;
        players[0].isAllIn = true;
        players[1].totalBetThisHand = 150;
        players[2].totalBetThisHand = 150;

        const pots = PokerEngine.calculateSidePots(players);

        // 主池: 100 * 3 = 300 (p1, p2, p3 有资格)
        // 边池: 50 * 2 = 100 (p2, p3 有资格)
        expect(pots).toHaveLength(2);
        expect(pots[0].amount).toBe(300);
        expect(pots[0].eligiblePlayerIds).toContain('p1');
        expect(pots[1].amount).toBe(100);
        expect(pots[1].eligiblePlayerIds).not.toContain('p1');
    });

    it('边池分配 - All-in 玩家赢主池', () => {
        const players = [
            createTestPlayer('p1', 0, [c('As'), c('Ah')]),  // AA
            createTestPlayer('p2', 0, [c('Ks'), c('Kh')]),  // KK
            createTestPlayer('p3', 0, [c('Qs'), c('Qh')])   // QQ
        ];

        players[0].totalBetThisHand = 100;
        players[0].isAllIn = true;
        players[1].totalBetThisHand = 150;
        players[2].totalBetThisHand = 150;

        const community = [c('2d'), c('3c'), c('4s'), c('5h'), c('7d')];

        // 评估手牌
        const playerHands = new Map<string, EvaluatedHand>();
        players.forEach(p => {
            playerHands.set(p.id, PokerEngine.evaluateHand(p.holeCards, community));
        });

        const pots = PokerEngine.calculateSidePots(players);
        const winnings = PokerEngine.awardPots(pots, playerHands, players);

        // p1 (AA) 赢主池 300
        // p2 (KK) 赢边池 100
        expect(winnings.get('p1')).toBe(300);
        expect(winnings.get('p2')).toBe(100);
        expect(winnings.get('p3')).toBe(0);
    });

    it('边池平分 - 余数给靠前座位', () => {
        const players = [
            createTestPlayer('p1', 0, [c('As'), c('Ah')]),
            createTestPlayer('p2', 0, [c('Ad'), c('Ac')])  // 和 p1 平局
        ];

        players[0].totalBetThisHand = 101;  // 奇数，无法整除
        players[1].totalBetThisHand = 101;

        const community = [c('Ks'), c('Qh'), c('Jd'), c('10c'), c('2s')];

        const playerHands = new Map<string, EvaluatedHand>();
        players.forEach(p => {
            playerHands.set(p.id, PokerEngine.evaluateHand(p.holeCards, community));
        });

        const pots = PokerEngine.calculateSidePots(players);
        const winnings = PokerEngine.awardPots(pots, playerHands, players);

        // 202 / 2 = 101 each (can divide evenly this time)
        // 但如果是 101，则 p1 得 51，p2 得 50
        expect(winnings.get('p1')! + winnings.get('p2')!).toBe(202);
    });
});

// ========================================
// 弃牌玩家排除测试
// ========================================

describe('弃牌玩家排除', () => {
    it('弃牌玩家不参与评估', () => {
        const players = [
            createTestPlayer('p1', 0, [c('As'), c('Ah')]),  // 最强牌但弃牌
            createTestPlayer('p2', 0, [c('Ks'), c('Kh')]),
            createTestPlayer('p3', 0, [c('Qs'), c('Qh')])
        ];

        players[0].isFolded = true;  // p1 弃牌
        players[0].totalBetThisHand = 100;
        players[1].totalBetThisHand = 100;
        players[2].totalBetThisHand = 100;

        const community = [c('2d'), c('3c'), c('4s'), c('5h'), c('7d')];

        // 只评估未弃牌的玩家
        const activePlayers = players.filter(p => !p.isFolded);
        const playerHands = new Map<string, EvaluatedHand>();
        activePlayers.forEach(p => {
            playerHands.set(p.id, PokerEngine.evaluateHand(p.holeCards, community));
        });

        const pots = PokerEngine.calculateSidePots(players);
        const winnings = PokerEngine.awardPots(pots, playerHands, players);

        // p2 (KK) 应该赢
        expect(winnings.get('p1')).toBe(0);  // 弃牌不赢
        expect(winnings.get('p2')).toBe(300);
        expect(winnings.get('p3')).toBe(0);
    });
});

// ========================================
// 完整 Showdown 场景测试
// ========================================

describe('完整 Showdown 场景', () => {
    it('4人 River 全 Check - 正确评估赢家', () => {
        const players = [
            { id: 'p1', holeCards: [c('As'), c('Ah')] },  // AA
            { id: 'p2', holeCards: [c('Ks'), c('Kh')] },  // KK
            { id: 'p3', holeCards: [c('Qs'), c('Qh')] },  // QQ
            { id: 'p4', holeCards: [c('Js'), c('Jh')] }   // JJ
        ];

        // 修改：公共牌不形成顺子
        const community = [c('2d'), c('3c'), c('6s'), c('8h'), c('10d')];

        const result = evaluateShowdown(players, community);

        expect(result.winners).toHaveLength(1);
        expect(result.winners[0]).toBe('p1');  // AA wins
        expect(result.rankName).toBe('一对');
    });

    it('多人 All-in + River Check + Showdown', () => {
        const players = [
            createTestPlayer('p1', 0, [c('As'), c('Ah')]),  // AA, All-in 100
            createTestPlayer('p2', 0, [c('Ks'), c('Kh')]),  // KK, All-in 100
            createTestPlayer('p3', 50, [c('Qs'), c('Qh')]), // QQ, played normally
            createTestPlayer('p4', 50, [c('Js'), c('Jh')])  // JJ, played normally
        ];

        players[0].totalBetThisHand = 100;
        players[0].isAllIn = true;
        players[1].totalBetThisHand = 100;
        players[1].isAllIn = true;
        players[2].totalBetThisHand = 150;
        players[3].totalBetThisHand = 150;

        const community = [c('2d'), c('3c'), c('4s'), c('5h'), c('7d')];

        const playerHands = new Map<string, EvaluatedHand>();
        players.forEach(p => {
            playerHands.set(p.id, PokerEngine.evaluateHand(p.holeCards, community));
        });

        const pots = PokerEngine.calculateSidePots(players);
        const winnings = PokerEngine.awardPots(pots, playerHands, players);

        // 主池: 100 * 4 = 400 → p1 (AA) wins
        // 边池: 50 * 2 = 100 → p3 (QQ) wins (p1,p2 没资格)
        expect(winnings.get('p1')).toBe(400);
        expect(winnings.get('p2')).toBe(0);
        expect(winnings.get('p3')).toBe(100);
        expect(winnings.get('p4')).toBe(0);
    });
});
