import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
// 引入你现有的 API
import { fetchOrder, updateStatus, shipOrder, deleteOrder } from "../api/orders"; 
import { formatRemainingETA } from "../utils/formatETA";

// 声明 AMap 防止 TS 报错
declare const AMap: any;

export default function MerchantOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // --- 状态管理 ---
  const [order, setOrder] = useState<any>(null);
  const [remainingTime, setRemainingTime] = useState<string>("--");
  const [realtimeLabel, setRealtimeLabel] = useState<string>("");
  
  // ⭐ 新增：搜索框状态
  const [searchId, setSearchId] = useState(""); 
  
  // --- Refs ---
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [markerReady, setMarkerReady] = useState(false); 

  /* ---------------- 0. 搜索功能 ---------------- */
  const handleSearch = () => {
    if (!searchId.trim()) return;
    // 跳转到新 ID，React Router 会自动触发 useEffect 重新加载
    navigate(`/merchant/orders/${searchId.trim()}`);
    setSearchId(""); 
  };

  /* ---------------- 1. 加载数据 & 初始化地图 ---------------- */
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    // 切换订单时重置状态
    setOrder(null);
    setRemainingTime("--");
    setRealtimeLabel("");
    setMarkerReady(false);

    (async () => {
      try {
        const o = await fetchOrder(id);
        if (!mounted) return;
        setOrder(o);

        if (!mapRef.current) return;

        // 初始化地图 (单例模式)
        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new AMap.Map(mapRef.current, {
            zoom: 13,
            center: [121.47, 31.23],
            viewMode: "3D",
            mapStyle: "amap://styles/whitesmoke", // 若无自定义样式，可用 "amap://styles/normal"
          });
          mapInstanceRef.current.plugin(["AMap.MoveAnimation", "AMap.ToolBar", "AMap.Scale"], () => {
             // 控件放在右下角，避免遮挡左上角的收货人卡片
             mapInstanceRef.current.addControl(new AMap.ToolBar({ position: 'RB' }));
             mapInstanceRef.current.addControl(new AMap.Scale());
          });
        }

        const map = mapInstanceRef.current;
        const points = o.routePoints ?? [];

        // 清理旧覆盖物
        if (polylineRef.current) map.remove(polylineRef.current);
        if (markerRef.current) map.remove(markerRef.current);

        // 绘制路径和车辆
        if (points.length > 0) {
          const path = points.map((p: any) => new AMap.LngLat(p.lng, p.lat));
          const polyline = new AMap.Polyline({
            path,
            strokeWeight: 6,
            strokeColor: "#1890ff",
            lineJoin: 'round',
            showDir: true,
          });
          map.add(polyline);
          polylineRef.current = polyline;
          map.setFitView([polyline], true, [60, 60, 60, 60]); 

          const startPos = (o as any).trackState?.lastPosition 
            ? new AMap.LngLat((o as any).trackState.lastPosition.lng, (o as any).trackState.lastPosition.lat)
            : path[0];

          const carIcon = new AMap.Icon({
            size: new AMap.Size(52, 26),
            image: "https://cdn-icons-png.flaticon.com/512/3097/3097136.png", 
            imageSize: new AMap.Size(52, 26),
            imageOffset: new AMap.Pixel(0, 0)
          });

          const marker = new AMap.Marker({
            position: startPos,
            icon: carIcon,
            offset: new AMap.Pixel(-26, -13),
            zIndex: 100,
          });

          map.add(marker);
          markerRef.current = marker;
          setMarkerReady(true);
        }
      } catch (err) {
        console.error("加载失败", err);
        if (mounted) alert("未找到该订单或无权限查看");
      }
    })();

    return () => { mounted = false; };
  }, [id]);

// OrderDetail.tsx 中的 useEffect

