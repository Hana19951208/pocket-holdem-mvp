<!--
  ActionPanel.vue - 操作面板组件
  
  位于屏幕底部的操作按钮区域（Fold/Check/Call/Raise）。
  响应式设计，拇指友好。
-->

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ActionType, formatChips } from '../types';

interface Props {
  /** 是否轮到玩家行动 */
  isMyTurn: boolean;
  /** 当前需要跟注的金额 */
  callAmount: number;
  /** 最小加注额 */
  minRaise: number;
  /** 玩家当前筹码 */
  myChips: number;
  /** 当前最高下注 */
  currentBet: number;
  /** 是否禁用所有操作 */
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
});

const emit = defineEmits<{
  (e: 'action', action: ActionType, amount?: number): void;
}>();

/** 加注金额 */
const raiseAmount = ref(0);

/** 是否显示加注滑块 */
const showRaiseSlider = ref(false);

/** 可以过牌（无需跟注） */
const canCheck = computed(() => props.callAmount === 0);

/** 可以跟注（有金额需要跟注且有足够筹码） */
const canCall = computed(() => props.callAmount > 0 && props.myChips > 0);

/** 是否可以加注（有足够筹码） */
const canRaise = computed(() => props.myChips > props.callAmount);

/** 最大加注额 */
const maxRaise = computed(() => props.myChips);

/** 加注显示文本 */
const raiseLabel = computed(() => {
  if (raiseAmount.value >= props.myChips) {
    return 'ALL IN';
  }
  return `加注 ${formatChips(raiseAmount.value)}`;
});

/** 初始化加注金额 */
const initRaise = () => {
  raiseAmount.value = Math.min(
    props.callAmount + props.minRaise,
    props.myChips
  );
  showRaiseSlider.value = true;
};

/** 执行操作 */
const doAction = (action: ActionType, amount?: number) => {
  showRaiseSlider.value = false;
  emit('action', action, amount);
};

/** 处理加注提交 */
const submitRaise = () => {
  if (raiseAmount.value >= props.myChips) {
    doAction(ActionType.ALL_IN, props.myChips);
  } else {
    doAction(ActionType.RAISE, raiseAmount.value);
  }
};

/** 快捷加注按钮 */
const quickRaise = (multiplier: number) => {
  const baseAmount = props.callAmount + props.minRaise;
  raiseAmount.value = Math.min(baseAmount * multiplier, props.myChips);
};
</script>

<template>
  <div class="action-panel" :class="{ active: isMyTurn, disabled }">
    <!-- 主操作区 -->
    <div class="main-actions" v-if="!showRaiseSlider">
      <!-- 弃牌 -->
      <button 
        class="action-btn fold"
        @click="doAction(ActionType.FOLD)"
        :disabled="disabled || !isMyTurn"
      >
        <span class="btn-icon">🃏</span>
        <span class="btn-label">弃牌</span>
      </button>
      
      <!-- 过牌 / 跟注 -->
      <button 
        v-if="canCheck"
        class="action-btn check"
        @click="doAction(ActionType.CHECK)"
        :disabled="disabled || !isMyTurn"
      >
        <span class="btn-icon">✓</span>
        <span class="btn-label">过牌</span>
      </button>
      
      <button 
        v-else-if="canCall"
        class="action-btn call"
        @click="doAction(callAmount >= myChips ? ActionType.ALL_IN : ActionType.CALL, callAmount)"
        :disabled="disabled || !isMyTurn"
      >
        <span class="btn-icon">📞</span>
        <span class="btn-label">
          {{ callAmount >= myChips ? 'ALL IN' : '跟注' }}
        </span>
        <span class="btn-amount">{{ formatChips(Math.min(callAmount, myChips)) }}</span>
      </button>
      
      <!-- 加注 -->
      <button 
        v-if="canRaise"
        class="action-btn raise"
        @click="initRaise"
        :disabled="disabled || !isMyTurn"
      >
        <span class="btn-icon">⬆️</span>
        <span class="btn-label">加注</span>
      </button>
      
      <!-- All In（当不能加注时直接显示） -->
      <button 
        v-else-if="myChips > 0"
        class="action-btn allin"
        @click="doAction(ActionType.ALL_IN, myChips)"
        :disabled="disabled || !isMyTurn"
      >
        <span class="btn-icon">🔥</span>
        <span class="btn-label">ALL IN</span>
        <span class="btn-amount">{{ formatChips(myChips) }}</span>
      </button>
    </div>
    
    <!-- 加注滑块区 -->
    <div class="raise-panel" v-else>
      <div class="raise-header">
        <button class="back-btn" @click="showRaiseSlider = false">
          ← 返回
        </button>
        <span class="raise-title">选择加注金额</span>
      </div>
      
      <div class="quick-raises">
        <button @click="quickRaise(2)">2x</button>
        <button @click="quickRaise(3)">3x</button>
        <button @click="quickRaise(4)">4x</button>
        <button @click="raiseAmount = myChips">All In</button>
      </div>
      
      <div class="slider-container">
        <input 
          type="range" 
          class="raise-slider"
          v-model.number="raiseAmount"
          :min="Math.min(callAmount + minRaise, myChips)"
          :max="maxRaise"
          step="1"
        />
        <div class="slider-labels">
          <span>{{ formatChips(callAmount + minRaise) }}</span>
          <span class="current-value">{{ formatChips(raiseAmount) }}</span>
          <span>{{ formatChips(maxRaise) }}</span>
        </div>
      </div>
      
      <button class="confirm-raise" @click="submitRaise">
        {{ raiseLabel }}
      </button>
    </div>
    
    <!-- 行动提示 -->
    <div class="turn-indicator" v-if="isMyTurn && !showRaiseSlider">
      <span class="pulse-dot"></span>
      轮到你行动
    </div>
  </div>
