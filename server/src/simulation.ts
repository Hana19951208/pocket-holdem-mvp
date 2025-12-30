/**
 * simulation.ts - 自动对局模拟器
 * 
 * 用于验证后端游戏逻辑的正确性。
 * 运行：npx tsx src/simulation.ts
 */

import { v4 as uuidv4 } from 'uuid';
import { roomManager } from './RoomManager.js';
import { gameController } from './GameController.js';
import { PokerEngine } from './PokerEngine.js';
import {
    ActionType,
    GamePhase,
    PlayerStatus,
    type Room,
    type PlayerActionPayload,
    type Card
} from './Interfaces.js';
import { Player } from './Player.js';

// ========================================
// 日志工具
// ========================================

const LOG_DIVIDER = '═'.repeat(60);
const LOG_SUB_DIVIDER = '─'.repeat(40);

function log(message: string): void {
    console.log(`[SIM] ${message}`);
}

function logSection(title: string): void {
    console.log(`\n${LOG_DIVIDER}`);
    console.log(`  📋 ${title}`);
    console.log(LOG_DIVIDER);
}

function logSubSection(title: string): void {
    console.log(`\n${LOG_SUB_DIVIDER}`);
    console.log(`  🔹 ${title}`);
    console.log(LOG_SUB_DIVIDER);
}

// ========================================
// 模拟玩家 AI
// ========================================

interface SimulatedPlayer {
    id: string;
    nickname: string;
    socketId: string;
}

/**
 * 随机选择一个合法操作
 */
function chooseRandomAction(
    player: Player,
    currentBet: number,
    minRaise: number
): { action: ActionType; amount?: number } {
    const needToCall = player.currentBet < currentBet;
    const callAmount = currentBet - player.currentBet;
    const canCheck = !needToCall;
    const canCall = needToCall && player.chips >= callAmount;
    const canRaise = player.chips > callAmount + minRaise;

    // 构建可用操作列表
    const availableActions: { action: ActionType; weight: number; amount?: number }[] = [];

    // FOLD - 总是可以（权重较低）
    availableActions.push({ action: ActionType.FOLD, weight: 10 });

    // CHECK - 只有不需要跟注时可用
    if (canCheck) {
        availableActions.push({ action: ActionType.CHECK, weight: 40 });
    }

    // CALL - 需要跟注时可用
    if (canCall) {
        availableActions.push({ action: ActionType.CALL, weight: 35 });
    }

    // RAISE - 有足够筹码时可用
    if (canRaise) {
        const raiseAmount = currentBet + minRaise + Math.floor(Math.random() * player.chips * 0.3);
        const clampedRaise = Math.min(raiseAmount, player.chips + player.currentBet);
        availableActions.push({
            action: ActionType.RAISE,
            weight: 20,
            amount: clampedRaise
        });
    }

    // ALL-IN - 总是可以（权重较低）
    if (player.chips > 0) {
        availableActions.push({ action: ActionType.ALL_IN, weight: 5 });
    }

    // 按权重随机选择
    const totalWeight = availableActions.reduce((sum, a) => sum + a.weight, 0);
    let random = Math.random() * totalWeight;

    for (const action of availableActions) {
        random -= action.weight;
        if (random <= 0) {
            return { action: action.action, amount: action.amount };
        }
    }

    // 默认弃牌
    return { action: ActionType.FOLD };
}

// ========================================
// 模拟器核心
// ========================================

class GameSimulator {
    private room: Room | null = null;
    private players: SimulatedPlayer[] = [];
    private handCount = 0;
    private stats = {
        handsPlayed: 0,
        showdowns: 0,
        foldWins: 0,
        totalPots: 0,
        eliminatedPlayers: [] as string[]
    };

    /**
     * 初始化模拟
     */
    async initialize(playerCount: number = 6): Promise<void> {
        logSection('初始化模拟');

        // 1. 创建房间
        const hostSocketId = `sim-socket-host`;
        const { room, playerId: hostId } = roomManager.createRoom(
            '房主Alice',
            { initialChips: 1000, smallBlind: 10, bigBlind: 20 },
            hostSocketId
        );

        this.room = roomManager.getRoom(room.id)!;
        this.players.push({ id: hostId, nickname: '房主Alice', socketId: hostSocketId });

        log(`✅ 房间创建成功: ${room.id}`);

        // 2. 加入其他玩家
        const names = ['Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy'];
        for (let i = 0; i < playerCount - 1 && i < names.length; i++) {
            const socketId = `sim-socket-${i}`;
            const result = roomManager.joinRoom(room.id, names[i], socketId);
            if (result) {
                this.players.push({ id: result.playerId, nickname: names[i], socketId });
                log(`✅ 玩家 ${names[i]} 加入房间`);
            }
        }

        // 3. 所有玩家入座
        for (let i = 0; i < this.players.length; i++) {
            const result = roomManager.sitDown(this.players[i].id, i);
            if (result.success) {
                log(`✅ ${this.players[i].nickname} 入座位置 ${i}`);
            }
        }

        log(`\n📊 房间状态: ${this.players.length} 名玩家已就位`);
    }

