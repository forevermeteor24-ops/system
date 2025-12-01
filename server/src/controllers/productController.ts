// server/src/controllers/productController.ts
import ProductModel from "../models/productModel";
import { Request, Response } from "express";

// 创建商品
export const createProduct = async (req: Request, res: Response) => {
  const { name, price } = req.body;
  const merchantId = req.user?.userId; // 获取当前商家的ID

  if (!name || !price) {
    return res.status(400).json({ error: "商品名称和价格不能为为空" });
  }

  try {
    // 创建新商品
    const newProduct = new ProductModel({ name, price, merchantId });
    await newProduct.save();
    return res.status(201).json(newProduct); // 商品创建成功，返回新商品
  } catch (err: unknown) {
    // 错误处理：确保err是Error类型
    if (err instanceof Error) {
      return res.status(500).json({ error: "商品创建失败", detail: err.message });
    }
    return res.status(500).json({ error: "商品创建失败", detail: "未知错误" });
  }
};

// 获取商家的商品，支持排序（按价格或创建时间）
export const getProductsByMerchant = async (req: Request, res: Response) => {
  const merchantId = req.user?.userId; // 获取当前商家的ID
  const { sortBy } = req.query; // 获取排序字段（price 或 createdAt）

  // 调试信息：打印商家 ID 和排序字段
  console.log("Merchant ID:", merchantId);  // 打印商家ID
  console.log("Sort By:", sortBy);  // 打印排序字段

  try {
    // 默认按照时间降序排序
    let sortOption: any = { createdAt: -1 };

    // 判断排序字段并设置排序选项
    if (sortBy === "price_asc") {
      sortOption = { price: 1 }; // 按价格升序排序
    } else if (sortBy === "price_desc") {
      sortOption = { price: -1 }; // 按价格降序排序
    } else if (sortBy === "time_asc") {
      sortOption = { createdAt: 1 }; // 按时间升序排序
    }

    // 打印排序选项
    console.log("Sort Option:", sortOption);  // 打印排序选项

    // 查找该商家的所有商品并排序
    const products = await ProductModel.find({ merchantId }).sort(sortOption);

    // 打印查询结果
    console.log("Fetched Products:", products);  // 打印获取到的商品

    return res.json(products);
  } catch (err: unknown) {
    // 错误处理：确保err是Error类型
    if (err instanceof Error) {
      console.error("获取商品失败:", err.message);  // 打印错误信息
      return res.status(500).json({ error: "获取商品失败", detail: err.message });
    }
    console.error("获取商品失败: 未知错误");
    return res.status(500).json({ error: "获取商品失败", detail: "未知错误" });
  }
};


// 更新商品
export const updateProduct = async (req: Request, res: Response) => {
    const { id } = req.params;  // 商品ID
    const { name, price } = req.body;  // 商品的名称和价格
  
    const merchantId = req.user?.userId;  // 获取当前商家的ID
  
    try {
      // 查找商品是否存在且商家ID匹配
      const product = await ProductModel.findOne({ _id: id, merchantId });
  
      if (!product) {
        return res.status(404).json({ error: "商品不存在或无权编辑该商品" });
      }
  
      // 更新商品名称和价格
      if (name) product.name = name;
      if (price) product.price = price;
  
      // 保存更新后的商品
      await product.save();
  
      return res.status(200).json(product);
    } catch (err: any) {
      console.error("更新商品失败:", err);
      return res.status(500).json({ error: "更新商品失败", detail: err.message });
    }
  };
  

// 删除商品
export const deleteProduct = async (req: Request, res: Response) => {
    const { id } = req.params; // 获取商品的ID
    const merchantId = req.user?.userId; // 获取当前商家的ID
  
    try {
      // 查找商品是否存在，并且商家ID是否匹配
      const product = await ProductModel.findOne({ _id: id, merchantId });
  
      if (!product) {
        return res.status(404).json({ error: "商品不存在或您没有权限删除此商品" });
      }
  
      // 使用 deleteOne 方法删除商品
      await ProductModel.deleteOne({ _id: id });
  
      return res.status(200).json({ message: "商品已删除" });
    } catch (err: unknown) {
      // 错误处理：确保err是Error类型
      if (err instanceof Error) {
        return res.status(500).json({ error: "删除商品失败", detail: err.message });
      }
      return res.status(500).json({ error: "删除商品失败", detail: "未知错误" });
    }
  };
  
  