/* ---------------- 2. WebSocket 追踪逻辑 (修复版) ---------------- */
useEffect(() => {
  // 只有在订单状态是“配送中”且地图marker已准备好时才连接
  if (!order || order.status !== "配送中" || !markerReady) return;

  if (wsRef.current) wsRef.current.close();
  const ws = new WebSocket("wss://system-backend.zeabur.app"); // 替换你的真实地址
  wsRef.current = ws;

  ws.onopen = () => {
    console.log("WS Connected");
    // 1. 先订阅
    ws.send(JSON.stringify({ type: "subscribe", orderId: order._id }));
    
    // 2. 关键修改：不要直接发送 start-track！
    // 而是发送 request-current 询问服务器：“这辆车现在在跑吗？”
    ws.send(JSON.stringify({ type: "request-current", orderId: order._id }));
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);

      // 情况 A：服务器说“内存里没这个车”（比如服务器昨晚重启了）
      // 这时候前端才负责发送启动指令，带上路径点
      if (msg.type === "no-track") {
         console.log("服务器无运行记录，正在恢复运行...");
         ws.send(JSON.stringify({ 
           type: "start-track", 
           orderId: order._id,
           points: order.routePoints 
         }));
      }

      // 情况 B：服务器说“车正在跑，这是当前状态”
      // 我们只需要把 marker 瞬移到最新位置，不需要从头开始
      if (msg.type === "current-state") {
         console.log("同步服务器当前状态", msg);
         if (msg.position && markerRef.current) {
            const pos = new AMap.LngLat(msg.position.lng, msg.position.lat);
            markerRef.current.setPosition(pos);
            // 还可以根据 msg.index 恢复一些进度条 UI
         }
      }

      // 情况 C：常规的位置更新
      if (msg.type === "location" && markerRef.current) {
        // 更新倒计时文字
        if (msg.remainingSeconds !== undefined) {
           // ... 你的格式化时间逻辑
           setRemainingTime(formatRemainingETA(Date.now() + msg.remainingSeconds * 1000));
        }
        
        // 移动 marker
        if (msg.nextPosition && msg.duration > 0) {
          const nextLngLat = new AMap.LngLat(msg.nextPosition.lng, msg.nextPosition.lat);
          markerRef.current.moveTo(nextLngLat, {
            duration: msg.duration,
            autoRotation: true,
          });
        }
        
        // 结束逻辑
        if (msg.finished) {
          setOrder((prev: any) => ({ ...prev, status: "已送达" }));
        }
      }
    } catch (e) { console.error(e); }
  };

  return () => { if (ws.readyState === 1) ws.close(); };
}, [order?._id, order?.status, markerReady]);

  /* ---------------- 3. 辅助逻辑 ---------------- */
  useEffect(() => {
    if (!order?.eta || ["已送达", "已完成", "商家已取消"].includes(order?.status)) {
      setRemainingTime("配送结束");
      return;
    }
    const timer = setInterval(() => {
      setRemainingTime(formatRemainingETA(order.eta));
    }, 1000);
    return () => clearInterval(timer);
  }, [order?.eta, order?.status]);

  /* ---------------- 4. 商家操作逻辑 ---------------- */
  const doMerchantAction = async (action: 'ship' | 'cancel' | 'agree_return' | 'delete') => {
    if (!order) return;
    try {
      if (action === 'ship') {
        if(!confirm("确认立即发货？(这将启动小车模拟)")) return;
        await shipOrder(order._id);
        const newOrder = await fetchOrder(order._id);
        setOrder(newOrder);
      } 
      else if (action === 'cancel') {
        if(!confirm("确认取消此订单？用户将收到退款。")) return;
        await updateStatus(order._id, "商家已取消");
        setOrder({ ...order, status: "商家已取消" });
      }
      else if (action === 'agree_return') {
        if(!confirm("同意用户退货并退款？")) return;
        await updateStatus(order._id, "商家已取消");
        setOrder({ ...order, status: "商家已取消" });
      } 
      else if (action === 'delete') {
        if(!confirm("确认删除记录？")) return;
        await deleteOrder(order._id);
        navigate("/merchant");
      }
    } catch(e) { alert("操作失败"); }
  };

  /* ---------------- 5. 渲染视图 ---------------- */
  
  // 提取用户信息 (兼容 populate 成功或失败的情况)
  const userInfo = order && typeof order.userId === 'object' ? order.userId : null;
  const userName = userInfo?.username || "未知用户";
  const userPhone = userInfo?.phone || "暂无电话";

  return (
    <div style={styles.container}>
      
      {/* 🟢 顶部 Header：包含面包屑和搜索栏 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
            <Link to="/merchant" style={styles.backLink}>
              <span style={{marginRight: '6px'}}>←</span> 返回工作台
            </Link>
            <span style={styles.breadcrumbSeparator}>/</span>
            <span style={styles.breadcrumbCurrent}>订单详情</span>
        </div>
        
        <div style={styles.searchContainer}>
            <input 
                type="text" 
                placeholder="输入订单 ID 搜索..." 
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                style={styles.searchInput}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch} style={styles.searchBtn}>
               🔍 搜索
            </button>
        </div>
      </div>

      <div style={styles.content}>
        
        {/* 👈 左侧：订单信息面板 */}
        <div style={styles.leftPanel}>
          <div style={styles.card}>
             <div style={styles.statusHeader}>
               <div style={{fontSize: '13px', color: '#888', marginBottom: '4px'}}>当前状态</div>
               <div style={{fontSize: '26px', fontWeight: '800', color: '#1890ff', letterSpacing: '1px'}}>
                 {order?.status || "加载中..."}
               </div>

               {order?.status === "配送中" && (
                 <div style={styles.etaBadge}>
                   预计送达: {realtimeLabel || remainingTime}
                 </div>
               )}
             </div>

             <div style={styles.divider} />

             {/* 信息列表 */}
             <div style={styles.infoGroup}>
                <InfoItem label="商品名称" value={order?.title} />
                <InfoItem label="订单编号" value={order?._id} copyable />
                <InfoItem label="订单金额" value={`¥${order?.totalPrice || order?.price}`} highlight />
                <InfoItem label="配送地址" value={order?.address?.detail} />
             </div>
             
             {/* 按钮操作区 */}
             <div style={styles.actionGroup}>
               {order?.status === "待发货" && (
                    <button style={styles.btnPrimary} onClick={() => doMerchantAction('ship')}>🚀 立即发货</button>
               )}
               {order?.status === "用户申请退货" && (
                 <button style={styles.btnDanger} onClick={() => doMerchantAction('agree_return')}>同意退款</button>
               )}
               {(order?.status === "已完成" || order?.status === "商家已取消") && (
                 <button style={styles.btnGhost} onClick={() => doMerchantAction('delete')}>删除记录</button>
               )}
                {order?.status === "配送中" && (
                 <button style={styles.btnDisabled} disabled>正在配送中...</button>
               )}
             </div>
          </div>

          <div style={{...styles.card, flex: 1}}>
            <h3 style={{margin: '0 0 20px 0', fontSize: '16px', color: '#333'}}>物流进度</h3>
            <Timeline status={order?.status} deliveredTime={order?.deliveredAt} />
          </div>
        </div>

        {/* 👉 右侧：地图面板 */}
        <div style={styles.mapPanel}>
          <div ref={mapRef} style={{width: '100%', height: '100%'}} />
          
          {/* ⭐ 悬浮卡片：收货人信息 */}
          {order && (
            <div style={styles.receiverCard}>
                <div style={styles.receiverHeader}>
                    <div style={styles.avatarPlaceholder}>
                       {/* 头像首字母 */}
                       {userName[0]?.toUpperCase() || "客"}
                    </div>
                    <div>
                        <div style={styles.receiverName}>{userName}</div>
                        <div style={styles.receiverLabel}>收货人</div>
                    </div>
                </div>
                <div style={styles.dividerMin}></div>
                <div style={styles.phoneRow}>
                    <span style={{fontSize: '16px'}}>📞</span> 
                    <span style={styles.phoneText}>{userPhone}</span>
                    <button 
                        style={styles.btnMiniCopy} 
                        onClick={() => {
                           if(userPhone !== "暂无电话") { 
                               navigator.clipboard.writeText(userPhone); 
                               alert("电话已复制"); 
                           }
                        }}
                    >
                        复制
                    </button>
                </div>
            </div>
          )}

          {/* 车辆监控标签 */}
          {order?.status === "配送中" && (
            <div style={styles.mapOverlay}>
               <span style={styles.pulsingDot}></span>
               车辆实时监控中
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- 子组件 --- */
const InfoItem = ({ label, value, highlight, copyable }: any) => (
  <div style={styles.infoRow}>
    <span style={styles.label}>{label}</span>
    <span style={{
       ...styles.value, 
       color: highlight ? '#fa8c16' : '#333',
       cursor: copyable ? 'pointer' : 'default'
    }}
    onClick={() => copyable && value && navigator.clipboard.writeText(value)}
    title={copyable ? "点击复制" : ""}
    >
      {value || "--"}
    </span>
  </div>
);

const Timeline = ({ status, deliveredTime }: { status: string, deliveredTime?: string }) => {
  const steps = [
    { key: "待发货", label: "等待发货", time: "" },
    { key: "配送中", label: "配送途中", time: "" },
    { key: "已送达", label: "已送达", time: deliveredTime ? new Date(deliveredTime).toLocaleTimeString() : "" },
    { key: "已完成", label: "订单完成", time: "" },
  ];
  const statusIdx = steps.findIndex(s => s.key === status);
  const activeIdx = statusIdx === -1 ? (status === "商家已取消" ? -1 : 0) : statusIdx;
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '24px', paddingLeft: '8px'}}>
      {steps.map((step, idx) => {
        const isActive = idx <= activeIdx;
        return (
          <div key={step.key} style={{display: 'flex', gap: '15px', position: 'relative'}}>
             {idx !== steps.length - 1 && (
               <div style={{
                 position: 'absolute', left: '6px', top: '18px', bottom: '-26px', width: '2px', 
                 background: isActive && idx < activeIdx ? '#1890ff' : '#f0f0f0' 
               }} />
             )}
             <div style={{
               width: '14px', height: '14px', borderRadius: '50%', border: isActive ? '3px solid #d6e4ff' : '3px solid transparent',
               background: isActive ? '#1890ff' : '#ddd', zIndex: 1, flexShrink: 0
             }} />
             <div>
               <div style={{color: isActive ? '#333' : '#bbb', fontWeight: isActive ? '600' : '400', fontSize: '14px'}}>
                 {step.label}
               </div>
               {step.time && <div style={{fontSize: '12px', color: '#999', marginTop: '2px'}}>{step.time}</div>}
             </div>
          </div>
        )
      })}
    </div>
  )
}

