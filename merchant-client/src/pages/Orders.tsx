import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchOrders, updateStatus, shipOrder, deleteOrder, type Order } from "../api/orders";
import { fetchProductsByMerchant, createProduct, updateProduct, deleteProduct } from "../api/products";

export default function MerchantHome() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<"time" | "price">("time");

  const [products, setProducts] = useState<any[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productToEdit, setProductToEdit] = useState<any>(null);
  const [newProduct, setNewProduct] = useState<{ name: string; price: number }>({ name: "", price: 0 });
  const [merchantId, setMerchantId] = useState<string>(""); // 当前商家的 ID

  /* ----------------------- 加载订单 ----------------------- */
  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await fetchOrders();
      setOrders(sortOrders(data, sortField));
    } catch (err) {
      console.error(err);
      alert("获取订单失败，请查看控制台");
    } finally {
      setLoading(false);
    }
  };

  /* ----------------------- 排序函数 ----------------------- */
  const sortOrders = (list: Order[], field: "time" | "price") => {
    if (field === "price") {
      return [...list].sort((a, b) => a.price - b.price);
    }
    return [...list].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  };

  const onSortChange = (field: "time" | "price") => {
    setSortField(field);
    setOrders(sortOrders(orders, field));
  };

  useEffect(() => {
    loadOrders();
  }, []);

  /* ----------------------- 商家操作 ----------------------- */
  const doShip = async (id: string) => {
    if (!confirm("确认发货？路线自动规划并开始配送轨迹模拟。")) return;
    await shipOrder(id);
    loadOrders();
  };

  const doCancelByMerchant = async (id: string) => {
    if (!confirm("确认取消订单？（仅限用户申请退货）")) return;
    await updateStatus(id, "商家已取消");
    loadOrders();
  };

  const doDelete = async (id: string) => {
    if (!confirm("确认删除订单？")) return;
    await deleteOrder(id);
    loadOrders();
  };

  /* ----------------------- 商品管理操作 ----------------------- */
  const loadProducts = async () => {
    try {
      // 获取商家的商品列表，需要传递商家ID
      const data = await fetchProductsByMerchant(merchantId);
      console.log(data); // 添加日志查看返回数据
      setProducts(data);
    } catch (err) {
      console.error(err);
      alert("获取商品失败，请查看控制台");
    }
  };

  useEffect(() => {
    if (merchantId) {
      loadProducts();  // 在选择商家时加载商品列表
    }
  }, [merchantId]);  // 监听 merchantId 变化

  const handleCreateProduct = async () => {
    if (!newProduct.name || !newProduct.price) {
      return alert("请输入商品名称和价格");
    }

    try {
      await createProduct(newProduct);
      setShowProductModal(false);
      loadProducts();  // 创建商品后刷新商品列表
    } catch (err) {
      console.error("创建商品失败", err);
      alert("创建商品失败");
    }
  };

  const handleUpdateProduct = async () => {
    if (!productToEdit?.name || !productToEdit?.price) {
      return alert("请输入商品名称和价格");
    }

    try {
      await updateProduct(productToEdit._id, productToEdit);
      setShowProductModal(false);
      loadProducts();  // 更新商品后刷新商品列表
    } catch (err) {
      console.error("更新商品失败", err);
      alert("更新商品失败");
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm("确认删除此商品？")) {
      try {
        await deleteProduct(id);
        loadProducts();  // 删除商品后刷新商品列表
      } catch (err) {
        console.error("删除商品失败", err);
        alert("删除商品失败");
      }
    }
  };

  const handleModalClose = () => {
    setShowProductModal(false);
    setProductToEdit(null);
    setNewProduct({ name: "", price: 0 });
  };

  const handleProductChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (productToEdit) {
      setProductToEdit({ ...productToEdit, [name]: value });
    } else {
      setNewProduct({ ...newProduct, [name]: value });
    }
  };

  /* ----------------------- 退出登录 ----------------------- */
  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  /* ----------------------- 渲染 ----------------------- */
  return (
    <div style={{ padding: 20 }}>
      {/* 顶部标题 + 账户按钮 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>商家后台</h2>
        <button
          onClick={() => navigate("/merchant/profile")}
          style={{ padding: "6px 12px" }}
        >
          修改账户信息
        </button>
      </div>

      {/* 退出登录按钮 */}
      <button
        onClick={handleLogout}
        style={{
          marginBottom: 10,
          padding: "10px 14px",
          background: "#ff4d4d",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        退出登录
      </button>

      {/* 订单管理 */}
      <button onClick={loadOrders} style={{ marginBottom: 10 }}>
        刷新订单
      </button>

      {/* 商品管理 */}
      <button
        onClick={() => setShowProductModal(true)}
        style={{ marginBottom: 10 }}
      >
        创建商品
      </button>

      {/* 排序 */}
      <div style={{ margin: "12px 0" }}>
        排序：
        <select
          value={sortField}
          onChange={(e) => onSortChange(e.target.value as any)}
        >
          <option value="time">按创建时间（新 → 旧）</option>
          <option value="price">按价格（低 → 高）</option>
        </select>
      </div>

      {/* 订单区域 */}
      {loading ? (
        <div>加载中...</div>
      ) : orders.length === 0 ? (
        <div>暂无订单。</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {orders.map((o) => (
            <div
              key={o._id}
              style={{
                padding: 12,
                borderRadius: 8,
                background: "#fff",
                boxShadow: "0 0 0 1px #eee",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{o.title}</strong>
                <small>{new Date(o.createdAt).toLocaleString()}</small>
              </div>

              <div style={{ marginTop: 8 }}>
                <div>价格：¥{o.price}</div>
                <div>数量：{o.quantity}</div>
                <div>总价：¥{o.totalPrice}</div>
                <div>收货地址：{o.address.detail}</div>
                <div>状态：<em>{o.status}</em></div>
              </div>


              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <Link to={`/orders/${o._id}`}>查看详情</Link>
                {o.status === "待发货" && (
                  <button onClick={() => doShip(o._id)}>发货</button>
                )}
                {o.status === "用户申请退货" && (
                  <button onClick={() => doCancelByMerchant(o._id)}>
                    取消订单
                  </button>
                )}
                {(o.status === "已完成" || o.status === "商家已取消") && (
                  <button onClick={() => doDelete(o._id)}>删除订单</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 商品管理区域 */}
      <div>
        <h3>商品管理</h3>
        <div>
          {products.map((product) => (
            <div key={product._id}>
              <span>{product.name}</span> - <span>¥{product.price}</span>
              <button onClick={() => handleDeleteProduct(product._id)}>
                删除
              </button>
              <button
                onClick={() => {
                  setProductToEdit(product);
                  setShowProductModal(true);
                }}
              >
                编辑
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 商品编辑/创建弹窗 */}
      {showProductModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              width: 350,
              background: "#fff",
              padding: 20,
              borderRadius: 8,
            }}
          >
            <h3>{productToEdit ? "编辑商品" : "创建商品"}</h3>

            <div>
              <label>商品名称</label>
              <input
                type="text"
                name="name"
                value={productToEdit ? productToEdit.name : newProduct.name}
                onChange={handleProductChange}
              />
            </div>

            <div>
              <label>价格</label>
              <input
                type="number"
                name="price"
                value={productToEdit ? productToEdit.price : newProduct.price}
                onChange={handleProductChange}
              />
            </div>

            <button
              onClick={productToEdit ? handleUpdateProduct : handleCreateProduct}
            >
              {productToEdit ? "更新商品" : "创建商品"}
            </button>

            <button onClick={handleModalClose}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
