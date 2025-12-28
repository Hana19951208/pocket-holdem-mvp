<script setup lang="ts">
/**
 * App.vue - 应用主入口
 * 
 * 实现简单的路由逻辑：
 * - home: 首页（创建/加入房间）
 * - room: 房间（座位、准备）
 * - game: 游戏（对局）
 */
import { ref, computed, watch } from 'vue';
import { useSocket } from './composables/useSocket';
import { ActionType, type Card, getCardDisplay, formatChips, GamePhase } from './types';

// 使用 Socket 连接
const { 
  isConnected, 
  isConnecting, 
  room, 
  myPlayerId, 
  myCards, 
  error,
  createRoom, 
  joinRoom, 
  sitDown, 
  startGame, 
  playerAction, 
  leaveRoom 
} = useSocket();

// 当前视图
const currentView = ref<'home' | 'room' | 'game'>('home');

// 首页表单数据
const nickname = ref('');
const roomIdInput = ref('');
const showJoinForm = ref(false);

// 加注输入
const raiseAmount = ref(0);

// ========================================
// 计算属性
// ========================================

// 我的玩家信息
const myPlayer = computed(() => {
  if (!myPlayerId.value || !room.value) return null;
  return room.value.players.find(p => p.id === myPlayerId.value) || null;
});

// 我是否为房主
const isHost = computed(() => {
  return myPlayerId.value === room.value?.hostId;
});

// 我是否已入座
const isSeated = computed(() => {
  return myPlayer.value?.seatIndex !== null && myPlayer.value?.seatIndex !== undefined;
});

// 是否轮到我行动
const isMyTurn = computed(() => {
  return myPlayer.value?.isCurrentTurn ?? false;
});

// 入座的玩家数
const seatedCount = computed(() => {
  if (!room.value) return 0;
  return room.value.players.filter(p => p.seatIndex !== null).length;
});

// 当前需要跟注额
const callAmount = computed(() => {
  if (!room.value?.gameState || !myPlayer.value) return 0;
  return room.value.gameState.currentBet - myPlayer.value.currentBet;
});

// 最小加注额
const minRaise = computed(() => {
  if (!room.value?.gameState) return 0;
  return room.value.gameState.currentBet + room.value.gameState.minRaise;
});

// 最大加注（我的全部筹码）
const maxRaise = computed(() => {
  if (!myPlayer.value) return 0;
  return myPlayer.value.chips + myPlayer.value.currentBet;
});

// 底池总额
const totalPot = computed(() => {
  if (!room.value?.gameState?.pots) return 0;
  return room.value.gameState.pots.reduce((sum, pot) => sum + pot.amount, 0);
});

// 可用操作按钮状态（防止非法 ACTION）
const canCheck = computed(() => {
  // 只有当前下注等于我的下注时可以过牌
  return isMyTurn.value && callAmount.value === 0;
});

const canCall = computed(() => {
  // 需要跟注金额且有足够筹码
  if (!myPlayer.value || !isMyTurn.value) return false;
  return callAmount.value > 0 && myPlayer.value.chips >= callAmount.value;
});

const canRaise = computed(() => {
  // 需要有足够筹码进行加注
  if (!myPlayer.value || !isMyTurn.value) return false;
  return myPlayer.value.chips > callAmount.value;
});

const canAllIn = computed(() => {
  // 有筹码即可全押
  if (!myPlayer.value || !isMyTurn.value) return false;
  return myPlayer.value.chips > 0;
});

// 监听房间变化自动切换视图
watch(room, (newRoom) => {
  if (newRoom) {
    currentView.value = newRoom.isPlaying ? 'game' : 'room';
  } else {
    currentView.value = 'home';
  }
});

// ========================================
// 操作方法
// ========================================

// 创建房间
const handleCreateRoom = () => {
  if (!nickname.value.trim()) {
    alert('请输入昵称');
    return;
  }
  createRoom(nickname.value.trim());
};

// 加入房间
const handleJoinRoom = () => {
  if (!nickname.value.trim()) {
    alert('请输入昵称');
    return;
  }
  if (!roomIdInput.value.trim()) {
    alert('请输入房间号');
    return;
  }
  joinRoom(roomIdInput.value.trim(), nickname.value.trim());
};

