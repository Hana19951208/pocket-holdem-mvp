/**
 * PokerEngine.ts - 德州扑克核心引擎
 * 
 * 设计原则：
 * 1. 纯逻辑引擎，无副作用，与 IO 层完全解耦
 * 2. 所有方法均为纯函数或内部状态变更
 * 3. 必须包含完整的边池逻辑和牌型评估
 */

import {
    type Card,
    type Pot,
    type GameState,
    type EvaluatedHand,
    type Player as IPlayer,
    Suit,
    Rank,
    GamePhase,
    HandRank
} from './Interfaces.js';
import { Player } from './Player.js';

/**
 * 德州扑克核心引擎
 * 
 * 负责：
 * - 洗牌和发牌
 * - 下注轮管理
 * - 边池计算
 * - 牌型评估与赢家判定
 */
export class PokerEngine {
    // ========================================
    // 牌组管理
    // ========================================

    /**
     * 创建一副完整的 52 张牌
     */
    static createDeck(): Card[] {
        const deck: Card[] = [];
        const suits = [Suit.SPADES, Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS];

        for (const suit of suits) {
            for (let rank = 2; rank <= 14; rank++) {
                deck.push({ suit, rank: rank as Rank });
            }
        }

        return deck;
    }

    /**
     * Fisher-Yates 洗牌算法
     * @param deck 待洗的牌组（会被修改）
     * @returns 洗好的牌组引用
     */
    static shuffleDeck(deck: Card[]): Card[] {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    /**
     * 从牌堆顶部抽取指定数量的牌
     * @param deck 牌堆
     * @param count 抽取数量
     * @returns 抽取的牌
     */
    static drawCards(deck: Card[], count: number): Card[] {
        return deck.splice(0, count);
    }

    // ========================================
    // 发牌逻辑
    // ========================================

    /**
     * 发底牌（每个活跃玩家 2 张）
     * @param players 玩家列表
     * @param deck 牌堆
     * @param dealerIndex 庄家座位索引
     */
    static dealHoleCards(
        players: Player[],
        deck: Card[],
        dealerIndex: number
    ): void {
        // 获取活跃玩家（按座位顺序，从庄家下一位开始）
        const activePlayers = this.getActivePlayersFromDealer(players, dealerIndex);

        // 每人发 2 张牌
        for (const player of activePlayers) {
            player.holeCards = this.drawCards(deck, 2);
        }
    }

    /**
     * 发公共牌
     * @param deck 牌堆
     * @param count 发牌数量（Flop=3, Turn=1, River=1）
     * @returns 发出的公共牌
     */
    static dealCommunityCards(deck: Card[], count: number): Card[] {
        // 烧一张牌
        this.drawCards(deck, 1);
        // 发公共牌
        return this.drawCards(deck, count);
    }

    // ========================================
    // 座位与顺序管理
    // ========================================

    /**
     * 获取从庄家下一位开始的活跃玩家列表
     */
    static getActivePlayersFromDealer(
        players: Player[],
        dealerIndex: number
    ): Player[] {
        const seated = players.filter(p => p.seatIndex !== null && p.canPlay());
        if (seated.length === 0) return [];

        // 按座位排序
        seated.sort((a, b) => a.seatIndex! - b.seatIndex!);

        // 找到庄家后面的第一个玩家
        const dealerPos = seated.findIndex(p => p.seatIndex! > dealerIndex);

        if (dealerPos === -1) {
            // 庄家是最后一个，从头开始
            return seated;
        }

        // 重新排列：从庄家下一位开始
        return [...seated.slice(dealerPos), ...seated.slice(0, dealerPos)];
    }

    /**
     * 确定下一个庄家位置
     * @param currentDealerIndex 当前庄家座位索引
     * @param players 玩家列表
     * @returns 下一个庄家的座位索引
     */
    static getNextDealerIndex(
        currentDealerIndex: number,
        players: Player[]
    ): number {
        // 获取所有可以当庄的玩家（有座位且未淘汰）
        const eligiblePlayers = players.filter(p =>
            p.seatIndex !== null &&
            p.status !== 'ELIMINATED' &&
            p.chips > 0
        ).sort((a, b) => a.seatIndex! - b.seatIndex!);

        if (eligiblePlayers.length === 0) {
            return currentDealerIndex;
        }

        // 找到下一个座位索引大于当前庄家的玩家
        const nextPlayer = eligiblePlayers.find(p => p.seatIndex! > currentDealerIndex);

        return nextPlayer ? nextPlayer.seatIndex! : eligiblePlayers[0].seatIndex!;
    }

    /**
     * 确定小盲和大盲位置
     * @param dealerIndex 庄家座位索引
     * @param players 活跃玩家列表（已筛选过有筹码的玩家）
     * @returns { smallBlindIndex, bigBlindIndex }
     */
    static getBlindsIndexes(
        dealerIndex: number,
        players: Player[]
    ): { smallBlindIndex: number; bigBlindIndex: number } {
        // 直接使用传入的玩家（不再调用 getActivePlayersFromDealer 筛选）
        // 按座位排序
        const seated = players.filter(p => p.seatIndex !== null)
            .sort((a, b) => a.seatIndex! - b.seatIndex!);

        if (seated.length < 2) {
            throw new Error('Not enough players for blinds');
        }

        // 从庄家下一位开始排列
        const dealerPos = seated.findIndex(p => p.seatIndex! > dealerIndex);
        const orderedPlayers = dealerPos === -1
            ? seated
            : [...seated.slice(dealerPos), ...seated.slice(0, dealerPos)];

        // Heads-up 规则：庄家 = 小盲
        if (orderedPlayers.length === 2) {
            return {
                smallBlindIndex: dealerIndex,
                bigBlindIndex: orderedPlayers[0].seatIndex!
            };
        }

        // 标准规则：庄家下一位 = 小盲，再下一位 = 大盲
        return {
            smallBlindIndex: orderedPlayers[0].seatIndex!,
            bigBlindIndex: orderedPlayers[1].seatIndex!
        };
    }

    // ========================================
    // 边池计算（核心算法）
    // ========================================

    /**
     * 计算边池
     * 
     * 算法说明：
     * 1. 按玩家的总投入额排序
     * 2. 逐层切割，每层形成一个边池
     * 3. 只有投入达到该层的玩家才有资格分配该池
     * 
     * @param players 参与手牌的玩家（含已弃牌但有投入的玩家）
     * @returns 底池列表（主池 + 边池）
     */
    static calculateSidePots(players: Player[]): Pot[] {
        // 获取所有有投入的玩家
        const playersWithBets = players.filter(p => p.currentBet > 0);

        if (playersWithBets.length === 0) {
            return [];
        }

        // 按投入额排序（从小到大）
        const sortedPlayers = [...playersWithBets].sort(
            (a, b) => a.currentBet - b.currentBet
        );

        const pots: Pot[] = [];
        let prevBet = 0;

        for (let i = 0; i < sortedPlayers.length; i++) {
            const currentBet = sortedPlayers[i].currentBet;
            const betDiff = currentBet - prevBet;

            if (betDiff > 0) {
                // 计算这一层的底池金额
                const contributorsCount = sortedPlayers.length - i;
                const potAmount = betDiff * contributorsCount;

                // 有资格分配此池的玩家（投入 >= currentBet 且未弃牌）
                const eligiblePlayerIds = sortedPlayers
                    .slice(i)
                    .filter(p => !p.isFolded)
                    .map(p => p.id);

                // 即使只有一个人有资格（其他人都弃牌了），也要创建这个池
                if (eligiblePlayerIds.length > 0) {
                    pots.push({
                        amount: potAmount,
                        eligiblePlayerIds
                    });
                } else {
                    // 所有有资格的人都弃牌了，钱归还给唯一存活者（这个逻辑在 awardPots 里处理）
                    const survivors = sortedPlayers.filter(p => !p.isFolded);
                    if (survivors.length > 0) {
                        pots.push({
                            amount: potAmount,
                            eligiblePlayerIds: [survivors[0].id]
                        });
                    }
                }
            }

            prevBet = currentBet;
        }

        return pots;
    }

    /**
     * 分配底池给赢家
     * 
     * @param pots 底池列表
     * @param playerHandRanks 玩家手牌评估结果映射
     * @param players 玩家列表
     * @returns 各玩家赢得的金额映射
     */
    static awardPots(
        pots: Pot[],
        playerHandRanks: Map<string, EvaluatedHand>,
        players: Player[]
    ): Map<string, number> {
        const winnings = new Map<string, number>();

        // 初始化所有玩家的赢取金额
        players.forEach(p => winnings.set(p.id, 0));

        for (const pot of pots) {
            // 筛选出有资格且有评估结果的玩家
            const eligibleWithHands = pot.eligiblePlayerIds
                .map(id => ({ id, hand: playerHandRanks.get(id) }))
                .filter((p): p is { id: string; hand: EvaluatedHand } => p.hand !== undefined);

            if (eligibleWithHands.length === 0) {
                // 没有有资格的玩家，底池应该不会出现这种情况
                continue;
            }

            // 找到最高分
            const maxScore = Math.max(...eligibleWithHands.map(p => p.hand.score));

            // 找出所有最高分的玩家（可能平分）
            const winners = eligibleWithHands.filter(p => p.hand.score === maxScore);

            // 平分底池
            const shareBase = Math.floor(pot.amount / winners.length);
            let remainder = pot.amount % winners.length;

            // 按座位顺序排列赢家，余数给位置最靠前的
            const sortedWinners = winners
                .map(w => ({ ...w, seatIndex: players.find(p => p.id === w.id)?.seatIndex ?? 99 }))
                .sort((a, b) => a.seatIndex - b.seatIndex);

            for (const winner of sortedWinners) {
                let share = shareBase;
                if (remainder > 0) {
                    share += 1;
                    remainder--;
                }

                const currentWinnings = winnings.get(winner.id) || 0;
                winnings.set(winner.id, currentWinnings + share);
            }
        }

        return winnings;
    }

    // ========================================
    // 牌型评估
    // ========================================

    /**
     * 评估一手牌（7 张牌中选最佳 5 张）
     * 
     * @param holeCards 底牌（2 张）
     * @param communityCards 公共牌（3-5 张）
     * @returns 评估结果
     */
    static evaluateHand(holeCards: Card[], communityCards: Card[]): EvaluatedHand {
        const allCards = [...holeCards, ...communityCards];

        // 生成所有 5 张牌组合（C(7,5) = 21 种）
        const combinations = this.getCombinations(allCards, 5);

        // 评估每种组合，找出最佳
        let bestHand: EvaluatedHand | null = null;

        for (const combo of combinations) {
            const evaluated = this.evaluateFiveCards(combo);
            if (!bestHand || evaluated.score > bestHand.score) {
                bestHand = evaluated;
            }
        }

        return bestHand!;
    }

    /**
     * 评估 5 张牌的牌型
     */
    private static evaluateFiveCards(cards: Card[]): EvaluatedHand {
        // 按点数排序（降序）
        const sorted = [...cards].sort((a, b) => b.rank - a.rank);

        const isFlush = this.isFlush(sorted);
        const straight = this.getStraight(sorted);
        const groups = this.getGroups(sorted);

        let rank: HandRank;
        let rankName: string;
        let kickers: Rank[];

        // 皇家同花顺
        if (isFlush && straight && straight[0].rank === 14) {
            rank = HandRank.ROYAL_FLUSH;
            rankName = '皇家同花顺';
            kickers = [];
        }
        // 同花顺
        else if (isFlush && straight) {
            rank = HandRank.STRAIGHT_FLUSH;
            rankName = '同花顺';
            kickers = [straight[0].rank];
        }
        // 四条
        else if (groups.four.length === 1) {
            rank = HandRank.FOUR_OF_A_KIND;
            rankName = '四条';
            kickers = [groups.four[0], groups.singles[0]];
        }
        // 葫芦
        else if (groups.three.length === 1 && groups.pairs.length >= 1) {
            rank = HandRank.FULL_HOUSE;
            rankName = '葫芦';
            kickers = [groups.three[0], groups.pairs[0]];
        }
        // 同花
        else if (isFlush) {
            rank = HandRank.FLUSH;
            rankName = '同花';
            kickers = sorted.map(c => c.rank);
        }
        // 顺子
        else if (straight) {
            rank = HandRank.STRAIGHT;
            rankName = '顺子';
            kickers = [straight[0].rank];
        }
        // 三条
        else if (groups.three.length === 1) {
            rank = HandRank.THREE_OF_A_KIND;
            rankName = '三条';
            kickers = [groups.three[0], ...groups.singles.slice(0, 2)];
        }
        // 两对
        else if (groups.pairs.length >= 2) {
            rank = HandRank.TWO_PAIR;
            rankName = '两对';
            kickers = [...groups.pairs.slice(0, 2), groups.singles[0]];
        }
        // 一对
        else if (groups.pairs.length === 1) {
            rank = HandRank.ONE_PAIR;
            rankName = '一对';
            kickers = [groups.pairs[0], ...groups.singles.slice(0, 3)];
        }
        // 高牌
        else {
            rank = HandRank.HIGH_CARD;
            rankName = '高牌';
            kickers = sorted.map(c => c.rank);
        }

        // 计算综合得分（用于快速比较）
        const score = this.calculateScore(rank, kickers);

        return {
            rank,
            rankName,
            bestCards: straight || sorted,
            kickers,
            score
        };
    }

    /**
     * 检查是否为同花
     */
    private static isFlush(cards: Card[]): boolean {
        const suit = cards[0].suit;
        return cards.every(c => c.suit === suit);
    }

    /**
     * 获取顺子（如果是的话）
     * 处理 A-2-3-4-5 特殊情况
     */
    private static getStraight(sortedCards: Card[]): Card[] | null {
        const ranks = sortedCards.map(c => c.rank);

        // 检查普通顺子
        let isStraight = true;
        for (let i = 1; i < ranks.length; i++) {
            if (ranks[i] !== ranks[i - 1] - 1) {
                isStraight = false;
                break;
            }
        }
        if (isStraight) return sortedCards;

        // 检查 A-2-3-4-5（轮盘顺）
        if (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 &&
            ranks[3] === 3 && ranks[4] === 2) {
            // 重新排列为 5-4-3-2-A
            return [sortedCards[1], sortedCards[2], sortedCards[3], sortedCards[4], sortedCards[0]];
        }

        return null;
    }

    /**
     * 分析牌的分组（四条、三条、对子、单张）
     */
    private static getGroups(cards: Card[]): {
        four: Rank[];
        three: Rank[];
        pairs: Rank[];
        singles: Rank[];
    } {
        const countMap = new Map<Rank, number>();
        cards.forEach(c => {
            countMap.set(c.rank, (countMap.get(c.rank) || 0) + 1);
        });

        const four: Rank[] = [];
        const three: Rank[] = [];
        const pairs: Rank[] = [];
        const singles: Rank[] = [];

        countMap.forEach((count, rank) => {
            if (count === 4) four.push(rank);
            else if (count === 3) three.push(rank);
            else if (count === 2) pairs.push(rank);
            else singles.push(rank);
        });

        // 按点数降序排列
        [four, three, pairs, singles].forEach(arr => arr.sort((a, b) => b - a));

        return { four, three, pairs, singles };
    }

    /**
     * 计算综合得分（用于快速比较两手牌）
     * 
     * 得分结构：牌型 * 10^10 + kicker[0] * 10^8 + kicker[1] * 10^6 + ...
     */
    private static calculateScore(rank: HandRank, kickers: Rank[]): number {
        let score = rank * Math.pow(10, 10);

        for (let i = 0; i < kickers.length && i < 5; i++) {
            score += kickers[i] * Math.pow(10, 8 - i * 2);
        }

        return score;
    }

    /**
     * 生成组合（用于 C(n,k)）
     */
    private static getCombinations<T>(arr: T[], k: number): T[][] {
        if (k === 0) return [[]];
        if (arr.length === 0) return [];
        if (arr.length < k) return [];

        const [first, ...rest] = arr;
        const withFirst = this.getCombinations(rest, k - 1).map(combo => [first, ...combo]);
        const withoutFirst = this.getCombinations(rest, k);

        return [...withFirst, ...withoutFirst];
    }

    // ========================================
    // 下注轮逻辑
    // ========================================

    /**
     * 获取下一个行动玩家
     * @param players 玩家列表
     * @param currentIndex 当前玩家座位索引
     * @returns 下一个玩家的座位索引，null 表示本轮结束
     */
    static getNextActingPlayer(
        players: Player[],
        currentIndex: number
    ): number | null {
        // 获取可行动的玩家（在座、未弃牌、未全押、有筹码）
        const actingPlayers = players.filter(p =>
            p.seatIndex !== null &&
            !p.isFolded &&
            !p.isAllIn &&
            p.status !== 'ELIMINATED' &&
            p.status !== 'WAITING'
        ).sort((a, b) => a.seatIndex! - b.seatIndex!);

        if (actingPlayers.length === 0) {
            return null;
        }

        // 找到下一个座位索引
        const nextPlayer = actingPlayers.find(p => p.seatIndex! > currentIndex);
        return nextPlayer ? nextPlayer.seatIndex! : actingPlayers[0].seatIndex!;
    }

    /**
     * 检查本轮下注是否结束
     * 
     * 结束条件：
     * 1. 所有未弃牌玩家的下注额相同
     * 2. 所有未弃牌玩家都已行动（排除 All-in 玩家）
     */
    static isRoundComplete(players: Player[], currentBet: number): boolean {
        // 获取仍在手牌中的玩家
        const activePlayers = players.filter(p =>
            p.seatIndex !== null &&
            !p.isFolded &&
            p.status !== 'ELIMINATED' &&
            p.status !== 'WAITING'
        );

        // 如果只剩一人（其他人弃牌），回合结束
        if (activePlayers.length <= 1) {
            return true;
        }

        // 检查所有非全押玩家是否都已行动且下注额一致
        const nonAllInPlayers = activePlayers.filter(p => !p.isAllIn);

        // 如果所有人都 All-in 了，回合结束
        if (nonAllInPlayers.length === 0) {
            return true;
        }

        // 检查下注额是否一致 & 是否都已行动
        return nonAllInPlayers.every(p =>
            p.hasActed && p.currentBet === currentBet
        );
    }

    /**
     * 检查手牌是否结束（只剩一人或到摊牌阶段）
     */
    static isHandComplete(players: Player[], phase: GamePhase): boolean {
        if (phase === GamePhase.SHOWDOWN) {
            return true;
        }

        // 获取仍在手牌中的玩家
        const activePlayers = players.filter(p =>
            p.seatIndex !== null &&
            !p.isFolded &&
            p.status !== 'ELIMINATED' &&
            p.status !== 'WAITING'
        );

        return activePlayers.length <= 1;
    }

    // ========================================
    // 工具方法
    // ========================================

    /**
     * 获取牌的显示名称
     */
    static getCardDisplayName(card: Card): string {
        const suitSymbols: Record<Suit, string> = {
            [Suit.SPADES]: '♠',
            [Suit.HEARTS]: '♥',
            [Suit.DIAMONDS]: '♦',
            [Suit.CLUBS]: '♣'
        };

        const rankNames: Record<number, string> = {
            11: 'J',
            12: 'Q',
            13: 'K',
            14: 'A'
        };

        const rankDisplay = rankNames[card.rank] || card.rank.toString();
        return `${suitSymbols[card.suit]}${rankDisplay}`;
    }
}
