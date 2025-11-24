import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import http from "http";
import orderRoutes from "./api/orderRoutes";
import { setupWS } from "./ws";
import { connectDB } from "./config/db";

async function main() {
  await connectDB(); // 连接 MongoDB

  const app = express();
  app.use(cors());
  app.use(express.json());

  // 挂载 API
  app.use("/api/orders", orderRoutes);

  // 创建 HTTP + WebSocket
  const server = http.createServer(app);
  setupWS(server); // 启动 WebSocket 服务

  const PORT = 3000;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

main();
