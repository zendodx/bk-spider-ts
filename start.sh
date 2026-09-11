# 首次使用需要让 better-sqlite3 匹配本机 Node 版本
npm rebuild better-sqlite3

# 杀掉端口 3799 的进程
lsof -ti :3799 | xargs kill 2>/dev/null; sleep 1; lsof -ti :3799 | xargs kill -9 2>/dev/null; lsof -i :3799 || echo "端口 3799 已释放"

# 启动开发服务器（默认端口 3799）
npm run dev