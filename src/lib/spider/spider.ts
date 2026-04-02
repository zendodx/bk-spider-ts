/**
 * 爬虫主控服务
 * 对应原 Python 项目 services/spider.py
 * 使用 Playwright Page 替代 Selenium WebDriver
 */

import { Page } from 'playwright';
import { HouseParser, HouseRawData } from './parser';
import { AdaptiveSpeedController, sleep } from './speed-controller';
import { DataTransformer, HouseRecord } from './data-transformer';
import { HouseRepository } from '../db/repository';
import { URLBuilder } from './url-builder';

export interface SpiderOptions {
  host: string;
  sug: string;
  houseId: string;
  maxPage: number;
  speedController?: AdaptiveSpeedController;
  enableRetry?: boolean;
}

export type SpiderProgressCallback = (info: {
  page: number;
  maxPage: number;
  houses: number;
  totalSaved: number;
  log: string;
}) => void;

export class BeikeSpider {
  private parser: HouseParser;
  private transformer: DataTransformer;
  private repository: HouseRepository;
  private options: SpiderOptions;
  private allRawData: HouseRawData[] = [];

  private emptyPageCount = 0;
  private readonly maxEmptyPages = 3;

  private _stopped = false;

  constructor(
    private page: Page,
    parser: HouseParser,
    transformer: DataTransformer,
    repository: HouseRepository,
    options: SpiderOptions
  ) {
    this.parser = parser;
    this.transformer = transformer;
    this.repository = repository;
    this.options = options;
  }

  stop(): void {
    this._stopped = true;
  }

  /**
   * 执行爬取
   * @param savePerPage 是否每页实时保存
   * @param onProgress 进度回调
   */
  async run(
    savePerPage = true,
    onProgress?: SpiderProgressCallback
  ): Promise<number> {
    let totalSaved = 0;
    const startTime = Date.now();
    const { host, sug, houseId, maxPage, speedController } = this.options;

    this.log(`${'='.repeat(50)}`, onProgress, totalSaved, 0, maxPage);
    this.log(`爬虫启动 - 目标: ${sug} (${host})`, onProgress, totalSaved, 0, maxPage);
    this.log(`最大页数: ${maxPage}`, onProgress, totalSaved, 0, maxPage);
    this.log(`${'='.repeat(50)}`, onProgress, totalSaved, 0, maxPage);

    let page = 1;
    for (; page <= maxPage; page++) {
      if (this._stopped) {
        this.log('⚠ 爬虫已被手动停止', onProgress, totalSaved, page, maxPage);
        break;
      }

      const url = URLBuilder.buildListUrl(host, houseId, page, sug);
      this.log(`[第 ${page}/${maxPage} 页] ${url}`, onProgress, totalSaved, page, maxPage);

      const houses = await this.parsePageWithRetry(page, url);

      if (houses.length === 0) {
        this.emptyPageCount++;
        this.log(
          `第 ${page} 页无数据 (连续空页: ${this.emptyPageCount})`,
          onProgress, totalSaved, page, maxPage
        );

        if (this.emptyPageCount >= this.maxEmptyPages) {
          this.log(
            `连续 ${this.maxEmptyPages} 页无数据，爬取结束`,
            onProgress, totalSaved, page, maxPage
          );
          break;
        }
        continue;
      } else {
        this.emptyPageCount = 0;
      }

      this.allRawData.push(...houses);
      this.log(
        `第 ${page} 页解析完成，共 ${houses.length} 条房源`,
        onProgress, totalSaved, page, maxPage
      );

      if (savePerPage) {
        const saved = await this.saveBatch(houses);
        totalSaved += saved;
        this.log(`已保存 ${saved} 条到数据库`, onProgress, totalSaved, page, maxPage);
      }

      if (speedController && page % 5 === 0) {
        const stats = speedController.getStats();
        this.log(
          `📊 速度统计: ${stats.successRate} 成功率, ${stats.avgSpeed}`,
          onProgress, totalSaved, page, maxPage
        );
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    this.log(`${'='.repeat(50)}`, onProgress, totalSaved, page - 1, maxPage);
    this.log(
      `爬取完成! 总耗时: ${elapsed} 秒, 共 ${this.allRawData.length} 条数据, 保存 ${totalSaved} 条`,
      onProgress, totalSaved, page - 1, maxPage
    );
    this.log(`${'='.repeat(50)}`, onProgress, totalSaved, page - 1, maxPage);

    return totalSaved;
  }

  private log(
    message: string,
    onProgress?: SpiderProgressCallback,
    totalSaved = 0,
    currentPage = 0,
    maxPage = 0
  ): void {
    console.log(message);
    onProgress?.({
      page: currentPage,
      maxPage,
      houses: this.allRawData.length,
      totalSaved,
      log: message,
    });
  }

  private async parsePageWithRetry(pageNum: number, url: string): Promise<HouseRawData[]> {
    const maxRetries = this.options.speedController?.config.maxRetries ?? 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (this._stopped) return [];

      try {
        const houses = await this.parser.parsePage(this.page, url, this.options.host);
        return houses;
      } catch (e) {
        const errMsg = String(e).toLowerCase();
        const isBlocked = ['captcha', '验证', 'block', 'forbidden', '403', '429'].some(
          kw => errMsg.includes(kw)
        );

        if (isBlocked) {
          console.error(`第 ${pageNum} 页检测到封禁/验证!`);
        }

        if (this.options.speedController) {
          this.options.speedController.afterRequest(false, isBlocked);
        }

        if (attempt >= maxRetries) {
          console.error(`第 ${pageNum} 页重试次数耗尽，最后错误: ${e}`);
          break;
        }

        const retryDelay = this.options.speedController
          ? this.options.speedController.getRetryDelay(attempt)
          : 5 * Math.pow(2, attempt);

        console.warn(`第 ${pageNum} 页第 ${attempt + 1} 次失败，${retryDelay.toFixed(1)} 秒后重试...`);
        await sleep(retryDelay * 1000);
      }
    }

    return [];
  }

  private async saveBatch(rawData: HouseRawData[]): Promise<number> {
    const records: HouseRecord[] = [];

    for (const item of rawData) {
      const transformed = this.transformer.transform(item);
      if (transformed) {
        records.push(transformed);
      }
    }

    if (records.length === 0) return 0;

    return this.repository.bulkInsert(records);
  }

  getDataForExport(): HouseRawData[] {
    return this.allRawData;
  }
}