    /**
     * 开始游戏
     */
    startGame(): void {
        if (!this.room) throw new Error('Room not initialized');

        logSection('游戏开始');

        // 通过 GameController 开始
        this.room.isPlaying = true;
        this.room.gameState = gameController.startNewHand(this.room);

        this.logGameState();
    }

    /**
     * 模拟一手牌
     */
    playHand(): boolean {
        if (!this.room || !this.room.gameState) return false;

        this.handCount++;
        logSection(`第 ${this.handCount} 手牌`);

        const gameState = this.room.gameState;

        // 记录庄位和盲注
        log(`🎰 庄家位置: ${gameState.dealerIndex}`);
        log(`🔹 小盲位置: ${gameState.smallBlindIndex} (${this.room.config.smallBlind})`);
        log(`🔸 大盲位置: ${gameState.bigBlindIndex} (${this.room.config.bigBlind})`);

        // 显示玩家手牌
        this.logHoleCards();

        // 执行下注轮
        let handEnded = false;

        while (!handEnded && gameState.phase !== GamePhase.SHOWDOWN) {
            logSubSection(`下注轮: ${gameState.phase}`);

            if (gameState.communityCards.length > 0) {
                log(`🃏 公共牌: ${gameState.communityCards.map(c => PokerEngine.getCardDisplayName(c)).join(' ')}`);
            }

            handEnded = this.playBettingRound();

            if (!handEnded) {
                // 推进到下一阶段
                const nextPhase = gameController.advancePhaseOrShowdown(this.room);

                if (nextPhase === 'END_HAND' || nextPhase === 'SHOWDOWN') {
                    handEnded = true;
                } else {
                    gameController.startBettingRound(this.room, nextPhase);
                }
            }
        }

        // 结算
        this.settleHand();

        // 检查游戏是否结束
        const activePlayers = Array.from(this.room.players.values())
            .filter(p => p.chips > 0 && p.seatIndex !== null);

        if (activePlayers.length <= 1) {
            logSection('🏆 游戏结束！');
            log(`最终赢家: ${activePlayers[0]?.nickname || '无'}`);
            return false;
        }

        // 开始新手牌
        this.room.gameState = gameController.startNewHand(this.room);

        return true;
    }

    /**
     * 执行一个下注轮
     */
    private playBettingRound(): boolean {
        if (!this.room || !this.room.gameState) return true;

        const gameState = this.room.gameState;
        let actionCount = 0;
        const maxActions = 50; // 防止无限循环

        while (gameState.currentPlayerIndex !== null && actionCount < maxActions) {
            const currentPlayer = this.getPlayerBySeat(gameState.currentPlayerIndex);
            if (!currentPlayer) break;

            // AI 选择操作
            const { action, amount } = chooseRandomAction(
                currentPlayer,
                gameState.currentBet,
                gameState.minRaise
            );

            // 执行操作
            const payload: PlayerActionPayload = {
                action,
                amount,
                roundIndex: gameState.roundIndex,
                requestId: uuidv4()
            };

            const result = gameController.processAction(this.room, currentPlayer, payload);

            if (result.success) {
                this.logAction(currentPlayer, action, amount);
                actionCount++;

                // 检查是否只剩一人
                if (result.shouldEndHand) {
                    log('⚡ 只剩一人，直接结算');
                    return true;
                }

                // 检查下注轮是否结束
                if (result.shouldAdvancePhase) {
                    log('✅ 下注轮结束');
                    return false;
                }
            } else {
                log(`❌ 操作失败: ${result.error}`);
                // 强制弃牌避免死循环
                const foldPayload: PlayerActionPayload = {
                    action: ActionType.FOLD,
                    roundIndex: gameState.roundIndex,
                    requestId: uuidv4()
                };
                gameController.processAction(this.room, currentPlayer, foldPayload);
            }
        }

        return actionCount >= maxActions;
    }

