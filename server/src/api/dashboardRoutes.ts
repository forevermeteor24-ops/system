import { Router } from "express";
import { getOrderHeatmap, getDeliveryTimeStats, getAbnormalOrders } from "../controllers/dashboardController";
import { auth } from "../middleware/authMiddleware";
import { Request, Response } from "express";  // 导入类型定义

const router = Router();
router.get("/ping", (req: Request, res: Response)=>{
  res.send("dashboard alive");
});

// 使用明确的类型定义
router.get("/heatmap", (req: Request, res: Response) => {
  console.log("请求到达热力图接口");
  getOrderHeatmap(req, res);
});

router.get("/delivery-stats", (req: Request, res: Response) => {
  console.log("请求到达配送时效接口");
  getDeliveryTimeStats(req, res);
});

router.get("/abnormal-orders", (req: Request, res: Response) => {
  console.log("请求到达异常订单接口");
  getAbnormalOrders(req, res);
});

export default router;
