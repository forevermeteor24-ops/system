// server/src/routes/productRoutes.ts
import { Router } from "express";
import { createProduct, getProductsByMerchant, deleteProduct, updateProduct } from "../controllers/productController";
import { auth } from "../middleware/authMiddleware";

const router = Router();

// 创建商品
router.post("/", auth(["merchant"]), createProduct);

// 获取商家的商品，支持排序（按价格或创建时间），并且可以根据商家ID查询
router.get("/:merchantId/products", auth(["merchant", "user"]), getProductsByMerchant);

// 删除商品
router.delete("/:id", auth(["merchant"]), deleteProduct);

// 更新商品
router.put("/:id", auth(["merchant"]), updateProduct);

export default router;
