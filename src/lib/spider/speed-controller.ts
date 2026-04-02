/**
 * 智能速度控制器 - 优化爬取速度同时防止被封禁
 * 对应原 Python 项目 core/speed_controller.py
 * 新增：1.5~3.5s 随机间隔，模拟人工节奏
 */

export enum SpeedLevel {
  SLOW = 'slow',
  NORMAL = 'normal',
  FAST = 'fast',
}

export interface SpeedConfig {
  minDelay: number;      // 最小延迟（秒）
  maxDelay: number;      // 最大延迟（秒）
  pageInterval: number;  // 页面间最小间隔（秒）
  retryDelay: number;    // 重试延迟（秒）
  maxRetries: number;    // 最大重试次数
  successThreshold: number; // 连续成功阈值，用于提速
  failThreshold: number;    // 连续失败阈值，用于降速
}

const PRESETS: Record<SpeedLevel, SpeedConfig> = {
  [SpeedLevel.SLOW]: {
    minDelay: 2.0,
    maxDelay: 5.0,
    pageInterval: 3.0,
    retryDelay: 10.0,
    maxRetries: 5,
    successThreshold: 10,
    failThreshold: 1,
  },
  [SpeedLevel.NORMAL]: {
    minDelay: 1.5,
    maxDelay: 3.5,
    pageInterval: 2.0,
    retryDelay: 5.0,
    maxRetries: 3,
    successThreshold: 5,
    failThreshold: 2,
  },
  [SpeedLevel.FAST]: {
    minDelay: 0.5,
    maxDelay: 1.5,
    pageInterval: 1.0,
    retryDelay: 3.0,
    maxRetries: 3,
    successThreshold: 3,
    failThreshold: 2,
  },
};

/**
 * 高斯随机数生成
 */
function gaussRandom(mean: number, std: number): number {
  // Box-Muller 变换
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * std + mean;
}

/**
 * 延迟工具函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class AdaptiveSpeedController {
  config: SpeedConfig;
  private currentLevel: SpeedLevel;

  // 状态追踪
  private consecutiveSuccess = 0;
  private consecutiveFail = 0;
  totalRequests = 0;
  successCount = 0;
  failCount = 0;
  blockDetectedCount = 0;

  // 自适应调整因子
  private delayMultiplier = 1.0;
  private lastRequestTime: number | null = null;

  // 统计信息
  private startTime = Date.now();

  constructor(level: SpeedLevel = SpeedLevel.NORMAL, customConfig?: Partial<SpeedConfig>) {
    this.currentLevel = level;
    this.config = customConfig
      ? { ...PRESETS[level], ...customConfig }
      : PRESETS[level];
  }

  /**
   * 执行随机延迟等待（正态分布，更自然）
   * 默认使用 1.5~3.5s 随机间隔，模拟人工节奏
   */
  async wait(minDelay?: number, maxDelay?: number): Promise<void> {
    const minD = (minDelay ?? this.config.minDelay) * this.delayMultiplier;
    const maxD = (maxDelay ?? this.config.maxDelay) * this.delayMultiplier;

    const mean = (minD + maxD) / 2;
    const std = (maxD - minD) / 4;

    let delay = gaussRandom(mean, std);
    delay = Math.max(minD, Math.min(maxD, delay));

    await sleep(delay * 1000);
  }

  /**
   * 请求前处理：确保页面间间隔
   */
  async beforeRequest(): Promise<void> {
    if (this.lastRequestTime !== null) {
      const elapsed = (Date.now() - this.lastRequestTime) / 1000;
      const interval = this.config.pageInterval * this.delayMultiplier;

      if (elapsed < interval) {
        const waitTime = interval - elapsed;
        await sleep(waitTime * 1000);
      }
    }

    this.lastRequestTime = Date.now();
    this.totalRequests++;
  }

  /**
   * 请求后处理：更新状态并自适应调整
   */
  afterRequest(success: boolean, isBlocked = false): void {
    if (success) {
      this.successCount++;
      this.consecutiveSuccess++;
      this.consecutiveFail = 0;

      if (this.consecutiveSuccess >= this.config.successThreshold) {
        this.decreaseDelay();
        this.consecutiveSuccess = 0;
      }
    } else {
      this.failCount++;
      this.consecutiveFail++;
      this.consecutiveSuccess = 0;

      if (isBlocked || this.consecutiveFail >= this.config.failThreshold) {
        this.increaseDelay();
      }
    }

    if (isBlocked) {
      this.blockDetectedCount++;
    }
  }

  private increaseDelay(): void {
    const old = this.delayMultiplier;
    this.delayMultiplier = Math.min(3.0, this.delayMultiplier * 1.5);
    if (this.delayMultiplier !== old) {
      this.consecutiveFail = 0;
    }
  }

  private decreaseDelay(): void {
    this.delayMultiplier = Math.max(0.8, this.delayMultiplier * 0.9);
  }

  getRetryDelay(attempt: number): number {
    const baseDelay = this.config.retryDelay * this.delayMultiplier;
    return baseDelay * Math.pow(2, attempt) + Math.random();
  }

  shouldRetry(attempt: number): boolean {
    return attempt < this.config.maxRetries;
  }

  getStats(): Record<string, string | number> {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const successRate = this.totalRequests > 0
      ? (this.successCount / this.totalRequests * 100).toFixed(1) + '%'
      : '0%';
    const avgSpeed = elapsed > 0
      ? (this.totalRequests / elapsed * 60).toFixed(1) + ' 页/分钟'
      : '0 页/分钟';

    return {
      totalRequests: this.totalRequests,
      successCount: this.successCount,
      failCount: this.failCount,
      successRate,
      blockDetected: this.blockDetectedCount,
      avgSpeed,
      currentDelayMultiplier: this.delayMultiplier.toFixed(2) + 'x',
      elapsedTime: elapsed.toFixed(0) + ' 秒',
    };
  }

  reset(): void {
    this.consecutiveSuccess = 0;
    this.consecutiveFail = 0;
    this.delayMultiplier = 1.0;
    this.lastRequestTime = null;
  }
}

/**
 * 页面加载优化器
 */
export class PageLoadOptimizer {
  static calculateWaitTime(pageLoadTime: number, baseWait = 0.5): number {
    if (pageLoadTime < 1.0) return baseWait * 0.5;
    if (pageLoadTime < 3.0) return baseWait;
    return baseWait * 1.5;
  }

  static getRandomUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }
}