</template>

<style scoped>
/* ========================================
   移动端优化的操作面板
   ======================================== */
.action-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.95), rgba(0, 0, 0, 0.85));
  backdrop-filter: blur(12px);
  padding: 10px 12px;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  padding-left: max(12px, env(safe-area-inset-left));
  padding-right: max(12px, env(safe-area-inset-right));
  z-index: 100;
  transition: all 0.3s ease;
}

.action-panel.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.action-panel:not(.active) {
  opacity: 0.6;
}

.main-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
  align-items: stretch;
}

.action-btn {
  flex: 1;
  min-width: 60px;
  max-width: 90px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  gap: 0;
  padding: 8px 6px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
  /* 固定高度确保对齐 */
  height: 56px;
}

/* 大屏幕增加按钮尺寸 */
@media (min-width: 430px) {
  .action-panel {
    padding: 12px 16px;
  }
  .action-btn {
    max-width: 100px;
    padding: 12px 8px;
  }
  .main-actions {
    gap: 8px;
  }
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn:not(:disabled):active {
  transform: scale(0.95);
}

.btn-icon {
  font-size: 1.1rem;
}

.btn-label {
  font-size: 0.75rem;
  font-weight: 600;
}

.btn-amount {
  font-size: 0.65rem;
  opacity: 0.8;
}

@media (min-width: 430px) {
  .btn-icon {
    font-size: 1.2rem;
  }
  .btn-label {
    font-size: 0.8rem;
  }
  .btn-amount {
    font-size: 0.7rem;
  }
}

/* 按钮颜色变体 */
.action-btn.fold {
  background: linear-gradient(135deg, #4b5563 0%, #374151 100%);
  color: white;
}

.action-btn.check {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
}

.action-btn.call {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
}

.action-btn.raise {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
}

.action-btn.allin {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
}

/* ========================================
   加注面板 - 移动端优化
   ======================================== */
.raise-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.raise-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.back-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  cursor: pointer;
}

.raise-title {
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
}

.quick-raises {
  display: flex;
  gap: 6px;
}

.quick-raises button {
  flex: 1;
  padding: 8px 4px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 36px;
}

@media (min-width: 430px) {
  .quick-raises button {
    font-size: 0.8rem;
    padding: 8px;
  }
  .raise-panel {
    gap: 12px;
  }
  .raise-header {
    gap: 12px;
  }
  .quick-raises {
    gap: 8px;
  }
}

.quick-raises button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.slider-container {
  padding: 0 4px;
}

.raise-slider {
  width: 100%;
  height: 12px; /* 增加触摸区域 */
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.2);
  appearance: none;
  cursor: pointer;
}

.raise-slider::-webkit-slider-thumb {
  appearance: none;
  width: 26px; /* 增加滑块大小 */
  height: 26px;
  border-radius: 50%;
  background: #f59e0b;
  cursor: pointer;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.5);
}

.current-value {
  color: #f59e0b;
  font-weight: 700;
  font-size: 0.85rem;
}

@media (min-width: 430px) {
  .raise-slider {
    height: 8px;
  }
  .raise-slider::-webkit-slider-thumb {
    width: 24px;
    height: 24px;
  }
  .slider-labels {
    font-size: 0.7rem;
  }
  .current-value {
    font-size: 0.9rem;
  }
}

.confirm-raise {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 48px;
}

@media (min-width: 430px) {
  .confirm-raise {
    padding: 14px;
    font-size: 1rem;
  }
}

.confirm-raise:active {
  transform: scale(0.98);
}

/* ========================================
   行动提示 - 移动端优化
   ======================================== */
.turn-indicator {
  position: absolute;
  top: -28px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(234, 179, 8, 0.9);
  color: #000;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

@media (min-width: 430px) {
  .turn-indicator {
    top: -32px;
    padding: 6px 16px;
    font-size: 0.8rem;
    gap: 6px;
  }
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: #000;
  border-radius: 50%;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}
</style>
