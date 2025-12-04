# ---------------------------------------
# 第一阶段：构建 (Builder)
# ---------------------------------------
    FROM node:18-slim AS builder

    WORKDIR /app
    
    # 1. 先拷贝依赖描述文件
    COPY package*.json ./
    
    # 2. 安装所有依赖 (包括开发依赖，因为需要编译 TS)
    # 使用 ci 命令比 install 更快更稳定
    RUN npm ci
    
    # 3. 拷贝源码并编译
    COPY . .
    RUN npm run build
    
    # ---------------------------------------
    # 第二阶段：运行 (Runner) - 最终只会保留这部分
    # ---------------------------------------
    FROM node:18-slim AS runner
    
    WORKDIR /app
    
    ENV NODE_ENV production
    
    # 1. 再次拷贝依赖描述文件
    COPY package*.json ./
    
    # 2. 【关键】只安装生产环境依赖 (大大减小体积)
    # 这会去掉 typescript 等几百MB的开发包
    RUN npm ci --omit=dev
    
    # 3. 从第一阶段只拷贝编译好的 dist 文件夹
    COPY --from=builder /app/dist ./dist
    
    # 4. 启动
    CMD ["node", "dist/index.js"]