# 1. 使用 Node 环境
FROM node:18-alpine

# 2. 创建工作目录
WORKDIR /app

# 3. 复制 package.json
COPY package.json package-lock.json* ./ 

# 4. 安装依赖
RUN npm install

# 5. 复制全部源码
COPY . .

# 6. 编译 TypeScript
RUN npm run build

# 7. 暴露端口
EXPOSE 3000

# 8. 启动后端
CMD ["npm", "start"]
