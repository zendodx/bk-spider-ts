/**
 * 页面解析器
 * 对应原 Python 项目 core/parser.py
 * 新增：自动滚动页面触发懒加载
 */

import { Page } from 'playwright';
import { AdaptiveSpeedController, PageLoadOptimizer, sleep } from './speed-controller';

export interface HouseRawData {
  头图: string | null;
  头图描述: string | null;
  标题: string;
  小区: string;
  小区链接: string;
  楼层: string;
  年份: string;
  户型: string;
  面积: string;
  朝向: string;
  '总价(万)': string;
  '单价(万/平)': string;
  标签: string;
  详情页URL: string;
  关注人数: string;
  发布时间: string;
  采集时间: string;
  _host: string;
}

export class HouseParser {
  private pageWait: number;
  private speedController: AdaptiveSpeedController | null;
  private loadOptimizer: PageLoadOptimizer;

  constructor(pageWait = 1.0, speedController?: AdaptiveSpeedController) {
    this.pageWait = pageWait;
    this.speedController = speedController ?? null;
    this.loadOptimizer = new PageLoadOptimizer();
  }

  /**
   * 解析单页房源
   * 新增：自动滚动触发懒加载
   */
  async parsePage(page: Page, url: string, host: string, onCaptcha?: (resolved: boolean) => void): Promise<HouseRawData[]> {
    const startTime = Date.now();

    // 请求前等待间隔
    if (this.speedController) {
      await this.speedController.beforeRequest();
    }

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 等待列表容器，期间持续检测验证码
      // 策略：短超时轮询等待列表，每轮检查一次验证码；遇到验证码则无限等待人工完成
      const LIST_POLL_INTERVAL = 500;       // 每次轮询间隔 500ms
      const LIST_LOAD_TIMEOUT = 15000;      // 列表加载总超时
      const listLoadStart = Date.now();
      let listLoaded = false;

      while (!listLoaded) {
        // 先检测验证码（优先级最高）
        await this.handleCaptchaIfPresent(page, url, onCaptcha);

        // 检查列表是否已出现
        const el = await page.$('ul.sellListContent li.clear');
        if (el) {
          listLoaded = true;
          break;
        }

        // 列表还没出现，判断是否超时
        if (Date.now() - listLoadStart > LIST_LOAD_TIMEOUT) {
          console.error('页面加载超时');
          if (this.speedController) {
            this.speedController.afterRequest(false);
          }
          return [];
        }

        await sleep(LIST_POLL_INTERVAL);
      }

      // 自动滚动页面，触发懒加载
      await this.autoScroll(page);

      // 根据加载时间计算等待时间
      const pageLoadTime = (Date.now() - startTime) / 1000;
      const dynamicWait = PageLoadOptimizer.calculateWaitTime(pageLoadTime, this.pageWait);

      if (this.speedController) {
        await this.speedController.wait(dynamicWait * 0.5, dynamicWait * 1.5);
      } else {
        await sleep(dynamicWait * 1000);
      }

      // 解析房源列表
      const rows = await page.$$('ul.sellListContent li.clear');
      const houses: HouseRawData[] = [];

      for (const row of rows) {
        try {
          const house = await this.parseRow(row, host, page);
          if (house) {
            houses.push(house);
          }
        } catch (e) {
          console.error('解析单条房源异常:', e);
        }
      }

      if (this.speedController) {
        this.speedController.afterRequest(true);
      }

      const totalTime = (Date.now() - startTime) / 1000;
      console.log(`页面解析完成: ${houses.length} 条房源, 耗时 ${totalTime.toFixed(2)} 秒`);

      return houses;
    } catch (e) {
      console.error('页面解析异常:', e);
      if (this.speedController) {
        const errMsg = String(e).toLowerCase();
        const isBlocked = errMsg.includes('captcha') || errMsg.includes('验证') || errMsg.includes('block');
        this.speedController.afterRequest(false, isBlocked);
      }
      throw e;
    }
  }

  /**
   * 自动滚动页面，触发懒加载
   * 模拟人工浏览行为
   */
  private async autoScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const distance = 200;
        const delay = 100;
        let totalHeight = 0;
        const scrollHeight = document.body.scrollHeight;

        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            // 滚动回顶部
            window.scrollTo(0, 0);
            resolve();
          }
        }, delay);
      });
    });

    // 等待懒加载内容渲染
    await sleep(500);
  }

  /**
   * 处理极验验证码
   */
  /**
   * 单次检测验证码：
   * - 未发现验证码 → 立即返回
   * - 发现验证码   → 阻塞等待人工完成（最长 5 分钟），完成后重新加载原页面
   */
  private async handleCaptchaIfPresent(
    page: Page,
    originalUrl: string,
    onCaptcha?: (resolved: boolean) => void,
  ): Promise<void> {
    const CAPTCHA_SELECTORS = [
      '.geetest_btn_click',       // 极验滑块
      '.geetest_radar_tip',       // 极验点选
      '#captcha',
      '.captcha-container',
      'div[class*="captcha"]',
      'div[class*="verify"]',
    ];

    let found = false;
    for (const sel of CAPTCHA_SELECTORS) {
      if (await page.$(sel)) { found = true; break; }
    }
    if (!found) {
      const title = await page.title().catch(() => '');
      const pageUrl = page.url();
      if (title.includes('验证') || pageUrl.includes('captcha') || pageUrl.includes('verify')) {
        found = true;
      }
    }

    if (!found) return; // 无验证码，直接返回

    console.log('⚠️ 检测到人机验证，等待人工完成...');
    onCaptcha?.(false);
    try {
      await page.waitForFunction(
        (selectors: string[]) => selectors.every(s => !document.querySelector(s)),
        CAPTCHA_SELECTORS,
        { timeout: 300000 } // 最长等待 5 分钟
      );
      await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      onCaptcha?.(true);
    } catch {
      throw new Error('验证码等待超时（5分钟）');
    }
  }

  /**
   * 解析单行房源数据
   */
  private async parseRow(
    row: Awaited<ReturnType<Page['$']>>,
    host: string,
    page: Page
  ): Promise<HouseRawData | null> {
    if (!row) return null;

    // 小区信息
    const communityA = await row.$('div.positionInfo a');
    if (!communityA) return null;

    const communityName = (await communityA.textContent() ?? '').trim();
    const communityUrl = (await communityA.getAttribute('href') ?? '').trim();

    // 基础信息
    const mainImg = await row.$('a.img img.lj-lazy');
    const titleElem = await row.$('div.title a');

    if (!titleElem) return null;

    const headerImage = mainImg ? await mainImg.getAttribute('data-original') : null;
    const headerImageDesc = mainImg ? await mainImg.getAttribute('alt') : null;
    const title = (await titleElem.textContent() ?? '').trim();
    const detailUrl = (await titleElem.getAttribute('href') ?? '').trim();

    // 房屋属性
    const houseInfoElem = await row.$('div.houseInfo');
    const houseInfoText = houseInfoElem ? (await houseInfoElem.textContent() ?? '') : '';
    const houseInfo = this.parseHouseInfo(houseInfoText);

    // 关注信息
    const followInfoElem = await row.$('div.followInfo');
    const followInfoText = followInfoElem ? (await followInfoElem.textContent() ?? '') : '';
    const followInfo = this.parseFollowInfo(followInfoText);

    // 价格
    const totalPriceElem = await row.$('div.totalPrice span');
    const totalPrice = totalPriceElem
      ? (await totalPriceElem.textContent() ?? '').replace('万', '')
      : '';

    const area = houseInfo['面积'].replace('平米', '');

    // 标签
    const tagElems = await row.$$('div.tag span');
    const tags: string[] = [];
    for (const tag of tagElems) {
      const text = await tag.textContent();
      if (text) tags.push(text.trim());
    }

    // 计算单价（万元/平方米）
    let unitPrice = '';
    if (totalPrice && area) {
      try {
        unitPrice = (parseFloat(totalPrice) / parseFloat(area)).toFixed(4);
      } catch {
        // 忽略计算错误
      }
    }

    return {
      头图: headerImage,
      头图描述: headerImageDesc,
      标题: title,
      小区: communityName,
      小区链接: communityUrl,
      ...houseInfo,
      '总价(万)': totalPrice,
      '单价(万/平)': unitPrice,
      标签: tags.join(','),
      详情页URL: detailUrl,
      ...followInfo,
      采集时间: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' '),
      _host: host,
    };
  }

  /**
   * 解析房源信息字符串
   */
  private parseHouseInfo(text: string): {
    楼层: string;
    年份: string;
    户型: string;
    面积: string;
    朝向: string;
  } {
    // 修正无年份的格式
    if (!text.includes('年')) {
      try {
        const idx = text.indexOf('|');
        if (idx > -1) {
          const substr = text.substring(0, idx).trim().replace(' ', ' | ');
          text = substr + text.substring(idx);
        }
      } catch {
        // 忽略
      }
    }

    const parts = text.split('|').map(p => p.trim());
    const result = { 楼层: '', 年份: '', 户型: '', 面积: '', 朝向: '' };

    for (const p of parts) {
      if (p.includes('楼层') || p.includes('地下室')) {
        result['楼层'] = p;
      } else if (p.includes('年') && p.endsWith('年')) {
        result['年份'] = p.replace('年', '');
      } else if (p.includes('室') || p.includes('厅')) {
        result['户型'] = p;
      } else if (p.includes('平米')) {
        result['面积'] = p;
      } else if (['东', '西', '南', '北'].some(d => p.includes(d))) {
        result['朝向'] = p;
      }
    }

    return result;
  }

  /**
   * 解析关注信息
   */
  private parseFollowInfo(text: string): { 关注人数: string; 发布时间: string } {
    const parts = text.split('/').map(p => p.trim());
    const result = { 关注人数: '', 发布时间: '' };

    for (const p of parts) {
      if (p.includes('关注')) {
        result['关注人数'] = p.replace('人关注', '');
      } else if (p.includes('发布')) {
        result['发布时间'] = p.replace('发布', '');
      }
    }

    return result;
  }
}
