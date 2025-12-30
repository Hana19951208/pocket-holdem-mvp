<script setup lang="ts">
/**
 * App.vue - 应用主入口
 * 
 * 实现简单的路由逻辑：
 * - home: 首页（创建/加入房间）
 * - room: 房间（座位、准备）
 * - game: 游戏（对局）
 */
import { ref, computed, watch, onUnmounted } from 'vue';
import { useSocket } from './composables/useSocket';
import { ActionType, formatChips, GamePhase } from './types';
import CardDisplay from './components/CardDisplay.vue';

// 使用 Socket 连接
const { 
  isConnected, 
  isConnecting, 
  room, 
  myPlayerId, 
  myCards, 
  error,
  // 新增：倒计时与 Showdown 状态
  turnTimeout,
  handResult,
  isShowdown,
  createRoom, 
  joinRoom, 
  sitDown, 
  startGame, 
  playerAction,
  playerReady,  // 新增
  kickPlayer,
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

// 倒计时状态
const remainingSeconds = ref(0);
let countdownInterval: ReturnType<typeof setInterval> | null = null;

// 监听 turnTimeout 变化，启动倒计时
watch(() => turnTimeout.value, (newTimeout) => {
  // 清理旧的定时器
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  
  if (!newTimeout || newTimeout <= 0) {
    remainingSeconds.value = 0;
    return;
  }
  
  // 启动新的倒计时
  const updateCountdown = () => {
    const now = Date.now();
    remainingSeconds.value = Math.max(0, Math.ceil((newTimeout - now) / 1000));
    if (remainingSeconds.value <= 0 && countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  };
  
  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 100);
}, { immediate: true });

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

// 获取玩家昵称（用于 Showdown 展示）
const getPlayerNickname = (playerId: string) => {
  const player = room.value?.players.find(p => p.id === playerId);
  return player?.nickname || '未知玩家';
};

// 关闭 Showdown 弹窗（新增）
const closeShowdown = () => {
  isShowdown.value = false;
  // 自动发送 Ready
  playerReady();
};

// 判断游戏是否结束（等待准备中）（新增）
const isGameEnded = computed(() => {
  return room.value?.gameState?.phase === GamePhase.IDLE && !room.value?.isPlaying;
});

// 我的 Ready 状态（新增）
const myReadyStatus = computed(() => {
  return myPlayer.value?.isReady ?? false;
});

// 所有入座玩家是否都准备好（新增）
const allPlayersReady = computed(() => {
  if (!room.value) return false;
  const seatedPlayers = room.value.players.filter(p => p.seatIndex !== null);
  return seatedPlayers.length >= 2 && seatedPlayers.every(p => p.isReady);
});

// 所有非房主玩家是否都准备好（房间页用，房主不需要准备）
const allSeatedPlayersReadyExceptHost = computed(() => {
  if (!room.value) return false;
  const seatedPlayers = room.value.players.filter(p => p.seatIndex !== null);
  if (seatedPlayers.length < 2) return false;
  // 房主不检查 Ready，其他人都要 Ready
  const nonHostSeated = seatedPlayers.filter(p => !p.isHost);
  return nonHostSeated.every(p => p.isReady);
});

// 处理 Ready 按钮点击（新增）
const handleReady = () => {
  playerReady();
};

// Debug 面板状态（新增）
const showDebugPanel = ref(false);

// 清理本地数据（新增）
const clearLocalData = () => {
  localStorage.clear();
  sessionStorage.clear();
  alert('已清理本地存储，请刷新页面');
  window.location.reload();
};

// 组件卸载时清理定时器
onUnmounted(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
});
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
              <!-- 踢人按钮：仅房主可见，且不能踢自己，且不在游戏中 -->
              <button 
                v-if="isHost && !room?.isPlaying && getPlayerAtSeat(seatIdx - 1)?.id !== myPlayerId"
                class="kick-btn"
                @click.stop="kickPlayer(getPlayerAtSeat(seatIdx - 1)?.id || '')"
                title="踢出玩家"
              >
                👢
              </button>
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

      <!-- 开始游戏按钮（修改：需要所有玩家 Ready） -->
      <div v-if="isHost && seatedCount >= 2" class="start-game">
        <button 
          @click="handleStartGame" 
          class="btn btn-primary btn-large"
          :disabled="!allSeatedPlayersReadyExceptHost"
        >
          开始游戏 🎮
        </button>
        <p v-if="!allSeatedPlayersReadyExceptHost" class="ready-hint-text">
          等待所有玩家准备...
        </p>
      </div>
      <!-- 非房主玩家 Ready 状态 -->
      <div v-else-if="!isHost && isSeated" class="ready-section">
        <div class="ready-players-room">
          <div 
            v-for="player in room?.players.filter((p: any) => p.seatIndex !== null)" 
            :key="player.id" 
            class="ready-player-badge"
            :class="{ 'ready-yes': player.isReady || player.isHost, 'ready-no': !player.isReady && !player.isHost }"
          >
            <span>{{ player.nickname }}</span>
            <span v-if="player.isHost">👑</span>
            <span v-else-if="player.isReady">✅</span>
            <span v-else>⏳</span>
          </div>
        </div>
        <button 
          v-if="!myReadyStatus" 
          class="btn btn-primary" 
          @click="handleReady"
        >
          我准备好了 ✅
        </button>
        <span v-else class="ready-done">✅ 已准备，等待房主开始</span>
      </div>
      <div v-else-if="!isHost && !isSeated" class="waiting">
        请先入座
      </div>
      <div v-else class="waiting">
        至少需要 2 人入座才能开始
      </div>
    </div>

    <!-- 游戏页面 -->
    <div v-else-if="currentView === 'game'" class="game-page">
      <!-- 顶部信息 -->
      <div class="game-header">
        <span class="player-name">🎮 {{ myPlayer?.nickname || '未知玩家' }}</span>
        <span>房间: {{ room?.id }}</span>
        <span>阶段: {{ room?.gameState?.phase }}</span>
        <span>底池: {{ totalPot }}</span>
      </div>

      <!-- 公共牌 -->
      <div class="community-cards">
        <div class="cards-label">公共牌</div>
        <div class="cards-list">
          <template v-if="room?.gameState?.communityCards?.length">
            <CardDisplay
              v-for="(card, idx) in room.gameState.communityCards"
              :key="idx"
              :card="card"
              size="medium"
            />
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
                <!-- 庄位/盲注徽章 -->
                <span v-if="room?.gameState?.dealerIndex === seatIdx - 1" class="dealer-btn">D</span>
                <span v-if="room?.gameState?.smallBlindIndex === seatIdx - 1" class="blind-badge sb-badge">SB</span>
                <span v-if="room?.gameState?.bigBlindIndex === seatIdx - 1" class="blind-badge bb-badge">BB</span>
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
            <CardDisplay
              v-for="(card, idx) in myCards"
              :key="idx"
              :card="card"
              size="large"
            />
          </template>
          <template v-else>
            <div class="cards-placeholder">无手牌</div>
          </template>
        </div>
      </div>

      <!-- 操作面板 (仅当轮到我时显示) -->
      <div 
        class="action-panel" 
        v-if="isMyTurn && !myPlayer?.isFolded"
        :key="`action-${room?.gameState?.stateVersion}`"
      >
        <!-- 倒计时进度条 -->
        <div class="countdown-bar" v-if="remainingSeconds > 0">
          <div 
            class="countdown-progress" 
            :style="{ width: `${(remainingSeconds / 30) * 100}%` }"
            :class="{ 'countdown-danger': remainingSeconds <= 5 }"
          />
          <span class="countdown-text">{{ remainingSeconds }}s</span>
        </div>
        
        <div class="action-info">
          <span>💰 我的筹码: {{ myPlayer?.chips }}</span>
          <span v-if="callAmount > 0">📢 需跟注: {{ callAmount }}</span>
          <span class="turn-indicator">🎯 轮到你行动</span>
        </div>

        <!-- 加注调整区 (仅当可以加注时显示) -->
        <div class="raise-area" v-if="canRaise">
          <div class="raise-slider-container">
            <input 
              v-model.number="raiseAmount" 
              type="range"
              :min="minRaise"
              :max="maxRaise"
              class="raise-slider"
            />
            <div class="raise-value-display">{{ raiseAmount || minRaise }}</div>
          </div>
        </div>
        
        <div class="action-buttons-grid">
          <!-- 弃牌 -->
          <button @click="handleAction(ActionType.FOLD)" class="action-btn btn-fold">
            弃牌
          </button>
          
          <!-- 过牌 -->
          <button 
            v-if="canCheck" 
            @click="handleAction(ActionType.CHECK)" 
            class="action-btn btn-check"
          >
            过牌
          </button>
          
          <!-- 跟注 -->
          <button 
            v-if="canCall" 
            @click="handleAction(ActionType.CALL)" 
            class="action-btn btn-call"
          >
            跟注 {{ callAmount }}
          </button>
          
          <!-- 加注按钮 -->
          <button 
            v-if="canRaise"
            @click="handleAction(ActionType.RAISE, raiseAmount || minRaise)" 
            class="action-btn btn-raise"
          >
            加注
          </button>
          
          <!-- 全押 -->
          <button 
            v-if="canAllIn" 
            @click="handleAction(ActionType.ALL_IN)" 
            class="action-btn btn-allin"
          >
            ALL-IN {{ myPlayer?.chips }}
          </button>
        </div>
      </div>

      <!-- 等待提示 -->
      <div class="waiting-hint" v-else-if="!myPlayer?.isFolded && !isShowdown">
        等待其他玩家行动...
      </div>

      <!-- Showdown moved to global scope -->

      <!-- Ready 面板（新增） -->
      <div class="ready-panel" v-if="isGameEnded && !isShowdown">
        <h3 class="ready-title">🎯 等待下一局</h3>
        <div class="ready-players">
          <div 
            v-for="player in room?.players.filter((p: any) => p.seatIndex !== null)" 
            :key="player.id" 
            class="ready-player"
            :class="{ 'ready-yes': player.isReady, 'ready-no': !player.isReady }"
          >
            <span class="ready-player-name">{{ player.nickname }}</span>
            <span class="ready-status">{{ player.isReady ? '✅ 已准备' : '⏳ 未准备' }}</span>
          </div>
        </div>
        <div class="ready-actions">
          <button 
            v-if="!myReadyStatus" 
            class="btn btn-primary" 
            @click="handleReady"
          >
            我准备好了
          </button>
          <span v-else class="ready-done">✅ 你已准备</span>
        </div>
        <div class="ready-hint" v-if="isHost">
          <button 
            v-if="allPlayersReady" 
            class="btn btn-primary btn-large" 
            @click="startGame"
          >
            开始下一局 🎮
          </button>
          <span v-else class="waiting-text">等待所有玩家准备...</span>
        </div>
      </div>
    </div>

    <!-- Debug 按钮（全局） -->
    <button class="debug-btn" @click="showDebugPanel = !showDebugPanel">
      🐛
    </button>

    <!-- Debug 面板（全局） -->
    <div class="debug-panel" v-if="showDebugPanel">
      <h4>调试面板</h4>
      <div class="debug-info">
        <p>View: {{ currentView }}</p>
        <p>Phase: {{ room?.gameState?.phase || 'IDLE' }}</p>
        <p>Version: {{ room?.gameState?.stateVersion || 0 }}</p>
        <p>isPlaying: {{ room?.isPlaying }}</p>
        <p>myPlayerId: {{ myPlayerId?.slice(0, 8) }}...</p>
      </div>
      <div class="debug-actions">
        <button class="btn btn-danger" @click="clearLocalData">
          清理本地数据
        </button>
      </div>
    </div>

    <!-- Showdown 结算展示 (全局覆盖) -->
    <div class="showdown-overlay" v-if="isShowdown && handResult">
      <div class="showdown-modal">
        <h2 class="showdown-title">🎉 本局结算</h2>
        
        <!-- 赢家展示 -->
        <div class="winner-section">
          <div
            v-for="winner in handResult.winners"
            :key="winner.playerId"
            class="winner-card"
          >
            <span class="winner-name">{{ getPlayerNickname(winner.playerId) }}</span>
            <span class="winner-hand">{{ winner.handRank || '赢家' }}</span>
            <span class="winner-amount">+{{ winner.amount }}</span>
          </div>
        </div>

        <!-- 公共牌展示 -->
        <div class="showdown-community" v-if="room?.gameState?.communityCards?.length">
          <div class="showdown-community-label">公共牌</div>
          <div class="showdown-community-cards">
            <CardDisplay
              v-for="(card, idx) in room.gameState.communityCards"
              :key="`comm-${idx}`"
              :card="card"
              size="small"
            />
          </div>
        </div>

        <!-- 所有亮牌 -->
        <div class="showdown-cards" v-if="handResult.showdownCards.length > 0">
          <div
            v-for="player in handResult.showdownCards"
            :key="player.playerId"
            class="player-showdown"
          >
            <span class="player-showdown-name">{{ getPlayerNickname(player.playerId) }}</span>
            <div class="cards-row">
              <CardDisplay
                v-for="(card, idx) in player.cards"
                :key="idx"
                :card="card"
                size="small"
              />
            </div>
          </div>
        </div>
        
        <!-- 修改：改为手动关闭按钮 -->
        <button class="btn btn-primary showdown-close-btn" @click="closeShowdown">
          知道了，准备下一局
        </button>
      </div>
    </div>
  </div>
