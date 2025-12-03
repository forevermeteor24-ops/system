import { Router } from "express";
import { getOrderHeatmap, getDeliveryTimeStats, getAbnormalOrders } from "../controllers/dashboardController";
import { auth } from "../middleware/authMiddleware"; // 确保导入
import { Request, Response } from "express";

const router = Router();

// /ping 通常用于检查服务是否存活，可以不加权限验证（公开）
router.get("/ping", (req: Request, res: Response)=>{
  res.send("dashboard alive");
});

// ⬇️ 下面这些涉及敏感数据的接口，必须加上 auth
// 假设只有商家(merchant)能看看板
router.get("/heatmap", auth(["merchant"]), (req: Request, res: Response) => {
  // 加上 auth 后，req.user 就有值了，控制器里才能过滤数据
  console.log("请求到达热力图接口，当前用户:", req.user?.userId); 
  getOrderHeatmap(req, res);
});

router.get("/delivery-stats", auth(["merchant"]), (req: Request, res: Response) => {
  console.log("请求到达配送时效接口");
  getDeliveryTimeStats(req, res);
});

router.get("/abnormal-orders", auth(["merchant"]), (req: Request, res: Response) => {
  console.log("请求到达异常订单接口");
  getAbnormalOrders(req, res);
});

export default router;