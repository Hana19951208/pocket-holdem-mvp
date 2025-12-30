<!--
  CardDisplay.vue - 扑克牌显示组件

  直接使用 SVG 文件显示扑克牌（来自 client/public/assets/imgs/）。
  支持正面/背面显示，多种尺寸，响应式设计。
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { Card } from '../types';
import { Suit } from '../types';

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

// 尺寸类名（使用 CSS 处理响应式）
const sizeClass = computed(() => `size-${props.size}`);

// 获取 SVG 文件路径
const cardImagePath = computed(() => {
  if (props.faceDown || !props.card) {
    return '/assets/imgs/back.svg';
  }

  // 转换 rank: number -> 文件名格式
  const rankMap: Record<number, string> = {
    14: 'ace',   // Ace
    13: 'king',  // King
    12: 'queen', // Queen
    11: 'jack',  // Jack
    10: '10',
    9: '9',
    8: '8',
    7: '7',
    6: '6',
    5: '5',
    4: '4',
    3: '3',
    2: '2'
  };

  // 转换 suit: Suit enum -> 文件名格式
  const suitMap: Record<Suit, string> = {
    [Suit.SPADES]: 'spades',
    [Suit.HEARTS]: 'hearts',
    [Suit.DIAMONDS]: 'diamonds',
    [Suit.CLUBS]: 'clubs'
  };

  const rank = rankMap[props.card.rank];
  const suit = suitMap[props.card.suit];

  return `/assets/imgs/${rank}_of_${suit}.svg`;
});

// Fallback 显示（用于 alt 属性和调试）
const fallbackDisplay = computed(() => {
  if (!props.card || props.faceDown) return null;

  const rankMap: Record<number, string> = {
    14: 'A', 13: 'K', 12: 'Q', 11: 'J'
  };
  const suitMap: Record<Suit, string> = {
    [Suit.SPADES]: 's', [Suit.HEARTS]: 'h',
    [Suit.DIAMONDS]: 'd', [Suit.CLUBS]: 'c'
  };

  const rank = rankMap[props.card.rank] || props.card.rank.toString();
  const suit = suitMap[props.card.suit];

  return { rank, suit };
});
</script>

<template>
  <span class="card-display" :class="sizeClass">
    <img
      :src="cardImagePath"
      class="card-image"
      :alt="fallbackDisplay ? `${fallbackDisplay.rank}${fallbackDisplay.suit}` : 'card back'"
      loading="lazy"
    />
  </span>
</template>

<style scoped>
.card-display {
  display: inline-block;
  flex-shrink: 0;
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  background: #fff;
}

.card-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

/* 基础尺寸 */
.card-display.size-small {
  width: 32px;
  height: 46px;
}

.card-display.size-medium {
  width: 44px;
  height: 64px;
}

.card-display.size-large {
  width: 64px;
  height: 92px;
}

/* 小屏幕响应式 */
@media (max-width: 379px) {
  .card-display.size-small {
    width: 28px;
    height: 40px;
  }

  .card-display.size-medium {
    width: 40px;
    height: 56px;
  }

  .card-display.size-large {
    width: 56px;
    height: 80px;
  }
}
</style>