/* --- 样式表 (美化版) --- */
const styles: Record<string, any> = {
  container: { 
    maxWidth: '1400px', margin: '0 auto', padding: '24px', 
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    background: '#f7f8fa', minHeight: '100vh', boxSizing: 'border-box' 
  },
  
  // Header
  header: { 
    marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#fff', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
  },
  headerLeft: { display: 'flex', alignItems: 'center', fontSize: '15px' },
  backLink: { textDecoration: 'none', color: '#666', fontWeight: 500, display: 'flex', alignItems: 'center', transition: 'color 0.2s' },
  breadcrumbSeparator: { margin: '0 10px', color: '#ddd' },
  breadcrumbCurrent: { color: '#1890ff', fontWeight: 600 },
  
  // Search
  searchContainer: { display: 'flex', gap: '0', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', borderRadius: '6px' },
  searchInput: { 
    padding: '8px 16px', border: '1px solid #d9d9d9', borderRight: 'none', 
    borderRadius: '6px 0 0 6px', outline: 'none', width: '240px', fontSize: '14px', transition: 'all 0.3s'
  },
  searchBtn: { 
    padding: '8px 20px', border: 'none', background: '#1890ff', color: 'white', 
    borderRadius: '0 6px 6px 0', cursor: 'pointer', fontWeight: 500, transition: 'background 0.3s'
  },

  // Layout
  content: { display: 'flex', gap: '24px', height: 'calc(100vh - 140px)' },
  leftPanel: { flex: '0 0 360px', display: 'flex', flexDirection: 'column', gap: '24px' },
  mapPanel: { flex: '1', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' },
  
  card: { background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' },
  
  // Status
  statusHeader: { textAlign: 'center', paddingBottom: '20px' },
  etaBadge: { 
    display: 'inline-block', background: '#e6f7ff', color: '#1890ff', 
    padding: '6px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: '600', marginTop: '8px' 
  },
  divider: { height: '1px', background: '#f0f0f0', margin: '0 0 20px 0' },
  
  // Info
  infoGroup: { display: 'flex', flexDirection: 'column', gap: '16px' },
  infoRow: { display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' },
  label: { color: '#888' },
  value: { color: '#333', fontWeight: 500, textAlign: 'right', maxWidth: '65%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  
  // Actions
  actionGroup: { marginTop: '30px', display: 'flex', gap: '12px' },
  btnPrimary: { background: "#1890ff", color: "white", border: "none", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1, fontWeight: 600, boxShadow: '0 4px 10px rgba(24, 144, 255, 0.2)' },
  btnDanger: { background: "#ff4d4f", color: "white", border: "none", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1, fontWeight: 600 },
  btnGhost: { background: "white", color: "#666", border: "1px solid #ddd", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1 },
  btnDisabled: { background: "#f5f5f5", color: "#bbb", border: "1px solid #eee", padding: "10px", borderRadius: "8px", cursor: "not-allowed", flex: 1 },

  // ⭐ Receiver Card
  receiverCard: {
    position: 'absolute', top: '24px', left: '24px', zIndex: 150,
    background: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(10px)',
    padding: '16px 20px', borderRadius: '12px',
    boxShadow: '0 8px 20px rgba(0,0,0,0.08)', minWidth: '240px',
    border: '1px solid rgba(255,255,255,0.8)'
  },
  receiverHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  avatarPlaceholder: { 
    width: '44px', height: '44px', background: 'linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)', 
    color: '#1890ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', 
    fontSize: '18px', fontWeight: 'bold', boxShadow: '0 2px 6px rgba(24, 144, 255, 0.15)' 
  },
  receiverName: { fontWeight: '700', fontSize: '16px', color: '#333' },
  receiverLabel: { fontSize: '12px', color: '#999', marginTop: '2px' },
  dividerMin: { height: '1px', background: '#eee', margin: '4px 0 12px 0' },
  phoneRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  phoneText: { fontWeight: '600', fontSize: '15px', color: '#333', letterSpacing: '0.5px' },
  btnMiniCopy: { 
    marginLeft: 'auto', fontSize: '12px', padding: '4px 10px', 
    background: '#f0f2f5', color: '#666', border: 'none', 
    borderRadius: '4px', cursor: 'pointer', transition: 'background 0.2s'
  },

  // Map Overlay
  mapOverlay: { 
    position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.7)', color: 'white', padding: '8px 16px', borderRadius: '30px', 
    fontSize: '13px', fontWeight: '500', boxShadow: '0 4px 10px rgba(0,0,0,0.2)', 
    display: 'flex', alignItems: 'center', gap: '8px', zIndex: 100
  },
  pulsingDot: {
    width: '8px', height: '8px', background: '#52c41a', borderRadius: '50%', 
    boxShadow: '0 0 0 2px rgba(82, 196, 26, 0.4)'
  }
};