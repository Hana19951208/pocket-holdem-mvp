<!--
  PokerTable.vue - 牌桌组件
  
  负责渲染椭圆形牌桌、座位布局和公共牌区域。
  采用响应式设计，竖屏优先。
-->

<script setup lang="ts">
import { computed } from 'vue';
import PlayerSeat from './PlayerSeat.vue';
import CardDisplay from './CardDisplay.vue';
import type { PublicPlayerInfo, Card } from '../types';
import { formatChips } from '../types';

interface Props {
  /** 座位列表（索引 -> 玩家） */
  seatMap: Map<number, PublicPlayerInfo>;
  /** 最大座位数 */
  maxSeats: number;
  /** 公共牌 */
  communityCards: Card[];
  /** 底池总额 */
  totalPot: number;
  /** 游戏阶段名称 */
  phaseName?: string;
  /** 我的座位索引（用于高亮） */
  mySeatIndex?: number | null;
  /** 是否允许入座 */
  canSit: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'sit', seatIndex: number): void;
}>();

/**
 * 计算座位位置（椭圆布局）
 * 座位按顺时针排列，0 号位在底部中央
 */
const seatPositions = computed(() => {
  const positions = [];
  const total = props.maxSeats;
  
  for (let i = 0; i < total; i++) {
    // 从底部开始顺时针排列
    // 角度：从 90° 开始（底部），顺时针递减
    const angle = (90 - (i * 360) / total) * (Math.PI / 180);
    
    // 椭圆参数（百分比）
    const rx = 42; // 水平半径
    const ry = 38; // 垂直半径
    
    const x = 50 + rx * Math.cos(angle);
    const y = 50 - ry * Math.sin(angle);
    
    positions.push({
      index: i,
      x: `${x}%`,
      y: `${y}%`,
      player: props.seatMap.get(i) || null
    });
  }
  
  return positions;
});

/**
 * 处理座位点击
 */
const handleSeatClick = (seatIndex: number) => {
  if (props.canSit && !props.seatMap.has(seatIndex)) {
    emit('sit', seatIndex);
  }
};
</script>

<template>
  <div class="poker-table">
    <!-- 牌桌背景 -->
    <div class="table-surface">
      <!-- 公共牌区域 -->
      <div class="community-area">
        <div class="phase-label" v-if="phaseName">
          {{ phaseName }}
        </div>
        <div class="community-cards">
          <CardDisplay 
            v-for="(card, index) in communityCards" 
            :key="`${card.suit}-${card.rank}-${index}`"
            :card="card"
            size="medium"
          />
          <!-- 占位符（未发的公共牌位置） -->
          <div 
            v-for="i in (5 - communityCards.length)" 
            :key="`placeholder-${i}`"
            class="card-placeholder"
          />
        </div>
        <!-- 底池显示 -->
        <div class="pot-display" v-if="totalPot > 0">
          <span class="pot-label">底池</span>
          <span class="pot-amount">{{ formatChips(totalPot) }}</span>
        </div>
      </div>
    </div>
    
    <!-- 座位层 -->
    <div class="seats-layer">
      <div
        v-for="seat in seatPositions"
        :key="seat.index"
        class="seat-wrapper"
        :style="{ left: seat.x, top: seat.y }"
      >
        <PlayerSeat
          v-if="seat.player"
          :player="seat.player"
          :isMe="seat.index === mySeatIndex"
        />
        <!-- 空座位 -->
        <button
          v-else
          class="empty-seat"
          :class="{ 'can-sit': canSit }"
          @click="handleSeatClick(seat.index)"
          :disabled="!canSit"
        >
          <span class="seat-number">{{ seat.index + 1 }}</span>
          <span class="sit-label" v-if="canSit">点击入座</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========================================
   响应式牌桌布局
   ======================================== */
.poker-table {
  position: relative;
  width: 100%;
  /* 响应式宽高比 */
  padding-bottom: min(90%, 85vh);
  max-width: 500px;
  margin: 0 auto;
}

/* 大屏幕优化 */
@media (min-width: 430px) {
  .poker-table {
    max-width: 600px;
  }
}

.table-surface {
  position: absolute;
  /* 响应式边距 */
  top: max(12%, var(--safe-area-top, 0px) + 2%);
  left: 8%;
  right: 8%;
  bottom: max(12%, var(--safe-area-bottom, 0px) + 2%);
  background: linear-gradient(145deg, #1a5c3a 0%, #0d3a24 100%);
  border-radius: 50%;
  border: 6px solid #8b4513;
  box-shadow:
    inset 0 0 60px rgba(0, 0, 0, 0.5),
    0 8px 32px rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.community-area {
  text-align: center;
  padding: var(--spacing-sm);
}

.phase-label {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 6px;
}

.community-cards {
  display: flex;
  gap: 4px;
  justify-content: center;
  flex-wrap: wrap;
}

.card-placeholder {
  width: 32px;
  height: 44px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  border: 1px dashed rgba(255, 255, 255, 0.2);
}

/* 大屏幕增加占位符尺寸 */
@media (min-width: 430px) {
  .card-placeholder {
    width: 36px;
    height: 50px;
  }
}

.pot-display {
  margin-top: 10px;
  background: rgba(0, 0, 0, 0.4);
  padding: 4px 12px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pot-label {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.7);
}

.pot-amount {
  font-size: 0.9rem;
  font-weight: 700;
  color: #ffd700;
}

/* 大屏幕增加字体 */
@media (min-width: 430px) {
  .pot-display {
    padding: 6px 16px;
    margin-top: 12px;
  }
  .pot-label {
    font-size: 0.7rem;
  }
  .pot-amount {
    font-size: 1rem;
  }
}

.seats-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.seat-wrapper {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: auto;
}

.empty-seat {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 2px dashed rgba(255, 255, 255, 0.25);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: default;
  transition: all 0.2s ease;
}

/* 大屏幕增加空座位尺寸 */
@media (min-width: 430px) {
  .empty-seat {
    width: 56px;
    height: 56px;
  }
}

.empty-seat.can-sit {
  cursor: pointer;
  border-color: rgba(74, 222, 128, 0.5);
}

.empty-seat.can-sit:hover {
  background: rgba(74, 222, 128, 0.15);
  border-color: #4ade80;
  transform: scale(1.05);
}

.seat-number {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 600;
}

.sit-label {
  font-size: 0.55rem;
  color: #4ade80;
  margin-top: 2px;
}

@media (min-width: 430px) {
  .seat-number {
    font-size: 0.8rem;
  }
  .sit-label {
    font-size: 0.6rem;
  }
}
</style>