</template>

<style>
/* ========================================
   移动端优先的响应式基础样式
   ======================================== */

/* CSS 变量定义 */
:root {
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 20px;
  --spacing-2xl: 24px;

  --font-size-xs: 0.7rem;
  --font-size-sm: 0.8rem;
  --font-size-md: 0.9rem;
  --font-size-lg: 1rem;
  --font-size-xl: 1.1rem;
  --font-size-2xl: 1.25rem;

  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
}

/* 大屏幕变量覆盖 */
@media (min-width: 430px) {
  :root {
    --font-size-xs: 0.75rem;
    --font-size-sm: 0.875rem;
    --font-size-md: 1rem;
    --font-size-lg: 1.125rem;
    --font-size-xl: 1.25rem;
    --font-size-2xl: 1.5rem;
  }
}

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
  /* 移动端优化：移除 flex 居中，使用自然流 */
  display: block;
}

.app {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  /* 响应式 padding */
  padding: var(--spacing-md);
  padding-top: calc(var(--spacing-md) + var(--safe-area-top));
  padding-bottom: calc(var(--spacing-md) + var(--safe-area-bottom));
  padding-left: calc(var(--spacing-md) + var(--safe-area-left));
  padding-right: calc(var(--spacing-md) + var(--safe-area-right));
  min-height: 100vh;
  box-sizing: border-box;
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

/* ========================================
   按钮 - 响应式设计
   ======================================== */
.btn {
  /* 响应式 padding */
  padding: 12px var(--spacing-lg);
  border: none;
  border-radius: 8px;
  font-size: var(--font-size-md);
  cursor: pointer;
  transition: all 0.2s;
  /* 最小触摸区域 */
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

/* 踢人按钮样式 */
.kick-btn {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  margin-left: 4px;
  transition: transform 0.1s;
}
.kick-btn:hover {
  transform: scale(1.2);
}
.btn-large {
  padding: 16px 32px;
  font-size: 18px;
}

/* ========================================
   输入框 - 响应式设计
   ======================================== */
.input {
  width: 100%;
  padding: 14px var(--spacing-lg);
  border: 2px solid #374151;
  border-radius: 8px;
  background: #1f2937;
  color: white;
  font-size: var(--font-size-md);
  /* 移动端优化：防止缩放 */
  font-size: 16px;
}

.input:focus {
  outline: none;
  border-color: #6366f1;
}

/* ========================================
   首页 - 响应式布局
   ======================================== */
.home-page {
  text-align: center;
  padding-top: 10vh;
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.home-page h1 {
  font-size: clamp(28px, 8vw, 48px);
  margin-bottom: var(--spacing-sm);
}
.subtitle {
  color: #9ca3af;
  margin-bottom: var(--spacing-2xl);
  font-size: var(--font-size-md);
}

.form-group {
  max-width: 300px;
  margin: 0 auto var(--spacing-lg);
}

.actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: center;
  margin-top: var(--spacing-lg);
  flex-wrap: wrap;
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

/* ========================================
   座位网格 - 响应式布局
   ======================================== */
.seats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-2xl);
}

/* 小屏幕优化为 2 列 */
@media (max-width: 380px) {
  .seats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.seat {
  background: #1f2937;
  border: 2px solid #374151;
  border-radius: 12px;
  padding: var(--spacing-lg);
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  justify-content: center;
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

/* ========================================
   游戏页面 - 响应式布局
   ======================================== */
.game-page {
  padding-top: var(--spacing-sm);
  padding-bottom: 180px; /* 为底部操作面板留空间 */
}

.game-header {
  display: flex;
  justify-content: space-between;
  background: #1f2937;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: 8px;
  margin-bottom: var(--spacing-lg);
  font-size: var(--font-size-xs);
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}

.game-header .player-name {
  color: #4ade80;
  font-weight: bold;
  font-size: var(--font-size-sm);
}

/* ========================================
   扑克牌容器 - 响应式布局
   ======================================== */
.community-cards,
.my-cards {
  text-align: center;
  margin-bottom: var(--spacing-lg);
}

.cards-label {
  color: #9ca3af;
  margin-bottom: var(--spacing-sm);
  font-size: var(--font-size-sm);
}

.cards-list {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: center;
  flex-wrap: wrap;
}

.cards-placeholder {
  color: #6b7280;
  font-style: italic;
}

/* ========================================
   游戏桌座位 - 移动端优化
   ======================================== */
.game-table {
  display: grid;
  /* 响应式列数：小屏2列，大屏3列 */
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.table-seat {
  background: #1f2937;
  border: 2px solid #374151;
  border-radius: 10px;
  padding: var(--spacing-sm);
  text-align: center;
  font-size: var(--font-size-xs);
  transition: all 0.3s ease;
  min-height: 70px;
  display: flex;
  flex-direction: column;
  justify-content: center;
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
  gap: 4px;
  flex-wrap: wrap;
}

.table-seat .player-name {
  font-size: var(--font-size-xs);
  font-weight: bold;
}

.dealer-btn {
  background: #fbbf24;
  color: black;
  padding: 2px 4px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: bold;
}
/* 盲注徽章样式 */
.blind-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: bold;
}
.sb-badge {
  background: #60a5fa;
  color: white;
}
.bb-badge {
  background: #f472b6;
  color: white;
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

/* ========================================
   操作面板 - 移动端优化
   ======================================== */
.action-panel {
  background: rgba(31, 41, 55, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(74, 222, 128, 0.4);
  border-radius: 20px;
  padding: var(--spacing-lg);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  margin-bottom: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.action-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--font-size-sm);
  color: #9ca3af;
}

.turn-indicator {
  color: #4ade80;
  font-weight: bold;
  animation: blink 1.5s infinite;
}

/* 操作按钮容器 */
.action-buttons-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);
}

/* 加注区域 - 顶部满宽 */
.raise-area {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: var(--spacing-sm);
}

.raise-slider-container {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.raise-slider {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  appearance: none;
  cursor: pointer;
}

.raise-slider::-webkit-slider-thumb {
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #8b5cf6;
  border: 2px solid white;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  cursor: pointer;
}

.raise-value-display {
  min-width: 60px;
  text-align: right;
  color: #fbbf24;
  font-weight: 800;
  font-size: var(--font-size-lg);
}

/* 统一按钮样式 */
.action-btn {
  height: 50px;
  border-radius: 14px;
  font-weight: 700;
  font-size: var(--font-size-md);
  border: none;
  transition: transform 0.1s, opacity 0.2s;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px; /* 增加内边距 */
  white-space: nowrap; /* 不换行 */
  overflow: hidden; /* 溢出隐藏 */
  text-overflow: ellipsis; /* 溢出显示省略号 */
}

/* 针对移动端长文本，稍微缩小字体 */
@media (max-width: 400px) {
  .action-btn {
    font-size: 13px;
  }
}

.action-btn:active {
  transform: scale(0.96);
}

.btn-fold { background: #4b5563; }
.btn-check { background: #3b82f6; }
.btn-call { background: #10b981; }
.btn-raise { background: #8b5cf6; }
.btn-allin { 
  background: linear-gradient(135deg, #ef4444, #f97316);
  /* 移除 grid-column: span 2，让它和加注并排 */
}

/* 如果只有三个按钮（加注不可用），全押占满一整行以保持平衡 */
/* 只有当全押是第 3 个且是最后一个时才 span 2 */
.action-buttons-grid > .btn-allin:nth-child(3):last-child {
  grid-column: span 2;
}

.waiting-hint {
  text-align: center;
  color: #9ca3af;
  padding: 20px;
  font-style: italic;
}

/* ========================================
   倒计时进度条 - 响应式
   ======================================== */
.countdown-bar {
  height: 10px; /* 增加高度 */
  background: #374151;
  border-radius: 5px;
  overflow: hidden;
  position: relative;
  margin-bottom: var(--spacing-md);
}

.countdown-progress {
  height: 100%;
  background: linear-gradient(90deg, #4ade80, #22c55e);
  transition: width 0.1s linear;
  border-radius: 5px;
}

.countdown-danger {
  background: linear-gradient(90deg, #ef4444, #dc2626) !important;
  animation: pulse-danger 0.5s infinite;
}

@keyframes pulse-danger {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.countdown-text {
  position: absolute;
  right: var(--spacing-sm);
  top: 50%;
  transform: translateY(-50%);
  font-size: var(--font-size-xs);
  font-weight: bold;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

/* ========================================
   Showdown 弹窗 - 移动端优化
   ======================================== */
.showdown-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
  /* 移动端优化：支持滚动 */
  overflow-y: auto;
  padding: var(--spacing-md);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.showdown-modal {
  background: linear-gradient(135deg, #1f2937, #111827);
  padding: var(--spacing-2xl);
  padding-top: calc(var(--spacing-2xl) + var(--safe-area-top));
  padding-bottom: calc(var(--spacing-2xl) + var(--safe-area-bottom));
  border-radius: 16px;
  text-align: center;
  max-width: 90%;
  min-width: 280px;
  border: 2px solid #fbbf24;
  box-shadow: 0 0 40px rgba(251, 191, 36, 0.3);
  animation: slideUp 0.3s ease;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.showdown-title {
  font-size: clamp(20px, 5vw, 28px);
  margin-bottom: var(--spacing-lg);
  color: #fbbf24;
}

.winner-section {
  margin-bottom: var(--spacing-lg);
}

.showdown-community {
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-md);
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
}

.showdown-community-label {
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: var(--spacing-sm);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.showdown-community-cards {
  display: flex;
  gap: var(--spacing-xs);
  justify-content: center;
  flex-wrap: wrap;
}

.winner-card {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #1a1a2e;
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: 12px;
  margin-bottom: var(--spacing-md);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-sm);
  animation: winnerPop 0.5s ease;
  flex-wrap: wrap;
}
@keyframes winnerPop {
  0% { transform: scale(0.8); opacity: 0; }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}
.winner-name {
  font-weight: bold;
  font-size: var(--font-size-lg);
}

.winner-hand {
  font-size: var(--font-size-sm);
  opacity: 0.8;
}

.winner-amount {
  font-size: var(--font-size-xl);
  font-weight: bold;
  color: #166534;
}
.showdown-cards {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-lg);
  border-top: 1px solid #374151;
}

.player-showdown {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  flex-wrap: wrap;
}

.player-showdown-name {
  min-width: 60px;
  text-align: right;
  font-weight: 500;
  color: #9ca3af;
  font-size: var(--font-size-sm);
}

.cards-row {
  display: flex;
  gap: 4px;
}
.next-round-hint {
  margin-top: 20px;
  color: #9ca3af;
  font-style: italic;
  animation: blink 1.5s infinite;
}

/* Showdown 关闭按钮 */
.showdown-close-btn {
  margin-top: 20px;
  width: 100%;
}

/* ========================================
   Ready 面板 - 移动端优化
   ======================================== */
.ready-panel {
  background: rgba(31, 41, 55, 0.95);
  border-radius: 16px;
  padding: var(--spacing-2xl);
  margin: var(--spacing-lg) auto;
  max-width: 400px;
  text-align: center;
}

.ready-title {
  font-size: var(--font-size-xl);
  margin-bottom: var(--spacing-lg);
}
.ready-players {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.ready-player {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: 8px;
  background: #374151;
  font-size: var(--font-size-sm);
}
.ready-yes {
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid #22c55e;
}
.ready-no {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid #6b7280;
}
.ready-player-name {
  font-weight: 600;
}
.ready-status {
  color: #9ca3af;
}
.ready-actions {
  margin-bottom: 16px;
}
.ready-done {
  color: #22c55e;
  font-weight: 600;
}
.ready-hint {
  margin-top: 16px;
}
.waiting-text {
  color: #9ca3af;
  font-style: italic;
}

/* ========================================
   Debug 按钮和面板 - 移动端优化
   ======================================== */
.debug-btn {
  position: fixed;
  bottom: calc(20px + var(--safe-area-bottom));
  right: 20px;
  width: 44px; /* 增加触摸区域 */
  height: 44px;
  border-radius: 50%;
  border: none;
  background: #374151;
  font-size: 20px;
  cursor: pointer;
  z-index: 1000;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.debug-btn:hover {
  opacity: 1;
}

.debug-panel {
  position: fixed;
  bottom: calc(70px + var(--safe-area-bottom));
  right: 20px;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: var(--spacing-md);
  min-width: 180px;
  max-width: 280px;
  z-index: 1000;
  font-size: var(--font-size-xs);
}
.debug-panel h4 {
  margin-bottom: 12px;
  font-size: 14px;
  color: #9ca3af;
}
.debug-info {
  font-size: 12px;
  font-family: monospace;
  margin-bottom: 12px;
}
.debug-info p {
  margin-bottom: 4px;
  color: #6b7280;
}
.debug-actions button {
  width: 100%;
  font-size: 12px;
}

/* ========================================
   房间页 Ready 样式 - 移动端优化
   ======================================== */
.ready-section {
  text-align: center;
  padding: var(--spacing-lg);
}

.ready-players-room {
  display: flex;
  justify-content: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
  flex-wrap: wrap;
}

.ready-player-badge {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: 20px;
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: var(--font-size-sm);
}
.ready-player-badge.ready-yes {
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid #22c55e;
}
.ready-player-badge.ready-no {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid #6b7280;
}
.ready-hint-text {
  color: #9ca3af;
  font-size: 14px;
  margin-top: 10px;
}
</style>


