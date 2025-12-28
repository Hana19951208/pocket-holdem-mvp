<!--
  PlayerSeat.vue - 玩家座位组件
  
  显示单个玩家的信息：头像、昵称、筹码、状态指示器。
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { PublicPlayerInfo } from '../types';
import { PlayerStatus, formatChips } from '../types';

interface Props {
  player: PublicPlayerInfo;
  isMe?: boolean;
}

const props = defineProps<Props>();

/** 状态样式映射 */
const statusClass = computed(() => {
  switch (props.player.status) {
    case PlayerStatus.ACTIVE:
      return props.player.isCurrentTurn ? 'status-turn' : 'status-active';
    case PlayerStatus.FOLDED:
      return 'status-folded';
    case PlayerStatus.ALL_IN:
      return 'status-allin';
    case PlayerStatus.ELIMINATED:
      return 'status-eliminated';
    case PlayerStatus.WAITING:
      return 'status-waiting';
    default:
      return '';
  }
});

/** 状态文字 */
const statusText = computed(() => {
  if (props.player.isCurrentTurn) return '行动中';
  switch (props.player.status) {
    case PlayerStatus.FOLDED:
      return '已弃牌';
    case PlayerStatus.ALL_IN:
      return 'ALL IN';
    case PlayerStatus.ELIMINATED:
      return '已淘汰';
    case PlayerStatus.WAITING:
      return '等待中';
    default:
      return '';
  }
});

/** 头像首字母 */
const avatarLetter = computed(() => {
  return props.player.nickname.charAt(0).toUpperCase();
});
</script>

<template>
  <div 
    class="player-seat"
    :class="[
      statusClass,
      { 'is-me': isMe, 'is-dealer': player.isDealer }
    ]"
  >
    <!-- 庄家标记 -->
    <div class="dealer-button" v-if="player.isDealer">D</div>
    
    <!-- 头像 -->
    <div class="avatar">
      <span class="avatar-letter">{{ avatarLetter }}</span>
      <!-- 断线指示器 -->
      <div class="disconnected-indicator" v-if="false" title="已断线">
        ⚡
      </div>
    </div>
    
    <!-- 玩家信息 -->
    <div class="player-info">
      <div class="nickname" :class="{ 'is-host': player.isHost }">
        {{ player.nickname }}
        <span class="host-badge" v-if="player.isHost">房主</span>
      </div>
      <div class="chips">
        {{ formatChips(player.chips) }}
      </div>
    </div>
    
    <!-- 状态指示器 -->
    <div class="status-indicator" v-if="statusText">
      {{ statusText }}
    </div>
    
    <!-- 当前下注额 -->
    <div class="current-bet" v-if="player.currentBet > 0">
      {{ formatChips(player.currentBet) }}
    </div>
  </div>
</template>

<style scoped>
.player-seat {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  min-width: 64px;
  transition: all 0.2s ease;
}

.player-seat.is-me {
  background: rgba(59, 130, 246, 0.3);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
}

.player-seat.status-turn {
  background: rgba(234, 179, 8, 0.3);
  box-shadow: 0 0 0 2px #eab308, 0 0 20px rgba(234, 179, 8, 0.4);
  animation: pulse-glow 1.5s ease-in-out infinite;
}

.player-seat.status-folded {
  opacity: 0.5;
}

.player-seat.status-allin {
  background: rgba(239, 68, 68, 0.3);
  box-shadow: 0 0 0 2px #ef4444;
}

.player-seat.status-eliminated {
  opacity: 0.4;
  filter: grayscale(0.8);
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 2px #eab308, 0 0 20px rgba(234, 179, 8, 0.4); }
  50% { box-shadow: 0 0 0 3px #eab308, 0 0 30px rgba(234, 179, 8, 0.6); }
}

.dealer-button {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 800;
  color: #000;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.avatar {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.avatar-letter {
  font-size: 1rem;
  font-weight: 700;
  color: white;
}

.disconnected-indicator {
  position: absolute;
  bottom: -2px;
  right: -2px;
  font-size: 0.6rem;
}

.player-info {
  text-align: center;
}

.nickname {
  font-size: 0.7rem;
  font-weight: 600;
  color: white;
  white-space: nowrap;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.host-badge {
  font-size: 0.5rem;
  background: #ffd700;
  color: #000;
  padding: 1px 4px;
  border-radius: 4px;
  margin-left: 2px;
  vertical-align: middle;
}

.chips {
  font-size: 0.75rem;
  font-weight: 700;
  color: #4ade80;
}

.status-indicator {
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.55rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.8);
  color: rgba(255, 255, 255, 0.8);
}

.status-turn .status-indicator {
  background: #eab308;
  color: #000;
}

.status-allin .status-indicator {
  background: #ef4444;
  color: white;
}

.current-bet {
  position: absolute;
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: #ffd700;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
</style>