// 入座
const handleSitDown = (seatIndex: number) => {
  sitDown(seatIndex);
};

// 开始游戏
const handleStartGame = () => {
  startGame();
};

// 玩家操作（带验证）
const handleAction = (action: ActionType, amount?: number) => {
  // 验证是否轮到我
  if (!isMyTurn.value) {
    console.warn('[UI] 不是我的回合，忽略操作');
    return;
  }
  
  // 验证操作合法性
  switch (action) {
    case ActionType.CHECK:
      if (!canCheck.value) {
        console.warn('[UI] 不能过牌');
        return;
      }
      break;
    case ActionType.CALL:
      if (!canCall.value) {
        console.warn('[UI] 不能跟注');
        return;
      }
      break;
    case ActionType.RAISE:
      if (!canRaise.value || amount === undefined || amount < minRaise.value) {
        console.warn('[UI] 无效的加注金额');
        return;
      }
      break;
    case ActionType.ALL_IN:
      if (!canAllIn.value) {
        console.warn('[UI] 不能全押');
        return;
      }
      break;
  }
  
  playerAction(action, amount);
  raiseAmount.value = 0;
};

// 离开房间
const handleLeaveRoom = () => {
  leaveRoom();
  currentView.value = 'home';
};

// 获取座位上的玩家
const getPlayerAtSeat = (seatIndex: number) => {
  if (!room.value) return null;
  return room.value.players.find(p => p.seatIndex === seatIndex) || null;
};

// 获取牌的显示
const displayCard = (card: Card) => {
  return getCardDisplay(card);
};
</script>

