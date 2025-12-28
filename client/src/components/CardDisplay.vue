<!--
  CardDisplay.vue - 扑克牌显示组件
  
  渲染单张扑克牌，支持正面/背面显示，多种尺寸。
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { Card } from '../types';
import { Suit, getCardDisplay } from '../types';

interface Props {
  /** 牌面信息（null 表示背面） */
  card?: Card | null;
  /** 尺寸 */
  size?: 'small' | 'medium' | 'large';
  /** 是否显示背面 */
  faceDown?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  card: null,
  size: 'medium',
  faceDown: false
});

/** 显示信息 */
const display = computed(() => {
  if (!props.card || props.faceDown) return null;
  return getCardDisplay(props.card);
});

/** 花色符号 */
const suitSymbol = computed(() => {
  if (!props.card) return '';
  const symbols: Record<Suit, string> = {
    [Suit.SPADES]: '♠',
    [Suit.HEARTS]: '♥',
    [Suit.DIAMONDS]: '♦',
    [Suit.CLUBS]: '♣'
  };
  return symbols[props.card.suit];
});

/** 点数显示 */
const rankDisplay = computed(() => {
  if (!props.card) return '';
  const names: Record<number, string> = {
    11: 'J', 12: 'Q', 13: 'K', 14: 'A'
  };
  return names[props.card.rank] || props.card.rank.toString();
});

/** 是否为红色花色 */
const isRed = computed(() => {
  if (!props.card) return false;
  return props.card.suit === Suit.HEARTS || props.card.suit === Suit.DIAMONDS;
});
</script>

<template>
  <div 
    class="card"
    :class="[
      `size-${size}`,
      { 'face-down': faceDown || !card, 'is-red': isRed }
    ]"
  >
    <template v-if="card && !faceDown">
      <!-- 左上角 -->
      <div class="corner top-left">
        <span class="rank">{{ rankDisplay }}</span>
        <span class="suit">{{ suitSymbol }}</span>
      </div>
      
      <!-- 中央花色 -->
      <div class="center-suit">
        {{ suitSymbol }}
      </div>
      
      <!-- 右下角（倒置） -->
      <div class="corner bottom-right">
        <span class="rank">{{ rankDisplay }}</span>
        <span class="suit">{{ suitSymbol }}</span>
      </div>
    </template>
    
    <!-- 背面图案 -->
    <div class="card-back" v-else>
      <div class="back-pattern"></div>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: linear-gradient(145deg, #ffffff 0%, #f0f0f0 100%);
  border-radius: 6px;
  box-shadow: 
    0 2px 8px rgba(0, 0, 0, 0.15),
    0 1px 2px rgba(0, 0, 0, 0.1);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1a1a1a;
  font-family: 'Georgia', serif;
  transition: transform 0.2s ease;
}

.card:hover {
  transform: translateY(-2px);
}

/* 尺寸变体 */
.size-small {
  width: 28px;
  height: 40px;
  font-size: 0.7rem;
}

.size-medium {
  width: 40px;
  height: 56px;
  font-size: 0.9rem;
}

.size-large {
  width: 56px;
  height: 80px;
  font-size: 1.2rem;
}

/* 红色花色 */
.card.is-red {
  color: #dc2626;
}

/* 角落标记 */
.corner {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

.top-left {
  top: 3px;
  left: 3px;
}

.bottom-right {
  bottom: 3px;
  right: 3px;
  transform: rotate(180deg);
}

.rank {
  font-weight: 700;
}

.suit {
  font-size: 0.8em;
}

/* 中央花色 */
.center-suit {
  font-size: 1.5em;
  opacity: 0.3;
}

.size-small .center-suit {
  font-size: 1.2em;
}

.size-large .center-suit {
  font-size: 2em;
}

/* 背面 */
.card.face-down {
  background: linear-gradient(135deg, #1e3a5f 0%, #0c1929 100%);
}

.card-back {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
}

.back-pattern {
  width: 100%;
  height: 100%;
  background: 
    repeating-linear-gradient(
      45deg,
      transparent,
      transparent 2px,
      rgba(255, 255, 255, 0.05) 2px,
      rgba(255, 255, 255, 0.05) 4px
    );
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
</style>
