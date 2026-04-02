/**
 * URL 构建工具
 * 对应原 Python 项目 utils/url_builder.py
 */

export class URLBuilder {
  /**
   * 构建列表页 URL
   * @param host 域名，如 https://jn.ke.com
   * @param houseId 小区 ID（可能为空）
   * @param page 页码
   * @param sug 搜索关键词
   */
  static buildListUrl(host: string, houseId: string, page: number, sug: string): string {
    if (page === 1) {
      if (houseId) {
        return `${host}/ershoufang/${houseId}/?sug=${sug}`;
      } else {
        return `${host}/ershoufang/rs${sug}/`;
      }
    } else {
      if (houseId) {
        return `${host}/ershoufang/pg${page}${houseId}/?pg=${sug}`;
      } else {
        return `${host}/ershoufang/pg${page}rs${sug}/`;
      }
    }
  }
}
