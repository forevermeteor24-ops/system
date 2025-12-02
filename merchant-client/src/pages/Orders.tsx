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

  const [productToEdit, setProductToEdit] = useState<ProductItem | null>(null);
  const [newProduct, setNewProduct] = useState<{ name: string; price: number }>({
    name: "",
    price: 0,
  });

  useEffect(() => {
    const id = localStorage.getItem("merchantId");
    if (!id) {
      navigate("/login");
      return;
    }
    setMerchantId(id);
  }, [navigate]);

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
  const openCreateModal = () => {
    setProductToEdit(null);
    setNewProduct({ name: "", price: 0 });
    setShowProductModal(true);
  };

  const openEditModal = (p: ProductItem) => {
    setProductToEdit({ ...p }); // clone
    setShowProductModal(true);
  };

  const handleCreateProduct = async () => {
    if (!newProduct.name || !newProduct.price) {
      return alert("请输入商品名称和价格");
    }

    try {
      const payload = { ...newProduct, merchantId } as any;
      const created = await createProduct(payload);
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

  return (
    <div className="merchant-dashboard">
      <header className="header">
        <h2>商家后台</h2>
        <div>
          <button onClick={() => navigate("/dashboard")} className="btn btn-primary">
            数据可视化看板
          </button>
          <button
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("merchantId");
              navigate("/login");
            }}
            className="btn btn-secondary"
          >
            退出登录
          </button>
        </div>
      </header>

      <p className="merchant-id">商家ID：{merchantId}</p>

      <section className="products-section">
        <h3>商品管理</h3>
        <button className="btn btn-primary" onClick={openCreateModal}>创建商品</button>
        <div className="product-list">
          {products.length === 0 ? (
            <p>暂无商品</p>
          ) : (
            products.map((p) => (
              <div key={p._id} className="product-card">
                <div className="product-info">
                  <strong>{p.name}</strong> — ¥{p.price}
                </div>
                <div className="product-actions">
                  <button className="btn btn-warning" onClick={() => openEditModal(p)}>编辑</button>
                  <button className="btn btn-danger" onClick={() => handleDeleteProduct(p._id)}>删除</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="orders-section">
        <h3>订单管理</h3>
        {orders.length === 0 ? (
          <p>暂无订单</p>
        ) : (
          orders.map((o) => (
            <div key={o._id} className="order-card">
              <div className="order-info">
                <strong>{o.title}</strong>
                <div>数量：{o.quantity}，单价：¥{o.price}，总价：¥{o.totalPrice}</div>
                <div>地址：{o.address?.detail}</div>
              </div>
              <div className="order-actions">
                <div>状态：{o.status}</div>
                <div className="order-btns">
                  {o.status === "待发货" && <button className="btn btn-success" onClick={() => doShip(o._id)}>发货</button>}
                  {o.status === "用户申请退货" && <button className="btn btn-danger" onClick={() => doCancelByMerchant(o._id)}>取消订单</button>}
                  {(o.status === "已送达" || o.status === "商家已取消") && <button className="btn btn-danger" onClick={() => doDelete(o._id)}>删除</button>}
                  <Link to={`/order/${o._id}`} className="btn btn-info">查看详情</Link>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      {/* 商品创建/编辑弹窗 */}
      {showProductModal && (
        <div className="modal-overlay">
          <div className="modal">
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

                <div className="modal-actions">
                  <button className="btn btn-success" onClick={handleUpdateProduct}>保存</button>
                  <button className="btn btn-secondary" onClick={() => { setShowProductModal(false); setProductToEdit(null); }}>
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

                <div className="modal-actions">
                  <button className="btn btn-success" onClick={handleCreateProduct}>创建</button>
                  <button className="btn btn-secondary" onClick={() => { setShowProductModal(false); setNewProduct({ name: "", price: 0 }); }}>
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
