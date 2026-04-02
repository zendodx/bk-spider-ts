/**
 * 爬虫执行 API - 使用 SSE（Server-Sent Events）推送实时日志
 * POST /api/spider/run
 */

import { NextRequest } from 'next/server';
import { createBrowser, createContext, createPage, closeBrowser } from '@/lib/spider/driver';
import { HouseParser } from '@/lib/spider/parser';
import { AdaptiveSpeedController, SpeedLevel } from '@/lib/spider/speed-controller';
import { DataTransformer, CITY_MAPPING, JINAN_DISTRICTS } from '@/lib/spider/data-transformer';
import { BeikeSpider } from '@/lib/spider/spider';
import { AuthManager } from '@/lib/spider/auth';
import { HouseRepository } from '@/lib/db/repository';
import { getPool, initDatabase } from '@/lib/db/database';
import { DataExporter } from '@/lib/exporter';
import { getDataDir, getCookieFile, getDBConfig } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 全局存储当前爬虫实例（用于停止功能）
let currentSpider: BeikeSpider | null = null;

export async function POST(request: NextRequest) {
  const params = await request.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(type: string, data: unknown) {
        const json = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
        controller.enqueue(encoder.encode(`data: ${json}\n\n`));
      }

      function sendLog(message: string) {
        sendEvent('log', message);
      }

      try {
        sendLog('=== 爬虫启动 ===');

        const {
          host,
          sug,
          houseId = '',
          maxPage = 50,
          pageWait = 1.0,
          speedMode = 'normal',
          minDelay,
          maxDelay,
          pageInterval,
          maxRetries,
          maxEmptyPages = 1,
          exportCsv = true,
          dataDir,
          dbConfig: dbCfg,
          blockResources = false,
        } = params;

        if (!host || !sug) {
          sendEvent('error', '参数缺失：host 和 sug 为必填项');
          controller.close();
          return;
        }

        // 创建速度控制器
        let speedLevel = SpeedLevel.NORMAL;
        if (speedMode === 'slow') speedLevel = SpeedLevel.SLOW;
        if (speedMode === 'fast') speedLevel = SpeedLevel.FAST;

        const speedController = new AdaptiveSpeedController(speedLevel, {
          ...(minDelay !== undefined && { minDelay }),
          ...(maxDelay !== undefined && { maxDelay }),
          ...(pageInterval !== undefined && { pageInterval }),
          ...(maxRetries !== undefined && { maxRetries }),
        });

        sendLog(`速度模式: ${speedMode}`);

        // 初始化数据库
        const finalDbConfig = dbCfg || getDefaultDbConfig();
        try {
          await initDatabase(finalDbConfig);
          sendLog('✓ 数据库初始化完成');
        } catch (e) {
          sendLog(`⚠ 数据库初始化失败: ${e} (将跳过数据库保存)`);
        }

        const pool = getPool(finalDbConfig);

        // 启动浏览器
        sendLog('正在启动浏览器...');
        const browser = await createBrowser({ headless: false });
        sendLog(`屏蔽图片/字体: ${blockResources ? '已开启（加速模式）' : '未开启（完整加载）'}`);
        const context = await createContext(browser, { blockResources });
        const page = await createPage(context);

        try {
          // 认证
          sendLog('正在进行身份认证...');
          const cookieFile = getCookieFile(host);
          const auth = new AuthManager(cookieFile, host);
          await auth.ensureLogin(context, page);
          sendLog('✓ 身份认证完成');

          // 初始化组件
          const parser = new HouseParser(pageWait, speedController);
          const repository = new HouseRepository(pool);
          const transformer = new DataTransformer(CITY_MAPPING, JINAN_DISTRICTS);
          const outputDir = dataDir || getDataDir();
          const exporter = new DataExporter(outputDir);

          // 创建爬虫
          const spider = new BeikeSpider(page, parser, transformer, repository, {
            host,
            sug,
            houseId,
            maxPage,
            maxEmptyPages,
            speedController,
          });

          currentSpider = spider;

          sendLog(`开始爬取: ${sug}`);
          sendLog(`目标地址: ${host}`);
          sendLog(`最大页数: ${maxPage}`);

          // 运行爬虫
          const totalSaved = await spider.run(true, (info) => {
            sendEvent('progress', {
              page: info.page,
              maxPage: info.maxPage,
              totalSaved: info.totalSaved,
            });
            if (info.log) sendLog(info.log);
          });

          // 速度统计
          const stats = speedController.getStats();
          sendLog(`📊 速度统计: ${stats.successRate} 成功率, ${stats.avgSpeed}`);

          // 导出数据
          const exportData = spider.getDataForExport();

          if (exportCsv && exportData.length > 0) {
            try {
              const csvPath = exporter.toCsv(exportData, sug);
              sendLog(`✓ CSV 导出: ${csvPath}`);
            } catch (e) {
              sendLog(`⚠ CSV 导出失败: ${e}`);
            }
          }

          sendLog(`✓ 爬取完成，共保存 ${totalSaved} 条数据`);
          sendEvent('finished', { success: true, totalSaved, message: `成功完成，保存 ${totalSaved} 条数据` });

        } catch (e) {
          const msg = `❌ 运行异常: ${e}`;
          sendLog(msg);
          sendEvent('finished', { success: false, message: String(e) });
        } finally {
          currentSpider = null;
          await browser.close();
          sendLog('=== 爬虫结束 ===');
          controller.close();
        }
      } catch (e) {
        const msg = `❌ 启动异常: ${e}`;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: msg })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * 停止爬虫
 * DELETE /api/spider/run
 */
export async function DELETE() {
  if (currentSpider) {
    currentSpider.stop();
    return Response.json({ success: true, message: '爬虫停止指令已发送' });
  }
  return Response.json({ success: false, message: '当前没有运行中的爬虫' });
}

function getDefaultDbConfig() {
  return getDBConfig();
}
