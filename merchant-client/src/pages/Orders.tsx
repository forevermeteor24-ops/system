import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchOrders,
  updateStatus,
  shipOrder,
  deleteOrder,
  type Order,
} from "../api/orders";
import {
  fetchProductsByMerchant,
  createProduct,
  updateProduct,
  deleteProduct,
  // 你项目里可能没有导出 Product 类型，这里假设没有也没关系
} from "../api/products";

type ProductItem = {
  _id: string;
  name: string;
  price: number;
  merchantId?: string;
};

export default function MerchantHome() {
  const navigate = useNavigate();

  const [merchantId, setMerchantId] = useState<string>("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [showProductModal, setShowProductModal] = useState(false);

  // 编辑态或创建态复用
  const [productToEdit, setProductToEdit] = useState<ProductItem | null>(null);
  const [newProduct, setNewProduct] = useState<{ name: string; price: number }>({
    name: "",
    price: 0,
  });

  // 读取 merchantId（登录时应已写入 localStorage）
  useEffect(() => {
    const id = localStorage.getItem("merchantId");
    if (!id) {
      navigate("/login");
      return;
    }
    setMerchantId(id);
  }, [navigate]);

  // merchantId 可用后加载数据
  useEffect(() => {
    if (!merchantId) return;
    loadProducts();
    loadOrders();
  }, [merchantId]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const list = await fetchProductsByMerchant(merchantId);
      setProducts(list);
    } catch (err) {
      console.error("加载商品失败", err);
      alert("加载商品失败，请查看控制台");
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      // 你的 orders API 可能不需要 merchantId；若需要则传 merchantId
      // const list = await fetchOrders(merchantId);
      const list = await fetchOrders();
      setOrders(list);
    } catch (err) {
      console.error("加载订单失败", err);
      alert("加载订单失败，请查看控制台");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- 商品操作 ---------------- */
  // 打开创建弹窗
  const openCreateModal = () => {
    setProductToEdit(null);
    setNewProduct({ name: "", price: 0 });
    setShowProductModal(true);
  };

  // 打开编辑弹窗（把后端的 product 塞进编辑态）
  const openEditModal = (p: ProductItem) => {
    setProductToEdit({ ...p }); // clone
    setShowProductModal(true);
  };

  // 创建商品（注意：断言为 any，避免 TS 报 merchantId 非法）
  const handleCreateProduct = async () => {
    if (!newProduct.name || !newProduct.price) {
      return alert("请输入商品名称和价格");
    }

    try {
      // 这里断言为 any，让 TS 放行 merchantId 字段
      const payload = { ...newProduct, merchantId } as any;
      const created = await createProduct(payload);
      // 如果 API 返回新商品对象，append；否则 reload
      if (created && created._id) {
        setProducts((ps) => [...ps, created]);
      } else {
        await loadProducts();
      }
      setShowProductModal(false);
      setNewProduct({ name: "", price: 0 });
    } catch (err) {
      console.error("创建商品失败", err);
      alert("创建商品失败");
    }
  };

  // 更新商品（同样做断言）
  const handleUpdateProduct = async () => {
    if (!productToEdit) return;
    if (!productToEdit.name || !productToEdit.price) {
      return alert("请输入商品名称和价格");
    }

    try {
      const payload = { name: productToEdit.name, price: Number(productToEdit.price), merchantId } as any;
      const updated = await updateProduct(productToEdit._id, payload);
      if (updated && updated._id) {
        setProducts((ps) => ps.map((p) => (p._id === updated._id ? updated : p)));
      } else {
        await loadProducts();
      }
      setShowProductModal(false);
      setProductToEdit(null);
    } catch (err) {
      console.error("更新商品失败", err);
      alert("更新商品失败");
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("确认删除此商品？")) return;
    try {
      await deleteProduct(id);
      setProducts((ps) => ps.filter((p) => p._id !== id));
    } catch (err) {
      console.error("删除商品失败", err);
      alert("删除商品失败");
    }
  };

  /* ---------------- 订单操作 ---------------- */
  const doShip = async (id: string) => {
    if (!confirm("确认发货？")) return;
    try {
      await shipOrder(id);
      await loadOrders();
    } catch (err) {
      console.error(err);
      alert("发货失败");
    }
  };

  const doCancelByMerchant = async (id: string) => {
    if (!confirm("确认取消订单？")) return;
    try {
      await updateStatus(id, "商家已取消");
      await loadOrders();
    } catch (err) {
      console.error(err);
      alert("取消订单失败");
    }
  };

  const doDelete = async (id: string) => {
    if (!confirm("确认删除订单？")) return;
    try {
      await deleteOrder(id);
      setOrders((os) => os.filter((o) => o._id !== id));
    } catch (err) {
      console.error(err);
      alert("删除订单失败");
    }
  };

  /* ---------------- 表单变化处理（保证 price 为 number） ---------------- */
  const onNewProductChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "price") {
      setNewProduct((s) => ({ ...s, price: Number(value) }));
    } else {
      setNewProduct((s) => ({ ...s, [name]: value }));
    }
  };

  const onEditProductChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!productToEdit) return;
    const { name, value } = e.target;
    setProductToEdit((p) => (p ? { ...p, [name]: name === "price" ? Number(value) : value } : p));
  };

  /* ---------------- 渲染 ---------------- */
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>商家后台</h2>
        <div>
          <button
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("merchantId");
              navigate("/login");
            }}
          >
            退出登录
          </button>
        </div>
      </div>

      <p>商家ID：{merchantId}</p>

      <section style={{ marginTop: 20 }}>
        <h3>商品管理</h3>
        <button onClick={openCreateModal}>创建商品</button>
        <div style={{ marginTop: 12 }}>
          {products.length === 0 ? (
            <p>暂无商品</p>
          ) : (
            products.map((p) => (
              <div key={p._id} style={{ padding: 8, border: "1px solid #eee", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{p.name}</strong> — ¥{p.price}
                  </div>
                  <div>
                    <button onClick={() => openEditModal(p)}>编辑</button>
                    <button onClick={() => handleDeleteProduct(p._id)} style={{ marginLeft: 8 }}>
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>订单管理</h3>
        {orders.length === 0 ? (
          <p>暂无订单</p>
        ) : (
          orders.map((o) => (
            <div key={o._id} style={{ padding: 10, border: "1px solid #eee", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <strong>{o.title}</strong>
                  <div>数量：{o.quantity}，单价：¥{o.price}，总价：¥{o.totalPrice}</div>
                  <div>地址：{o.address?.detail}</div>
                </div>
                <div>
                  <div>状态：{o.status}</div>
                  <div style={{ marginTop: 8 }}>
                    {o.status === "待发货" && <button onClick={() => doShip(o._id)}>发货</button>}
                    {o.status === "用户申请退货" && <button onClick={() => doCancelByMerchant(o._id)}>取消订单</button>}
                    {(o.status === "已送达" || o.status === "商家已取消") && <button onClick={() => doDelete(o._id)}>删除</button>}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      {/* 商品创建/编辑弹窗 */}
      {showProductModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
            zIndex: 9999,
          }}
        >
          <div style={{ background: "#fff", padding: 20, width: 360, borderRadius: 8 }}>
            <h3>{productToEdit ? "编辑商品" : "创建商品"}</h3>

            {productToEdit ? (
              <>
                <div>
                  <label>名称</label>
                  <input name="name" value={productToEdit.name} onChange={onEditProductChange} />
                </div>
                <div>
                  <label>价格</label>
                  <input name="price" type="number" value={productToEdit.price} onChange={onEditProductChange} />
                </div>

                <div style={{ marginTop: 12 }}>
                  <button onClick={handleUpdateProduct}>保存</button>
                  <button onClick={() => { setShowProductModal(false); setProductToEdit(null); }} style={{ marginLeft: 8 }}>
                    取消
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label>名称</label>
                  <input name="name" value={newProduct.name} onChange={onNewProductChange} />
                </div>
                <div>
                  <label>价格</label>
                  <input name="price" type="number" value={newProduct.price} onChange={onNewProductChange} />
                </div>

                <div style={{ marginTop: 12 }}>
                  <button onClick={handleCreateProduct}>创建</button>
                  <button onClick={() => { setShowProductModal(false); setNewProduct({ name: "", price: 0 }); }} style={{ marginLeft: 8 }}>
                    取消
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
