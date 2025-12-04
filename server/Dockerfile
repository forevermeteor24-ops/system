# ---------------------------------------------------
# 使用 Alpine 版本 (体积极小，约 170MB)
# ---------------------------------------------------
    FROM node:18-alpine

    WORKDIR /app
    
    # 1. 这一步是关键：安装兼容库
    # 很多项目(如Prisma, NestJS)在 Alpine 下需要这个 libc6-compat 才能跑
    # 如果不加这一行，Alpine 也可能会报错
    RUN apk add --no-cache libc6-compat
    
    # 2. 复制依赖文件
    COPY package*.json ./
    
    # 3. 安装依赖
    # 生产环境部署建议用 npm ci
    RUN npm install
    
    # 4. 复制源码
    COPY . .
    
    # 5. 构建
    RUN npm run build
    
    # 6. 启动
    # 再次提醒：请确认是 main.js 还是 index.js
    CMD ["node", "dist/main.js"]