<template>
  <div class="app">
    <!-- 连接状态 -->
    <div class="connection-status">
      <span v-if="isConnecting">🔄 连接中...</span>
      <span v-else-if="isConnected" class="connected">🟢 已连接</span>
      <span v-else class="disconnected">🔴 未连接</span>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-toast">
      ⚠️ {{ error }}
    </div>

    <!-- 首页 -->
    <div v-if="currentView === 'home'" class="home-page">
      <h1>🎰 Pocket Holdem</h1>
      <p class="subtitle">朋友局德州扑克</p>
      
      <div class="form-group">
        <input 
          v-model="nickname" 
          type="text" 
          placeholder="请输入昵称"
          class="input"
        />
      </div>

      <!-- 创建房间 -->
      <div v-if="!showJoinForm" class="actions">
        <button @click="handleCreateRoom" class="btn btn-primary" :disabled="!isConnected">
          创建房间
        </button>
        <button @click="showJoinForm = true" class="btn btn-secondary">
          加入房间
        </button>
      </div>

      <!-- 加入房间表单 -->
      <div v-else class="join-form">
        <input 
          v-model="roomIdInput" 
          type="text" 
          placeholder="请输入房间号"
          class="input"
        />
        <div class="actions">
          <button @click="handleJoinRoom" class="btn btn-primary" :disabled="!isConnected">
            加入
          </button>
          <button @click="showJoinForm = false" class="btn btn-secondary">
            返回
          </button>
        </div>
      </div>
    </div>

    <!-- 房间页面 -->
    <div v-else-if="currentView === 'room'" class="room-page">
      <div class="room-header">
        <h2>房间: {{ room?.id }}</h2>
        <button @click="handleLeaveRoom" class="btn btn-danger">离开</button>
      </div>

      <div class="room-info">
        <p>💰 初始筹码: {{ room?.config.initialChips }}</p>
        <p>🔹 小盲: {{ room?.config.smallBlind }} / 大盲: {{ room?.config.bigBlind }}</p>
        <p>👥 在线: {{ room?.players.length }} 人 | 入座: {{ seatedCount }} 人</p>
      </div>

      <!-- 座位 -->
      <div class="seats-grid">
        <div 
          v-for="seatIdx in 6" 
          :key="seatIdx - 1"
          class="seat"
          :class="{ 
            'seat-occupied': getPlayerAtSeat(seatIdx - 1),
            'seat-me': getPlayerAtSeat(seatIdx - 1)?.id === myPlayerId
          }"
          @click="!getPlayerAtSeat(seatIdx - 1) && !isSeated && handleSitDown(seatIdx - 1)"
        >
          <template v-if="getPlayerAtSeat(seatIdx - 1)">
            <div class="seat-player">
              <span class="player-name">{{ getPlayerAtSeat(seatIdx - 1)?.nickname }}</span>
              <span class="player-chips">{{ formatChips(getPlayerAtSeat(seatIdx - 1)?.chips || 0) }}</span>
              <span v-if="getPlayerAtSeat(seatIdx - 1)?.isHost" class="host-badge">👑</span>
            </div>
          </template>
          <template v-else>
            <div class="seat-empty">
              <span>座位 {{ seatIdx }}</span>
              <span v-if="!isSeated" class="click-hint">点击入座</span>
            </div>
          </template>
        </div>
      </div>

      <!-- 开始游戏按钮 -->
      <div v-if="isHost && seatedCount >= 2" class="start-game">
        <button @click="handleStartGame" class="btn btn-primary btn-large">
          开始游戏 🎮
        </button>
      </div>
      <div v-else-if="!isHost" class="waiting">
        等待房主开始游戏...
      </div>
      <div v-else class="waiting">
        至少需要 2 人入座才能开始
      </div>
    </div>

    <!-- 游戏页面 -->
    <div v-else-if="currentView === 'game'" class="game-page">
      <!-- 顶部信息 -->
      <div class="game-header">
        <span>房间: {{ room?.id }}</span>
        <span>阶段: {{ room?.gameState?.phase }}</span>
        <span>底池: {{ totalPot }}</span>
      </div>

      <!-- 公共牌 -->
      <div class="community-cards">
        <div class="cards-label">公共牌</div>
        <div class="cards-list">
          <template v-if="room?.gameState?.communityCards?.length">
            <div 
              v-for="(card, idx) in room.gameState.communityCards" 
              :key="idx"
              class="card"
              :class="{ 'card-red': displayCard(card).color === 'red' }"
            >
              {{ displayCard(card).symbol }}
            </div>
          </template>
          <template v-else>
            <div class="cards-placeholder">等待发牌...</div>
          </template>
        </div>
      </div>

      <!-- 玩家座位（环形布局） -->
      <div class="game-table">
        <div 
          v-for="seatIdx in 6" 
          :key="seatIdx - 1"
          class="table-seat"
          :class="[
            `seat-pos-${seatIdx - 1}`,
            {
              'seat-current': room?.gameState?.currentPlayerIndex === seatIdx - 1,
              'seat-me': getPlayerAtSeat(seatIdx - 1)?.id === myPlayerId,
              'seat-folded': getPlayerAtSeat(seatIdx - 1)?.isFolded,
              'seat-dealer': room?.gameState?.dealerIndex === seatIdx - 1
            }
          ]"
        >
          <template v-if="getPlayerAtSeat(seatIdx - 1)">
            <div class="table-player">
              <div class="player-info">
                <span class="player-name">{{ getPlayerAtSeat(seatIdx - 1)?.nickname }}</span>
                <span v-if="room?.gameState?.dealerIndex === seatIdx - 1" class="dealer-btn">D</span>
              </div>
              <div class="player-chips">{{ formatChips(getPlayerAtSeat(seatIdx - 1)?.chips || 0) }}</div>
              <div class="player-bet" v-if="getPlayerAtSeat(seatIdx - 1)?.currentBet">
                下注: {{ getPlayerAtSeat(seatIdx - 1)?.currentBet }}
              </div>
              <div class="player-status">
                <span v-if="getPlayerAtSeat(seatIdx - 1)?.isFolded">弃牌</span>
                <span v-else-if="getPlayerAtSeat(seatIdx - 1)?.isAllIn">ALL-IN</span>
                <span v-else-if="getPlayerAtSeat(seatIdx - 1)?.isCurrentTurn" class="current-turn">行动中</span>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="table-empty">空位</div>
          </template>
        </div>
      </div>

      <!-- 我的手牌 -->
      <div class="my-cards">
        <div class="cards-label">我的手牌</div>
        <div class="cards-list">
          <template v-if="myCards.length">
            <div 
              v-for="(card, idx) in myCards" 
              :key="idx"
              class="card card-large"
              :class="{ 'card-red': displayCard(card).color === 'red' }"
            >
              {{ displayCard(card).symbol }}
            </div>
          </template>
          <template v-else>
            <div class="cards-placeholder">无手牌</div>
          </template>
        </div>
      </div>

      <!-- 操作按钮（仅当轮到我时显示） -->
      <div class="action-panel" v-if="isMyTurn && !myPlayer?.isFolded">
        <div class="action-info">
          <span>💰 我的筹码: {{ myPlayer?.chips }}</span>
          <span v-if="callAmount > 0">📢 需跟注: {{ callAmount }}</span>
          <span class="turn-indicator">🎯 轮到你行动</span>
        </div>
        
        <div class="action-buttons">
          <!-- 弃牌（始终可用） -->
          <button @click="handleAction(ActionType.FOLD)" class="btn btn-fold">
            弃牌
          </button>
          
          <!-- 过牌 -->
          <button 
            v-if="canCheck" 
            @click="handleAction(ActionType.CHECK)" 
            class="btn btn-check"
          >
            过牌
          </button>
          
          <!-- 跟注 -->
          <button 
            v-if="canCall" 
            @click="handleAction(ActionType.CALL)" 
            class="btn btn-call"
          >
            跟注 {{ callAmount }}
          </button>
          
          <!-- 加注 -->
          <div class="raise-group" v-if="canRaise">
            <input 
              v-model.number="raiseAmount" 
              type="range"
              :min="minRaise"
              :max="maxRaise"
              class="raise-slider"
            />
            <span class="raise-value">{{ raiseAmount || minRaise }}</span>
            <button 
              @click="handleAction(ActionType.RAISE, raiseAmount || minRaise)" 
              class="btn btn-raise"
            >
              加注
            </button>
          </div>
          
          <!-- 全押 -->
          <button 
            v-if="canAllIn" 
            @click="handleAction(ActionType.ALL_IN)" 
            class="btn btn-allin"
          >
            ALL-IN {{ myPlayer?.chips }}
          </button>
        </div>
      </div>

      <!-- 等待提示 -->
      <div class="waiting-hint" v-else-if="!myPlayer?.isFolded">
        等待其他玩家行动...
      </div>
    </div>
  </div>
