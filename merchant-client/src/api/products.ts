import http from './http';  // 假设 http 是封装的 axios 实例

// 获取商家的所有商品
export const fetchProductsByMerchant = async (merchantId: string) => {
  // 获取指定商家 ID 的商品列表
  const response = await http.get(`/api/merchants/${merchantId}/products`);
  return response.data;
};

// 获取单个商品
export const fetchProductById = async (id: string) => {
  const response = await http.get(`/api/products/${id}`);
  return response.data;
};

// 创建商品
export const createProduct = async (product: { name: string, price: number }) => {
  const response = await http.post('/api/products', product);
  return response.data;
};

// 更新商品
export const updateProduct = async (id: string, product: { name: string, price: number }) => {
  const response = await http.put(`/api/products/${id}`, product);
  return response.data;
};

// 删除商品
export const deleteProduct = async (id: string) => {
  const response = await http.delete(`/api/products/${id}`);
  return response.data;
};