    /**
     * 结算手牌
     */
    private settleHand(): void {
        if (!this.room) return;

        logSubSection('结算');

        gameController.clearRoomTimers(this.room.id);

        const { result, gameEnded } = gameController.endHand(this.room);

        this.stats.handsPlayed++;

        // 边池信息
        if (result.pots.length > 1) {
            log(`💰 边池拆分: ${result.pots.length} 个底池`);
            result.pots.forEach((pot, i) => {
                log(`   池${i + 1}: ${pot.amount} (eligible: ${pot.eligiblePlayerIds.length}人)`);
            });
        } else {
            log(`💰 底池: ${result.pots[0]?.amount || 0}`);
        }

        this.stats.totalPots += result.pots.reduce((sum, p) => sum + p.amount, 0);

        // 赢家信息
        if (result.showdownCards.length > 0) {
            this.stats.showdowns++;
            log('🎴 摊牌:');
            result.showdownCards.forEach(sc => {
                const player = this.room!.players.get(sc.playerId);
                log(`   ${player?.nickname}: ${sc.cards.map(c => PokerEngine.getCardDisplayName(c)).join(' ')}`);
            });
        } else {
            this.stats.foldWins++;
        }

        result.winners.forEach(w => {
            log(`🏆 ${w.nickname} 赢得 ${w.amount}${w.handRank ? ` (${w.handRank})` : ''}`);
        });

        // 检查淘汰
        Array.from(this.room.players.values()).forEach(p => {
            if (p.chips === 0 && p.seatIndex !== null && !this.stats.eliminatedPlayers.includes(p.nickname)) {
                this.stats.eliminatedPlayers.push(p.nickname);
                log(`💀 ${p.nickname} 被淘汰！`);
            }
        });

        // 筹码变化
        log('\n📊 筹码状态:');
        Array.from(this.room.players.values())
            .filter(p => p.seatIndex !== null)
            .sort((a, b) => a.seatIndex! - b.seatIndex!)
            .forEach(p => {
                const status = p.status === PlayerStatus.ELIMINATED ? '❌' : '✅';
                log(`   ${status} ${p.nickname}: ${p.chips}`);
            });
    }

    /**
     * 运行完整模拟
     */
    async run(maxHands: number = 10): Promise<void> {
        await this.initialize(6);
        this.startGame();

        let handsPlayed = 0;
        while (handsPlayed < maxHands) {
            const canContinue = this.playHand();
            handsPlayed++;
            if (!canContinue) break;
        }

        // 输出统计
        logSection('模拟统计');
        log(`📊 总手牌数: ${this.stats.handsPlayed}`);
        log(`🎴 摊牌次数: ${this.stats.showdowns}`);
        log(`🏳️ 弃牌获胜: ${this.stats.foldWins}`);
        log(`💰 总底池金额: ${this.stats.totalPots}`);
        log(`💀 淘汰玩家: ${this.stats.eliminatedPlayers.join(', ') || '无'}`);
    }

    // ========================================
    // 辅助方法
    // ========================================

    private getPlayerBySeat(seatIndex: number): Player | null {
        if (!this.room) return null;
        for (const player of this.room.players.values()) {
            if (player.seatIndex === seatIndex) {
                return player;
            }
        }
        return null;
    }

    private logGameState(): void {
        if (!this.room || !this.room.gameState) return;

        const gs = this.room.gameState;
        log(`📊 游戏状态: phase=${gs.phase}, handNumber=${gs.handNumber}`);
        log(`   stateVersion=${gs.stateVersion}, handId=${gs.handId.slice(0, 8)}...`);
    }

    private logHoleCards(): void {
        if (!this.room) return;

        log('🎴 底牌:');
        Array.from(this.room.players.values())
            .filter(p => p.holeCards.length > 0)
            .sort((a, b) => a.seatIndex! - b.seatIndex!)
            .forEach(p => {
                const cards = p.holeCards.map((c: Card) => PokerEngine.getCardDisplayName(c)).join(' ');
                log(`   ${p.nickname} [${p.seatIndex}]: ${cards}`);
            });
    }

    private logAction(player: Player, action: ActionType, amount?: number): void {
        const amountStr = amount !== undefined ? ` ${amount}` : '';
        log(`   🎯 ${player.nickname}: ${action}${amountStr} (chips: ${player.chips})`);
    }
}

// ========================================
// 主函数
// ========================================

async function main(): Promise<void> {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     🎰 Pocket Holdem 自动对局模拟器 v1.0                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const simulator = new GameSimulator();

    try {
        await simulator.run(10);
        console.log('\n✅ 模拟完成！\n');
    } catch (error) {
        console.error('\n❌ 模拟失败:', error);
        process.exit(1);
    }
}

main();
