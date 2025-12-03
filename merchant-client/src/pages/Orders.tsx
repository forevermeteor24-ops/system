import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchOrders, updateStatus, shipOrder, deleteOrder, type Order } from "../api/orders";
import { fetchProductsByMerchant, createProduct, updateProduct, deleteProduct } from "../api/products";

// === 类型定义 ===
type ProductItem = {
  _id: string;
  name: string;
  price: number;
  merchantId?: string;
};

// 排序选项类型
type SortOption = 'newest' | 'oldest' | 'price_high' | 'price_low';

// 订单状态常量
const ORDER_STATUSES = [
  "全部",
  "待发货",
  "配送中",
  "已送达",
  "已完成",
  "用户申请退货",
  "商家已取消"
];

export default function MerchantHome() {
  const navigate = useNavigate();
  
  // === 核心数据状态 ===
  const [merchantId, setMerchantId] = useState<string>("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);

  // === 视图控制状态 ===
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products'>('overview');
  
  // === 订单筛选与排序状态 ===
  const [filterStatus, setFilterStatus] = useState<string>("全部");
  const [sortOption, setSortOption] = useState<SortOption>('newest');

  // === 模态框状态 ===
  const [showProductModal, setShowProductModal] = useState(false);
  const [productToEdit, setProductToEdit] = useState<ProductItem | null>(null);
  const [newProduct, setNewProduct] = useState<{ name: string; price: number }>({ name: "", price: 0 });

  // === 初始化加载 ===
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
    loadAllData();
  }, [merchantId]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [pList, oList] = await Promise.all([
        fetchProductsByMerchant(merchantId),
        fetchOrders()
      ]);
      setProducts(pList);
      setOrders(oList);
    } catch (err) {
      console.error("加载数据失败", err);
      alert("加载数据失败");
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    try {
      const list = await fetchOrders();
      setOrders(list);
    } catch (err) { console.error(err); }
  };

  const loadProducts = async () => {
    try {
      const list = await fetchProductsByMerchant(merchantId);
      setProducts(list);
    } catch (err) { console.error(err); }
  }

  // === 计算属性：处理订单的过滤与排序 ===
  // 使用 useMemo 只有在相关数据变化时才重新计算，性能更好
  const displayedOrders = useMemo(() => {
    let result = [...orders];

    // 1. 过滤状态
    if (filterStatus !== "全部") {
      result = result.filter(o => o.status === filterStatus);
    }

    // 2. 排序逻辑
    result.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      const priceA = a.totalPrice || 0;
      const priceB = b.totalPrice || 0;

      switch (sortOption) {
        case 'newest': return timeB - timeA;
        case 'oldest': return timeA - timeB;
        case 'price_high': return priceB - priceA;
        case 'price_low': return priceA - priceB;
        default: return 0;
      }
    });

    return result;
  }, [orders, filterStatus, sortOption]);

  // === 数据统计 ===
  const stats = {
    pending: orders.filter(o => o.status === '待发货').length,
    revenue: orders.reduce((sum, o) => o.status !== '商家已取消' ? sum + (o.totalPrice || 0) : sum, 0),
    totalOrders: orders.length,
    productCount: products.length
  };

  // ... (保留之前的商品 CRUD 和订单操作函数，doShip, handleCreateProduct 等逻辑完全不变)
  const openCreateModal = () => { setProductToEdit(null); setNewProduct({ name: "", price: 0 }); setShowProductModal(true); };
  const openEditModal = (p: ProductItem) => { setProductToEdit({ ...p }); setShowProductModal(true); };
  const handleCreateProduct = async () => { /* ...原代码... */ 
    // 这里简化省略重复代码，逻辑同您之前的一样，只需要注意成功后调用 setProducts
    if (!newProduct.name || !newProduct.price) return alert("请输入完整信息");
    try {
      const payload = { ...newProduct, merchantId } as any;
      await createProduct(payload);
      setShowProductModal(false); 
      setNewProduct({ name: "", price: 0 });
      loadProducts();
    } catch(e) { alert("创建失败") }
  };
  const handleUpdateProduct = async () => { /* ...原代码... */ 
     if (!productToEdit) return;
     try {
       const payload = { name: productToEdit.name, price: Number(productToEdit.price), merchantId };
       await updateProduct(productToEdit._id, payload as any);
       setShowProductModal(false); setProductToEdit(null);
       loadProducts();
     } catch(e) { alert("更新失败") }
  };
  const handleDeleteProduct = async (id: string) => { /* ...原代码... */
     if(!confirm("确认删除?")) return;
     await deleteProduct(id);
     setProducts(ps => ps.filter(p => p._id !== id));
  };
  const doShip = async (id: string) => { 
     if(!confirm("确认发货?")) return;
     await shipOrder(id); loadOrders(); 
  };
  const doCancelByMerchant = async (id: string) => { 
     if(!confirm("确认取消?")) return;
     await updateStatus(id, "商家已取消"); loadOrders(); 
  };
  const doDelete = async (id: string) => { 
    if(!confirm("删除?")) return;
    await deleteOrder(id); setOrders(os => os.filter(o => o._id !== id));
  };

  // 表单输入处理
  const onNewProductChange = (e: any) => setNewProduct({...newProduct, [e.target.name]: e.target.value});
  const onEditProductChange = (e: any) => productToEdit && setProductToEdit({...productToEdit, [e.target.name]: e.target.value});


  return (
    <div className="merchant-dashboard" style={styles.page}>
      {/* 顶栏 */}
      <header style={styles.navbar}>
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
          <h2 style={{margin:0}}>商家工作台</h2>
          <span style={styles.badge}>ID: {merchantId}</span>
        </div>
        <button
          style={{ ...styles.btn, background: "#ff4d4f" }}
          onClick={() => {
            localStorage.removeItem("token");
            localStorage.removeItem("merchantId");
            navigate("/login");
          }}
        >
          退出登录
        </button>
      </header>

      {/* 主选项卡导航 */}
      <div style={styles.tabContainer}>
        <button 
          style={activeTab === 'overview' ? styles.tabActive : styles.tab} 
          onClick={() => setActiveTab('overview')}
        >
          数据概览
        </button>
        <button 
          style={activeTab === 'orders' ? styles.tabActive : styles.tab} 
          onClick={() => setActiveTab('orders')}
        >
          订单管理
        </button>
        <button 
          style={activeTab === 'products' ? styles.tabActive : styles.tab} 
          onClick={() => setActiveTab('products')}
        >
          商品管理
        </button>
      </div>

      <div style={styles.contentArea}>
        {loading ? <div style={{padding:'40px', textAlign:'center', color:'#888'}}>数据加载中...</div> : (
          <>
            {/* ---------------- 视图 1: 数据概览 ---------------- */}
            {activeTab === 'overview' && (
              <div style={styles.gridContainer}>
                <div style={{...styles.card, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color:'white'}}>
                  <h3>总收入预估</h3>
                  <div style={{fontSize:'32px', fontWeight:'bold'}}>¥{stats.revenue.toFixed(2)}</div>
                </div>
                <div style={{...styles.card, background: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)', color:'#fff'}}>
                  <h3>待发货订单</h3>
                  <div style={{fontSize:'32px', fontWeight:'bold'}}>{stats.pending}</div>
                  <div style={{fontSize:'12px', opacity:0.8}}>需要尽快处理</div>
                </div>
                <div style={{...styles.card, background: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)', color:'#333'}}>
                  <h3>在售商品</h3>
                  <div style={{fontSize:'32px', fontWeight:'bold'}}>{stats.productCount}</div>
                </div>
                <div style={{...styles.card, background:'white'}}>
                  <h3>订单总数</h3>
                  <div style={{fontSize:'32px', fontWeight:'bold', color:'#333'}}>{stats.totalOrders}</div>
                </div>
              </div>
            )}

            {/* ---------------- 视图 2: 订单管理 (核心修改) ---------------- */}
            {activeTab === 'orders' && (
              <div>
                {/* 筛选与排序工具栏 */}
                <div style={styles.toolbar}>
                  {/* 左侧：状态筛选 */}
                  <div style={styles.filterGroup}>
                    {ORDER_STATUSES.map(status => (
                      <button
                        key={status}
                        onClick={() => setFilterStatus(status)}
                        style={filterStatus === status ? styles.filterBtnActive : styles.filterBtn}
                      >
                        {status}
                      </button>
                    ))}
                  </div>

                  {/* 右侧：排序下拉框 */}
                  <div style={styles.sortGroup}>
                    <label style={{fontSize:'14px', color:'#666'}}>排序：</label>
                    <select 
                      value={sortOption} 
                      onChange={(e) => setSortOption(e.target.value as SortOption)}
                      style={styles.selectInput}
                    >
                      <option value="newest">📅 下单时间 (新→旧)</option>
                      <option value="oldest">📅 下单时间 (旧→新)</option>
                      <option value="price_high">💰 金额 (高→低)</option>
                      <option value="price_low">💰 金额 (低→高)</option>
                    </select>
                  </div>
                </div>

                {/* 订单列表 */}
                <div style={styles.listContainer}>
                  {displayedOrders.length === 0 ? (
                    <div style={styles.emptyMsg}>在此条件下暂无订单</div>
                  ) : (
                    displayedOrders.map((o) => (
                      <div key={o._id} style={styles.orderItem}>
                        <div style={styles.orderHeader}>
                           <div>
                             <span style={{fontWeight:'bold', fontSize:'16px'}}>{o.title}</span>
                             <span style={{color:'#999', fontSize:'12px', marginLeft:'10px'}}>
                               {new Date(o.createdAt || Date.now()).toLocaleString()}
                             </span>
                           </div>
                           <span style={styles.statusBadge(o.status)}>{o.status}</span>
                        </div>
                        <div style={styles.orderBody}>
                          <div style={{color:'#666'}}>
                             <div>单价: ¥{o.price} × 数量: {o.quantity}</div>
                             <div style={{marginTop:'5px'}}>地址: {o.address?.detail}</div>
                          </div>
                          <div style={{fontSize:'18px', fontWeight:'bold', color:'#333'}}>
                             ¥{o.totalPrice?.toFixed(2)}
                          </div>
                        </div>
                        <div style={styles.orderFooter}>
                          <div style={{display:'flex', gap:'10px'}}>
                            {o.status === "待发货" && (
                              <button style={styles.btnPrimary} onClick={() => doShip(o._id)}>立即发货</button>
                            )}
                            {o.status === "用户申请退货" && (
                              <button style={styles.btnDanger} onClick={() => doCancelByMerchant(o._id)}>同意退款并取消</button>
                            )}
                            {(o.status === "已送达" || o.status === "商家已取消" || o.status === "已完成") && (
                              <button style={styles.btnGhost} onClick={() => doDelete(o._id)}>删除记录</button>
                            )}
                          </div>
                          <Link to={`/order/${o._id}`} style={styles.linkBtn}>查看详情 →</Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ---------------- 视图 3: 商品管理 ---------------- */}
            {activeTab === 'products' && (
              <div>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px'}}>
                   <h3 style={{margin:0}}>商品列表 ({products.length})</h3>
                   <button style={styles.btnSuccess} onClick={openCreateModal}>+ 新建商品</button>
                </div>
                
                <div style={styles.productList}>
                  {products.length === 0 ? (
                    <p style={styles.emptyMsg}>暂无商品，快去添加吧</p>
                  ) : (
                    products.map((p) => (
                      <div key={p._id} style={styles.productCard}>
                        <div style={styles.productIcon}>🛍️</div>
                        <div style={{marginBottom:'10px', textAlign:'center'}}>
                          <div style={{fontWeight:'bold', marginBottom:'5px'}}>{p.name}</div>
                          <div style={{color:'#f56a00', fontWeight:'bold'}}>¥{p.price}</div>
                        </div>
                        <div style={{display:'flex', gap:'5px', width:'100%'}}>
                          <button style={{...styles.btnGhost, flex:1}} onClick={() => openEditModal(p)}>编辑</button>
                          <button style={{...styles.btnDangerGhost, flex:1}} onClick={() => handleDeleteProduct(p._id)}>下架</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 弹窗部分保持不变，仅更新 style 引用 */}
      {showProductModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={{marginTop:0}}>{productToEdit ? "编辑商品" : "创建商品"}</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>名称</label>
              <input name="name" value={productToEdit ? productToEdit.name : newProduct.name} 
                 onChange={productToEdit ? onEditProductChange : onNewProductChange} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>价格</label>
              <input name="price" type="number" value={productToEdit ? productToEdit.price : newProduct.price}
                 onChange={productToEdit ? onEditProductChange : onNewProductChange} style={styles.input} />
            </div>
            <div style={styles.modalActions}>
              <button style={styles.btnGhost} onClick={() => setShowProductModal(false)}>取消</button>
              <button style={styles.btnPrimary} onClick={productToEdit ? handleUpdateProduct : handleCreateProduct}>
                {productToEdit ? "保存修改" : "确认创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === 增强版样式表 ===
const styles: Record<string, any> = {
  page: { padding: "20px", fontFamily: "'Segoe UI', Roboto, sans-serif", background: "#f3f4f6", minHeight: "100vh" },
  navbar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "#ffffff", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: "20px" },
  badge: { background: "#e6f7ff", color: "#1890ff", padding: "2px 8px", borderRadius: "4px", fontSize: "12px" },
  
  // Tabs
  tabContainer: { display: 'flex', gap: '10px', marginBottom: '20px' },
  tab: { padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '16px', color: '#666', fontWeight: 500, borderRadius: '8px' },
  tabActive: { padding: '10px 20px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '16px', color: '#1890ff', fontWeight: 'bold', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' },
  
  // Content Area
  contentArea: { background: '#fff', borderRadius: '12px', padding: '25px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', minHeight: '500px' },
  
  // Toolbar (Filter & Sort)
  toolbar: { display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #eee' },
  filterGroup: { display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '5px' },
  filterBtn: { padding: '6px 12px', border: '1px solid #eee', background: '#fff', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', color: '#666', whiteSpace:'nowrap' },
  filterBtnActive: { padding: '6px 12px', border: '1px solid #1890ff', background: '#e6f7ff', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', color: '#1890ff', fontWeight: 'bold', whiteSpace:'nowrap' },
  sortGroup: { display: 'flex', alignItems: 'center', gap: '10px', alignSelf: 'flex-end' },
  selectInput: { padding: '6px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' },

  // Orders List
  listContainer: { display: 'flex', flexDirection: 'column', gap: '15px' },
  orderItem: { border: '1px solid #eee', borderRadius: '10px', padding: '20px', transition: 'all 0.2s', background: '#fff' },
  orderHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '15px', borderBottom: '1px solid #f9f9f9', paddingBottom: '10px' },
  orderBody: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' },
  orderFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px' },
  statusBadge: (status: string) => {
    const map: any = { "待发货": "#fa8c16", "已送达": "#52c41a", "已完成": "#13c2c2", "配送中": "#1890ff", "商家已取消": "#999", "用户申请退货": "#f5222d" };
    return { background: map[status] || '#eee', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '12px' }
  },

  // Grid / Cards
  gridContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' },
  card: { padding: '25px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', display:'flex', flexDirection:'column', justifyContent:'center' },
  
  // Product Grid
  productList: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "20px" },
  productCard: { border: '1px solid #eee', borderRadius: '10px', padding: '15px', display:'flex', flexDirection:'column', alignItems:'center' },
  productIcon: { fontSize: '40px', marginBottom: '10px', background: '#f0f5ff', width: '80px', height: '80px', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '50%' },

  // Buttons & Forms
  btn: { padding: "8px 16px", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" },
  btnPrimary: { background: "#1890ff", color: "white", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer" },
  btnSuccess: { background: "#52c41a", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: '14px' },
  btnDanger: { background: "#ff4d4f", color: "white", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer" },
  btnGhost: { background: "transparent", color: "#666", border: "1px solid #ddd", padding: "6px 12px", borderRadius: "6px", cursor: "pointer" },
  btnDangerGhost: { background: "transparent", color: "#ff4d4f", border: "1px solid #ffa39e", padding: "6px 12px", borderRadius: "6px", cursor: "pointer" },
  linkBtn: { color: "#1890ff", textDecoration: 'none', fontSize: '14px' },

  // Modal
  modalOverlay: { position: "fixed" as "fixed", top: "0", left: "0", width: "100%", height: "100%", background: "rgba(0, 0, 0, 0.4)", display: "flex", justifyContent: "center", alignItems: "center", backdropFilter: 'blur(3px)', zIndex: 100 },
  modal: { background: "white", padding: "30px", borderRadius: "12px", width: "400px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)" },
  formGroup: { marginBottom: '15px' },
  label: { display: 'block', marginBottom: '5px', color: '#666', fontSize: '14px' },
  input: { width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
  modalActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' },
  emptyMsg: { textAlign: 'center' as 'center', padding: '40px', color: '#999', fontSize: '15px' },
};