</template>

<style>
/* 基础样式 */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: #fff;
  min-height: 100vh;
}

.app {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

/* 连接状态 */
.connection-status {
  text-align: right;
  padding: 10px;
  font-size: 14px;
}
.connected { color: #4ade80; }
.disconnected { color: #ef4444; }

/* 错误提示 */
.error-toast {
  background: #ef4444;
  padding: 12px 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  text-align: center;
}

/* 按钮 */
.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
}
.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}
.btn-secondary {
  background: #374151;
  color: white;
}
.btn-danger {
  background: #ef4444;
  color: white;
}
.btn-large {
  padding: 16px 32px;
  font-size: 18px;
}

/* 输入框 */
.input {
  width: 100%;
  padding: 14px 18px;
  border: 2px solid #374151;
  border-radius: 8px;
  background: #1f2937;
  color: white;
  font-size: 16px;
}
.input:focus {
  outline: none;
  border-color: #6366f1;
}

/* 首页 */
.home-page {
  text-align: center;
  padding-top: 60px;
}
.home-page h1 {
  font-size: 48px;
  margin-bottom: 10px;
}
.subtitle {
  color: #9ca3af;
  margin-bottom: 40px;
}
.form-group {
  max-width: 300px;
  margin: 0 auto 20px;
}
.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 20px;
}
.join-form {
  max-width: 300px;
  margin: 0 auto;
}
.join-form .input {
  margin-bottom: 12px;
}

/* 房间页面 */
.room-page {
  padding-top: 20px;
}
.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.room-info {
  background: #1f2937;
  padding: 16px;
  border-radius: 12px;
  margin-bottom: 20px;
}
.room-info p {
  margin: 8px 0;
}

