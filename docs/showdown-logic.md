# Showdown 逻辑规范

> 本文档定义 Pocket Holdem 的摊牌评估、比牌、分锅规则，确保与真实德州扑克规则一致。

---

## 一、牌型等级（从高到低）

| 等级 | 名称 | 英文 | 说明 |
|------|------|------|------|
| 10 | 皇家同花顺 | Royal Flush | 同花色 10-J-Q-K-A |
| 9 | 同花顺 | Straight Flush | 同花色连续五张 |
| 8 | 四条 | Four of a Kind | 四张相同点数 |
| 7 | 葫芦 | Full House | 三条 + 一对 |
| 6 | 同花 | Flush | 五张同花色 |
| 5 | 顺子 | Straight | 五张连续（A2345 最小） |
| 4 | 三条 | Three of a Kind | 三张相同点数 |
| 3 | 两对 | Two Pair | 两个不同的对子 |
| 2 | 一对 | One Pair | 两张相同点数 |
| 1 | 高牌 | High Card | 无上述牌型 |

---

## 二、评估算法

### 2.1 7 选 5 最佳组合

从 7 张牌（2 底牌 + 5 公共牌）中选择 C(7,5) = 21 种组合，评估每种组合的牌型，取得分最高者。

```typescript
for (const combo of getCombinations(allCards, 5)) {
    const evaluated = evaluateFiveCards(combo);
    if (evaluated.score > bestHand.score) {
        bestHand = evaluated;
    }
}
```

### 2.2 得分计算

```
score = 牌型等级 × 10^10 + kicker[0] × 10^8 + kicker[1] × 10^6 + ...
```

每个 kicker 按 2 位数编码，最多 5 个 kicker。

---

## 三、Kicker 规则

### 3.1 各牌型 Kicker 定义

| 牌型 | Kicker 组成 |
|------|-------------|
| 四条 | [四条点数, 单张] |
| 葫芦 | [三条点数, 对子点数] |
| 同花 | [5张牌按点数降序] |
| 顺子 | [顺子最高牌] |
| 三条 | [三条点数, 高单张, 次单张] |
| 两对 | [高对, 低对, 单张] |
| 一对 | [对子, 高单张, 中单张, 低单张] |
| 高牌 | [5张牌按点数降序] |

### 3.2 比牌流程

1. 比较牌型等级
2. 等级相同 → 按 kicker 逐个比较
3. 所有 kicker 相同 → 平局

---

## 四、平局与分锅

### 4.1 平局判定

当多名玩家最佳 5 张牌的 **score 完全相同** 时，判定为平局。

### 4.2 分锅规则

```typescript
const shareBase = Math.floor(pot.amount / winners.length);
let remainder = pot.amount % winners.length;

// 余数给座位靠前的玩家
for (const winner of sortedWinnersBySeat) {
    let share = shareBase;
    if (remainder > 0) {
        share += 1;
        remainder--;
    }
}
```

---

## 五、边池分配

### 5.1 边池形成条件

当有玩家 All-in 且投入额不同时，形成边池。

### 5.2 边池计算

```
按投入额排序（从小到大）
每个投入差额层 × 该层及以上玩家数 = 一个边池
```

### 5.3 资格判定

- 只有投入达到该边池层的未弃牌玩家有资格分配
- 每个边池独立评估赢家

---

## 六、边界情况

| 场景 | 处理 |
|------|------|
| 公共牌决定胜负 | 若最佳 5 张全在公共牌，所有未弃牌玩家平分 |
| A2345 顺子 | 视为最小顺子（5 为高牌） |
| 同花 vs 葫芦 | 葫芦 > 同花 |
| 弃牌玩家 | 不参与 Showdown |

---

## 七、与真实德州一致性声明

本实现遵循 **国际标准德州扑克规则**：
- ✅ 标准 10 级牌型等级
- ✅ 正确的 Kicker 规则
- ✅ 公平的平局分锅（余数给座位靠前者）
- ✅ 边池独立评估

---

## 八、单元测试覆盖

| 场景 | 测试文件 |
|------|----------|
| 所有 10 种牌型 | `poker.showdown.test.ts` |
| 2/3/4 人平局 | `poker.showdown.test.ts` |
| Kicker 决胜 | `poker.showdown.test.ts` |
| 边池分配 | `poker.showdown.test.ts` |
| 弃牌玩家排除 | `poker.showdown.test.ts` |

**测试结果**：42 passed (42)
