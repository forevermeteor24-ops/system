# ===========================
# 1. BUILD STAGE
# ===========================
FROM node:20 AS builder

# 工作目录
WORKDIR /app

# 复制 server 的 package.json（避免不必要的文件进入镜像）
COPY server/package*.json ./server/

# 安装 server 依赖
WORKDIR /app/server
RUN npm install

# 复制 server 源代码
COPY server ./ 

# 构建 TypeScript
RUN npm run build


# ===========================
# 2. RUNTIME STAGE
# ===========================
FROM node:20-slim

WORKDIR /app/server

# 复制构建结果和 package.json
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/package*.json ./

# 只安装生产依赖（最小镜像）
RUN npm install --production

# Zeabur 会注入 PORT 变量
ENV PORT=$PORT

EXPOSE 3000

# 启动服务器
CMD ["node", "dist/index.js"]
