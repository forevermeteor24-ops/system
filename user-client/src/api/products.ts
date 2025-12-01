// src/api/products.ts

import axios from 'axios';
export const fetchProductsByMerchant = async (merchantId: string) => {
  try {
    const response = await axios.get(`/api/merchants/${merchantId}/products`);
    return response.data;
  } catch (error) {
    // 使用类型断言将 error 视为 Error 类型
    console.error('获取商品列表失败:', (error as Error).message);  // 访问 message
    throw new Error('无法获取商品列表');
  }
};

