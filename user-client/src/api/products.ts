// src/api/products.ts

import axios from 'axios';

// 获取指定商家的商品列表
export const fetchProductsByMerchant = async (merchantId: string) => {
  try {
    const response = await axios.get(`/api/merchants/${merchantId}/products`);
    return response.data;
  } catch (error) {
    console.error('获取商品列表失败:', error);
    throw new Error('无法获取商品列表');
  }
};
