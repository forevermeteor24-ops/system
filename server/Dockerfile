# 使用官方 Node LTS 精简版
FROM node:18-slim

# 设置工作目录
WORKDIR /app

# 仅复制 package.json 和 lock，避免破坏缓存
COPY package*.json ./

# 安装依赖（生产依赖）
RUN npm install --production=false

# 复制所有源代码
COPY . .

# 构建 TypeScript
RUN npm run build

# 使用生产环境启动（dist/index.js）
CMD ["node", "dist/index.js"]
