<!--
  PlayingCard.vue - SVG 扑克牌组件

  直接使用 SVG 文件显示扑克牌（来自 client/public/assets/imgs/）。
  支持正面、背面显示，响应式尺寸。
-->

<script setup lang="ts">
import { computed } from 'vue';

interface Card {
  rank: string;  // 'A'-'K', '2'-'10'
  suit: string;  // 's', 'h', 'd', 'c' (spades, hearts, diamonds, clubs)
  faceDown?: boolean;
}

interface Props {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md'
});

// 尺寸配置
const sizes = {
  sm: { width: '42px', height: '61px' },
  md: { width: '63px', height: '91px' },
  lg: { width: '105px', height: '152px' }
};

// 响应式尺寸配置（移动端）
const responsiveSizes = {
  sm: { width: '35px', height: '51px' },
  md: { width: '52px', height: '75px' },
  lg: { width: '87px', height: '126px' }
};

const sizeStyle = computed(() => {
  // 小屏幕使用较小尺寸
  if (typeof window !== 'undefined' && window.innerWidth < 380) {
    return responsiveSizes[props.size];
  }
  return sizes[props.size];
});

// 获取 SVG 文件路径
const cardImagePath = computed(() => {
  if (props.card.faceDown) {
    return '/assets/imgs/back.svg';
  }

  // 转换 rank: 文件名格式
  // 'A' -> 'ace', 'K' -> 'king', 'Q' -> 'queen', 'J' -> 'jack', 数字不变
  const rankMap: Record<string, string> = {
    'A': 'ace',
    'K': 'king',
    'Q': 'queen',
    'J': 'jack'
  };

  // 转换 suit: 文件名格式
  // 's' -> 'spades', 'h' -> 'hearts', 'd' -> 'diamonds', 'c' -> 'clubs'
  const suitMap: Record<string, string> = {
    's': 'spades',
    'h': 'hearts',
    'd': 'diamonds',
    'c': 'clubs'
  };

  const rank = rankMap[props.card.rank] || props.card.rank;
  const suit = suitMap[props.card.suit];

  return `/assets/imgs/${rank}_of_${suit}.svg`;
});
</script>

<template>
  <span class="playing-card" :style="sizeStyle">
    <img
      :src="cardImagePath"
      class="card-image"
      :alt="card.faceDown ? 'card back' : `${card.rank}${card.suit}`"
      loading="lazy"
    />
  </span>
</template>

<style scoped>
.playing-card {
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
</style>
