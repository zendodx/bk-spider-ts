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
  '单价(元/平)': string;
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
  async parsePage(page: Page, url: string, host: string): Promise<HouseRawData[]> {
    const startTime = Date.now();

    // 请求前等待间隔
    if (this.speedController) {
      await this.speedController.beforeRequest();
    }

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 处理人机验证
      await this.handleCaptcha(page, url);

      // 等待列表容器
      try {
        await page.waitForSelector('ul.sellListContent', { timeout: 15000 });
        await page.waitForSelector('ul.sellListContent li.clear', { timeout: 10000 });
      } catch {
        console.error('页面加载超时');
        if (this.speedController) {
          this.speedController.afterRequest(false);
        }
        return [];
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
  private async handleCaptcha(page: Page, originalUrl: string): Promise<void> {
    const captchaBtn = await page.$('.geetest_btn_click');
    if (captchaBtn) {
      console.log('⚠️ 检测到人机验证，等待人工完成...');
      try {
        await page.waitForFunction(
          () => !document.querySelector('.geetest_btn_click'),
          { timeout: 300000 }
        );
        await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch {
        throw new Error('验证码等待超时');
      }
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

    // 计算单价
    let unitPrice = '';
    if (totalPrice && area) {
      try {
        unitPrice = (parseFloat(totalPrice) * 10000 / parseFloat(area)).toFixed(2);
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
      '单价(元/平)': unitPrice,
      标签: tags.join(','),
      详情页URL: detailUrl,
      ...followInfo,
      采集时间: new Date().toISOString().replace('T', ' ').split('.')[0],
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