/* 座位网格 */
.seats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.seat {
  background: #1f2937;
  border: 2px solid #374151;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}
.seat:hover {
  border-color: #6366f1;
}
.seat-occupied {
  background: #374151;
  cursor: default;
}
.seat-me {
  border-color: #4ade80;
  box-shadow: 0 0 12px rgba(74, 222, 128, 0.3);
}
.seat-player {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.player-name {
  font-weight: bold;
  font-size: 16px;
}
.player-chips {
  color: #fbbf24;
}
.host-badge {
  font-size: 20px;
}
.seat-empty {
  color: #6b7280;
}
.click-hint {
  font-size: 12px;
  display: block;
  margin-top: 4px;
}
.start-game, .waiting {
  text-align: center;
  padding: 20px;
}

/* 游戏页面 */
.game-page {
  padding-top: 10px;
}
.game-header {
  display: flex;
  justify-content: space-between;
  background: #1f2937;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 14px;
}

/* 公共牌 */
.community-cards, .my-cards {
  text-align: center;
  margin-bottom: 20px;
}
.cards-label {
  color: #9ca3af;
  margin-bottom: 8px;
  font-size: 14px;
}
.cards-list {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.card {
  background: white;
  color: #1a1a2e;
  width: 50px;
  height: 70px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  box-shadow: 0 4px 8px rgba(0,0,0,0.3);
}
.card-large {
  width: 60px;
  height: 84px;
  font-size: 24px;
}
.card-red {
  color: #dc2626;
}
.cards-placeholder {
  color: #6b7280;
  font-style: italic;
}

/* 游戏桌座位 */
.game-table {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.table-seat {
  background: #1f2937;
  border: 2px solid #374151;
  border-radius: 10px;
  padding: 12px;
  text-align: center;
  font-size: 14px;
  transition: all 0.3s ease;
}
.seat-current {
  border-color: #fbbf24;
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.6);
  animation: pulse-current 1.5s infinite;
  background: linear-gradient(135deg, #1f2937 0%, #292d3e 100%);
}
@keyframes pulse-current {
  0%, 100% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.6); }
  50% { box-shadow: 0 0 30px rgba(251, 191, 36, 0.9); }
}
.seat-me {
  border-color: #4ade80;
}
.seat-folded {
  opacity: 0.5;
}
.table-player .player-info {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
}
.dealer-btn {
  background: #fbbf24;
  color: black;
  padding: 2px 6px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: bold;
}
.player-bet {
  color: #fbbf24;
  font-size: 12px;
}
.player-status {
  font-size: 12px;
  color: #9ca3af;
}
.current-turn {
  color: #4ade80;
  font-weight: bold;
  animation: blink 1s infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.table-empty {
  color: #6b7280;
}

/* 操作面板 */
.action-panel {
  background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
  border: 2px solid #4ade80;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 0 20px rgba(74, 222, 128, 0.3);
  animation: action-panel-glow 2s infinite;
}
@keyframes action-panel-glow {
  0%, 100% { box-shadow: 0 0 20px rgba(74, 222, 128, 0.3); }
  50% { box-shadow: 0 0 30px rgba(74, 222, 128, 0.5); }
}
.action-info {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
}
.turn-indicator {
  color: #4ade80;
  font-weight: bold;
  animation: blink 1s infinite;
}
.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.btn-fold { background: #6b7280; color: white; }
.btn-fold:hover { background: #4b5563; }
.btn-check { background: #3b82f6; color: white; }
.btn-check:hover { background: #2563eb; }
.btn-call { background: #10b981; color: white; }
.btn-call:hover { background: #059669; }
.btn-raise { background: #8b5cf6; color: white; }
.btn-raise:hover { background: #7c3aed; }
.btn-allin { background: linear-gradient(135deg, #ef4444, #f97316); color: white; }
.btn-allin:hover { transform: scale(1.05); }

.raise-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.raise-slider {
  width: 100px;
}
.raise-value {
  min-width: 50px;
  text-align: center;
  color: #fbbf24;
  font-weight: bold;
}

.waiting-hint {
  text-align: center;
  color: #9ca3af;
  padding: 20px;
  font-style: italic;
}
</style>

