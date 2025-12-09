import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchOrder, updateStatus, shipOrder, deleteOrder } from "../api/orders"; 

// 声明 AMap 防止 TS 报错
declare const AMap: any;

// 🟢 工具函数：计算时间状态 (精确到分钟)
const calculateTimeStatus = (etaTimestamp: number) => {
  const now = Date.now();
  const diff = etaTimestamp - now;

  // 情况 A: 还没到时间 (正常配送中)
  if (diff > 0) {
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return {
      text: `剩余 ${hours}小时 ${minutes}分`,
      color: '#1890ff',
      bgColor: '#e6f7ff',
      borderColor: '#1890ff'
    };
  } 
  
  // 情况 B: 已经超时
  else {
    const absDiff = Math.abs(diff); // 取绝对值
    const hours = Math.floor(absDiff / 3600000);
    const minutes = Math.floor((absDiff % 3600000) / 60000);
    return {
      text: `已超时 ${hours}小时 ${minutes}分`,
      color: '#d9363e', // 深红文字
      bgColor: '#fff1f0', // 淡红背景
      borderColor: '#ffccc7' // 红色边框
    };
  }
};

export default function MerchantOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // --- 状态管理 ---
  const [order, setOrder] = useState<any>(null);
  
  // 🟢 修改状态：timeStatus 用来存文案和样式
  const [timeStatus, setTimeStatus] = useState({ 
    text: "--", color: "#888", bgColor: "#f5f5f5", borderColor: "#ddd" 
  });
  
  const [markerReady, setMarkerReady] = useState(false); 
  const [searchId, setSearchId] = useState(""); 
  
  // --- Refs ---
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  /* ---------------- 0. 搜索功能 ---------------- */
  const handleSearch = () => {
    if (!searchId.trim()) return;
    navigate(`/merchant/orders/${searchId.trim()}`);
    setSearchId(""); 
  };

  /* ---------------- 1. 加载数据 & 初始化地图 ---------------- */
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    // 重置状态
    setOrder(null);
    setTimeStatus({ text: "加载中...", color: "#888", bgColor: "#f5f5f5", borderColor: "#ddd" });
    setMarkerReady(false);

    (async () => {
      try {
        const o = await fetchOrder(id);
        if (!mounted) return;
        setOrder(o);

        // 如果订单已结束，直接显示状态
        if (["已送达", "已完成", "商家已取消"].includes(o.status)) {
            setTimeStatus({ 
                text: o.status, 
                color: "#52c41a", 
                bgColor: "#f6ffed", 
                borderColor: "#b7eb8f" 
            });
        }

        if (!mapRef.current) return;

        // 初始化地图
        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new AMap.Map(mapRef.current, {
            zoom: 13,
            center: [121.47, 31.23],
            viewMode: "3D",
            mapStyle: "amap://styles/whitesmoke", 
          });
          mapInstanceRef.current.plugin(["AMap.MoveAnimation", "AMap.ToolBar", "AMap.Scale"], () => {
             mapInstanceRef.current.addControl(new AMap.ToolBar({ position: 'RB' }));
             mapInstanceRef.current.addControl(new AMap.Scale());
          });
        }

        const map = mapInstanceRef.current;
        const points = o.routePoints ?? [];

        if (polylineRef.current) map.remove(polylineRef.current);
        if (markerRef.current) map.remove(markerRef.current);

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

          let startPos;
          const hasTrackData = (o as any).trackState?.lastPosition;

          if (["已送达", "已完成"].includes(o.status)) {
             startPos = path[path.length - 1]; 
          } else if (hasTrackData) {
            startPos = new AMap.LngLat(hasTrackData.lng, hasTrackData.lat);
          } else {
             startPos = path[0];
          }
          
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

  /* ---------------- 3. WebSocket 追踪逻辑 (只负责移动车，不负责算时间) ---------------- */
  useEffect(() => {
    if (!order || ["已送达", "已完成", "商家已取消"].includes(order.status)) return;
    if (order.status !== "配送中" || !markerReady) return;

    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket("wss://system-backend.zeabur.app"); // 替换真实地址
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", orderId: order._id }));
      ws.send(JSON.stringify({ type: "request-current", orderId: order._id }));
    };

    ws.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(ev.data);

        if (msg.type === "no-track") {

           console.log("恢复运行...");
           ws.send(JSON.stringify({ 
             type: "start-track", 
             orderId: order._id,
             points: order.routePoints 
           }));
        }

        if (msg.type === "current-state" && msg.position && markerRef.current) {
           const pos = new AMap.LngLat(msg.position.lng, msg.position.lat);
           markerRef.current.setPosition(pos);
        }
        
        if (msg.type === "location" && markerRef.current) {
          // 🟢 移除了 setRemainingTime 的逻辑
          // 倒计时完全交给下面的 useEffect(setInterval) 处理
          // 这样能保证显示的永远是“承诺时间”的状态，而不是“物理剩余时间”
          
          if (msg.nextPosition && msg.duration > 0) {
            const nextLngLat = new AMap.LngLat(msg.nextPosition.lng, msg.nextPosition.lat);
            markerRef.current.moveTo(nextLngLat, {
              duration: msg.duration, 
              autoRotation: true,
            });
          }
          
          if (msg.finished) {
             await updateStatus(order._id, "已送达");
             setOrder((prev: any) => ({ ...prev, status: "已送达" }));
             ws.close();
          }
        }
      } catch (e) { console.error(e); }
    };
    return () => { if (ws.readyState === 1) ws.close(); };
  }, [order?._id, order?.status, markerReady]);

  /* ---------------- 4. 核心倒计时/超时计算器 ---------------- */
  useEffect(() => {
    // 如果订单已结束，显示静态文案
    if (["已送达", "已完成"].includes(order?.status)) {
        setTimeStatus({ text: "已送达", color: "#52c41a", bgColor: "#f6ffed", borderColor: "#b7eb8f" });
        return;
    }
    if (order?.status === "商家已取消") {
        setTimeStatus({ text: "已取消", color: "#999", bgColor: "#f5f5f5", borderColor: "#ddd" });
        return;
    }
    if (!order?.eta) return;

    const etaTimestamp = new Date(order.eta).getTime();

    // 立即执行一次
    setTimeStatus(calculateTimeStatus(etaTimestamp));

    // 每秒刷新一次
    const timer = setInterval(() => {
      setTimeStatus(calculateTimeStatus(etaTimestamp));
    }, 60000); // 🟢 只需要每分钟刷新一次即可，不需要每秒

    return () => clearInterval(timer);
  }, [order?.eta, order?.status]);

  /* ---------------- 5. 商家操作逻辑 ---------------- */
  const doMerchantAction = async (action: 'ship' | 'cancel' | 'agree_return' | 'delete' | 'force_complete') => {
    if (!order) return;
    try {
      if (action === 'ship') {
        if(!confirm("确认立即发货？(这将启动小车模拟)")) return;
        await shipOrder(order._id);
        window.location.reload();
      } 
      else if (action === 'cancel') {
        if(!confirm("确认取消此订单？")) return;
        await updateStatus(order._id, "商家已取消");
        setOrder({ ...order, status: "商家已取消" });
      }
      else if (action === 'agree_return') {
        if(!confirm("同意退货？")) return;
        await updateStatus(order._id, "商家已取消");
        setOrder({ ...order, status: "商家已取消" });
      } 
      else if (action === 'delete') {
        if(!confirm("确认删除记录？")) return;
        await deleteOrder(order._id);
        navigate("/merchant");
      }
      else if (action === 'force_complete') {
        if(!confirm("确认强制标记为已送达？")) return;
        await updateStatus(order._id, "已送达");
        window.location.reload();
      }
    } catch(e) { alert("操作失败"); }
  };

  /* ---------------- 6. 渲染视图 ---------------- */
  const userInfo = order && typeof order.userId === 'object' ? order.userId : null;
  const userName = userInfo?.username || "未知用户";
  const userPhone = userInfo?.phone || "暂无电话";
  const isEtaPassed = order?.eta && new Date(order.eta).getTime() < Date.now();

  return (
    <div style={styles.container}>
      {/* 顶部 Header */}
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
            <button onClick={handleSearch} style={styles.searchBtn}>🔍 搜索</button>
        </div>
      </div>

      <div style={styles.content}>
        
        {/* 左侧面板 */}
        <div style={styles.leftPanel}>
          <div style={styles.card}>
             <div style={styles.statusHeader}>
               <div style={{fontSize: '13px', color: '#888', marginBottom: '4px'}}>当前状态</div>
               <div style={{fontSize: '26px', fontWeight: '800', color: '#1890ff', letterSpacing: '1px'}}>
                 {order?.status || "加载中..."}
               </div>

               {/* 🟢 倒计时/超时 标签 */}
               {order?.status === "配送中" && (
                 <div style={{
                    ...styles.etaBadge,
                    color: timeStatus.color,
                    backgroundColor: timeStatus.bgColor,
                    border: `1px solid ${timeStatus.borderColor}`
                 }}>
                   {timeStatus.text}
                 </div>
               )}
             </div>

             <div style={styles.divider} />

             <div style={styles.infoGroup}>
                <InfoItem label="商品名称" value={order?.title} />
                <InfoItem label="订单编号" value={order?._id} copyable />
                <InfoItem label="订单金额" value={`¥${order?.totalPrice || order?.price}`} highlight />
                <InfoItem label="配送地址" value={order?.address?.detail} />
             </div>
             
             <div style={styles.actionGroup}>
               {order?.status === "待发货" && (
                    <button style={styles.btnPrimary} onClick={() => doMerchantAction('ship')}>🚀 立即发货</button>
               )}
               {order?.status === "用户申请退货" && (
                 <button style={styles.btnDanger} onClick={() => doMerchantAction('agree_return')}>同意退款</button>
               )}
               {(order?.status === "已完成" || order?.status === "商家已取消" || order?.status === "已送达") && (
                 <button style={styles.btnGhost} onClick={() => doMerchantAction('delete')}>删除记录</button>
               )}
               
               {/* 配送中按钮 */}
               {order?.status === "配送中" && (
                 <>
                   {isEtaPassed ? (
                     <button style={styles.btnSuccess} onClick={() => doMerchantAction('force_complete')}>
                       ✅ 强制完成订单
                     </button>
                   ) : (
                     <button style={styles.btnDisabled} disabled>🚧 正在配送中...</button>
                   )}
                 </>
               )}
             </div>
          </div>

          <div style={{...styles.card, flex: 1}}>
            <h3 style={{margin: '0 0 20px 0', fontSize: '16px', color: '#333'}}>物流进度</h3>
            <Timeline status={order?.status} deliveredTime={order?.deliveredAt} />
          </div>
        </div>

        {/* 右侧地图 */}
        <div style={styles.mapPanel}>
          <div ref={mapRef} style={{width: '100%', height: '100%'}} />
          
          {order && (
            <div style={styles.receiverCard}>
                <div style={styles.receiverHeader}>
                    <div style={styles.avatarPlaceholder}>{userName[0]?.toUpperCase() || "客"}</div>
                    <div>
                        <div style={styles.receiverName}>{userName}</div>
                        <div style={styles.receiverLabel}>收货人</div>
                    </div>
                </div>
                <div style={styles.dividerMin}></div>
                <div style={styles.phoneRow}>
                    <span style={{fontSize: '16px'}}>📞</span> 
                    <span style={styles.phoneText}>{userPhone}</span>
                    <button style={styles.btnMiniCopy} onClick={() => {if(userPhone !== "暂无电话") navigator.clipboard.writeText(userPhone)}}>复制</button>
                </div>
            </div>
          )}

          {order?.status === "配送中" && !isEtaPassed && (
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

/* --- 样式表 --- */
const styles: Record<string, any> = {
  container: { 
    maxWidth: '1400px', margin: '0 auto', padding: '24px', 
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    background: '#f7f8fa', minHeight: '100vh', boxSizing: 'border-box' 
  },
  header: { 
    marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#fff', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
  },
  headerLeft: { display: 'flex', alignItems: 'center', fontSize: '15px' },
  backLink: { textDecoration: 'none', color: '#666', fontWeight: 500, display: 'flex', alignItems: 'center', transition: 'color 0.2s' },
  breadcrumbSeparator: { margin: '0 10px', color: '#ddd' },
  breadcrumbCurrent: { color: '#1890ff', fontWeight: 600 },
  searchContainer: { display: 'flex', gap: '0', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', borderRadius: '6px' },
  searchInput: { 
    padding: '8px 16px', border: '1px solid #d9d9d9', borderRight: 'none', 
    borderRadius: '6px 0 0 6px', outline: 'none', width: '240px', fontSize: '14px', transition: 'all 0.3s'
  },
  searchBtn: { 
    padding: '8px 20px', border: 'none', background: '#1890ff', color: 'white', 
    borderRadius: '0 6px 6px 0', cursor: 'pointer', fontWeight: 500, transition: 'background 0.3s'
  },
  content: { display: 'flex', gap: '24px', height: 'calc(100vh - 140px)' },
  leftPanel: { flex: '0 0 360px', display: 'flex', flexDirection: 'column', gap: '24px' },
  mapPanel: { flex: '1', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' },
  card: { background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' },
  statusHeader: { textAlign: 'center', paddingBottom: '20px' },
  etaBadge: { 
    display: 'inline-block', 
    padding: '6px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: '600', marginTop: '8px' 
  },
  divider: { height: '1px', background: '#f0f0f0', margin: '0 0 20px 0' },
  infoGroup: { display: 'flex', flexDirection: 'column', gap: '16px' },
  infoRow: { display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' },
  label: { color: '#888' },
  value: { color: '#333', fontWeight: 500, textAlign: 'right', maxWidth: '65%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  actionGroup: { marginTop: '30px', display: 'flex', gap: '12px' },
  btnPrimary: { background: "#1890ff", color: "white", border: "none", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1, fontWeight: 600, boxShadow: '0 4px 10px rgba(24, 144, 255, 0.2)' },
  btnDanger: { background: "#ff4d4f", color: "white", border: "none", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1, fontWeight: 600 },
  btnSuccess: { background: "#52c41a", color: "white", border: "none", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1, fontWeight: 600, boxShadow: '0 4px 10px rgba(82, 196, 26, 0.2)' },
  btnGhost: { background: "white", color: "#666", border: "1px solid #ddd", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1 },
  btnDisabled: { background: "#f5f5f5", color: "#bbb", border: "1px solid #eee", padding: "10px", borderRadius: "8px", cursor: "not-allowed", flex: 1 },
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