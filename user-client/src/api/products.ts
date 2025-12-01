// src/api/products.ts
import http from "./http"

// 获取商家的所有商品
export const fetchProductsByMerchant = async (merchantId: string) => {
  // 获取指定商家 ID 的商品列表
  const response = await http.get(`/api/products/${merchantId}/products`);
  return response.data;
};


