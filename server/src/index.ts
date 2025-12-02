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
import productRoutes from "./api/productRoutes"; // 引入 productRoutes
import dashboardRoutes from "./api/dashboardRoutes";

async function main() {
  await connectDB();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // 正确顺序
  app.use("/api/auth", authRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/merchants", merchantRoutes);
  app.use("/api/products", productRoutes);  // 挂载商品路由
  app.use("/api/dashboard", dashboardRoutes);

  const server = http.createServer(app);
  setupWS(server);

  const PORT = process.env.PORT || 8080;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

}

main();
