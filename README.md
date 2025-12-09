# 电商物流配送可视化平台

本项目是一个完整的电商物流配送可视化平台，包含 **商家端、用户端前端界面**，以及 **Node.js 后端、WebSocket 服务、轨迹模拟器**。平台支持 **订单管理、实时配送追踪、地图可视化、轨迹回放、数据看板** 等功能，并通过 **高德地图** 提供精准的配送路线和实时位置追踪。

---

## 🏗 项目目录结构

```

/project-root
/user-client            # 用户端前端
/src
/api                # API 请求
/assets             # 静态资源
/components         # 组件
/pages              # 页面组件
/utils              # 工具函数
.env                # 环境配置
tsconfig.json       # TypeScript 配置
/merchant-client        # 商家端前端
/src
/api                # API 请求
/assets             # 静态资源
/components         # 组件
/pages              # 页面组件
/utils              # 工具函数
/server                 # Node.js 后端服务
/src
/api                # REST API 路由
/ws                 # WebSocket 服务
/simulator          # 配送轨迹模拟器
/models             # 数据库模型
/utils              # 工具函数
docker-compose.yml      # 一键启动配置
README.md               # 项目说明
package.json            # 后端依赖配置

```

---

## 📁 文件夹作用说明

### `/user-client` —— 用户端前端
| 文件夹 | 作用 |
|-------|------|
| `/api` | 处理与后端的 API 请求 |
| `/assets` | 存放静态资源，如图片和SVG图标 |
| `/components` | 可复用的UI组件 |
| `/pages` | 页面组件，如订单详情页、个人资料页等 |
| `/utils` | 工具函数，主要用于数据处理等 |

### `/merchant-client` —— 商家端前端
| 文件夹 | 作用 |
|-------|------|
| `/api` | 处理与后端的 API 请求 |
| `/assets` | 存放静态资源 |
| `/components` | 可复用的UI组件 |
| `/pages` | 页面组件，如订单管理页、配送状态页等 |
| `/utils` | 工具函数 |

### `/server` —— Node.js 后端服务
| 文件夹 | 作用 |
|-------|------|
| `/api` | 订单、配送、用户等 REST API |
| `/ws` | WebSocket 服务，用于实时推送配送位置 |
| `/simulator` | 配送轨迹模拟器，用于自动生成演示数据 |
| `/models` | 数据库模型，如订单、轨迹等 |
| `/utils` | 通用工具，如经纬度计算、配置读取等 |

---

### `docker-compose.yml`
用于快速启动项目环境，包括：
- Node.js 后端服务
- 前端开发环境
- 数据库（如 MongoDB / PostgreSQL）
- 轨迹模拟器

---

## 🚀 功能特性

### ✅ 前端功能
- 商家端订单管理
- 用户端订单查询与实时配送可视化
- 管理台数据看板
- 地图展示配送路线
- 实时 WebSocket 数据接收

### ✅ 后端功能
- 订单/配送 REST API
- WebSocket 实时位置推送
- 配送轨迹模拟器（支持批量自动运行）
- 数据存储（订单、用户、轨迹点）

---

## 🛠 技术栈

**前端：**
- React + Vite  
- Zustand / Redux (可选)  
- 高德地图 API / Leaflet  
- Recharts / ECharts  

**后端：**
- Node.js (Express or Koa)  
- WebSocket  
- MongoDB / PostgreSQL  
- 路径/轨迹模拟算法  

---

## ▶️ 项目启动

### 方式一：Docker 一键启动
```

docker-compose up -d

```

### 方式二：手动启动

#### 1. 启动后端
```

cd server
npm install
npm run dev

```

#### 2. 启动前端
```

cd user-client
npm install
npm run dev

```

#### 3. 启动商家端
```

cd merchant-client
npm install
npm run dev

```

#### 4. 启动轨迹模拟器（可选）
```

cd server
npm run simulate

```

---

## 📜 License
MIT License
