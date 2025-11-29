import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import http from "http";
import orderRoutes from "./api/orderRoutes";
import { setupWS } from "./ws";
import { connectDB } from "./config/db";
import authRoutes from "./api/authRoutes";
import merchantRoutes from "./api/merchantRoutes";
import userRoute from "./api/userRoutes";

async function main() {
  await connectDB(); // 连接 MongoDB

  const app = express();
  app.use(cors());
  app.use(express.json());

  // 挂载 API
  app.use("/api/orders", orderRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/merchants", merchantRoutes);
  app.use("/api/userRoute",userRoute);

  // 创建 HTTP + WebSocket
  const server = http.createServer(app);
  setupWS(server); // 启动 WebSocket 服务

  const PORT = 8080;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

main();
