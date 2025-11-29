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

async function main() {
  await connectDB();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // 正确顺序
  app.use("/api/auth", authRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/merchants", merchantRoutes);

  // ❌ 不要这个：app.use("/api/userRoute", userRoute);
  // 因为 /me 已经放到了 authRoutes

  const server = http.createServer(app);
  setupWS(server);

  const PORT = 8080;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

main();
