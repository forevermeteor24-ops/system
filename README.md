# 电商物流配送可视化平台
本项目是一个完整的电商物流配送可视化平台，包含 **商家端、用户端、管理台前端界面**，以及 **Node.js 后端、WebSocket 服务、轨迹模拟器**。平台支持 **订单管理、实时配送追踪、地图可视化、轨迹回放、数据看板** 等功能。

---

## 🏗 项目目录结构
```
/project-root
  /client             
    /src
      /pages
      /components
      /hooks
      /services        
      /maps            
      /charts
  /server             
    /src
      /api
      /ws
      /simulator       
      /models
      /utils
  /scripts
  docker-compose.yml
  README.md
```

---

## 📁 文件夹作用说明

### `/client` —— React 前端（商家端 + 用户端 + 管理台）
| 文件夹 | 作用 |
|-------|------|
| `/pages` | 页面级组件（订单页面、地图页面、后台管理页面等） |
| `/components` | 可复用 UI 组件（导航栏、订单卡片、地图组件等） |
| `/hooks` | 自定义业务 Hook，如 WebSocket 管理、数据加载 |
| `/services` | REST API 与 WebSocket 客户端封装 |
| `/maps` | 地图相关工具，如轨迹绘制、点标绘、区域可视化 |
| `/charts` | 数据可视化图表（订单量、配送效率等） |

---

### `/server` —— Node.js 后端服务
| 文件夹 | 作用 |
|-------|------|
| `/api` | 订单、配送、用户等 REST API |
| `/ws` | WebSocket 服务，用于实时推送骑手位置 |
| `/simulator` | 配送轨迹模拟器，自动生成演示数据 |
| `/models` | 数据库模型（订单、轨迹、用户等） |
| `/utils` | 通用工具，如经纬度计算、配置读取 |

---

### `/scripts`
- 自动化脚本，如初始化数据库、生成模拟数据。

---

### `docker-compose.yml`
用于快速启动完整项目环境，包括：
- Node.js 后端
- 前端开发环境
- 数据库（如 MongoDB / PostgreSQL）
- 轨迹模拟器

---

## 🚀 功能特性

### ✅ 前端功能
- 商家订单管理  
- 用户订单查询与实时配送可视化  
- 管理台数据看板  
- 地图展示配送路线、轨迹回放  
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
- Mapbox / Leaflet  
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
cd client
npm install
npm run dev
```

#### 3. 启动轨迹模拟器（可选）
```
cd server
npm run simulate
```

---

## 📡 WebSocket 事件定义（示例）
```
delivery/update   # 推送骑手实时位置点
delivery/finish   # 配送结束
order/update      # 订单状态更新
```

---

## 📜 License
MIT License
