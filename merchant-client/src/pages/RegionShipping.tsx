import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AMapLoader from '@amap/amap-jsapi-loader';
import { fetchPendingOrders, batchShipOrders, type Order } from '../api/orders';
import { fetchProfile } from '../api/profile';

// =========================================================
// 🔐 安全密钥配置
// =========================================================
(window as any)._AMapSecurityConfig = {
  securityJsCode: '77a072080cb11c735ea19b7c59ad9781', // 替换你的 code
};

// --- 扩展订单类型，增加本地标记 ---
interface ExtendedOrder extends Order {
  isDeliverable: boolean; // true=在配送范围内, false=超区
}

// --- 样式常量 ---
const THEME = {
  primary: '#2563eb',    // 科技蓝
  success: '#10b981',    // 翡翠绿 (发货)
  warning: '#f59e0b',    // 橙色 (选中但不发)
  danger: '#ef4444',     // 红色 (未选中)
  gray: '#9ca3af',       // 灰色 (超区)
  bg: '#f3f4f6',
  cardBg: '#ffffff',
  textMain: '#1f2937',
  textSub: '#6b7280',
  border: '#e5e7eb',
};

const RegionShipping: React.FC = () => {
  const navigate = useNavigate();
  const mapRef = useRef<any>(null);
  const mouseToolRef = useRef<any>(null);
  const isMounted = useRef(true);
  
  // --- 数据状态 ---
  const [allOrders, setAllOrders] = useState<ExtendedOrder[]>([]); // 所有待发货订单
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  
  // --- 交互状态 ---
  const [insideOrders, setInsideOrders] = useState<ExtendedOrder[]>([]); // 框选区域内的候选池
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // UI Loading
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);

  // --- 初始化数据 (核心修改) ---
  useEffect(() => {
    isMounted.current = true;
    const initData = async () => {
      try {
        // 1. 并行获取：个人信息、范围内订单、超区订单
        const [profile, insideList, outsideList] = await Promise.all([
          fetchProfile().catch(() => null),
          fetchPendingOrders('inside').catch(() => []),  // ✅ 获取可配送
          fetchPendingOrders('outside').catch(() => [])  // ✅ 获取超区
        ]);
        
        if (!isMounted.current) return;

        // 设置地图中心
        if (profile?.address?.lng && profile?.address?.lat) {
          setMapCenter([profile.address.lng, profile.address.lat]);
        } else {
          setMapCenter([116.397428, 39.90923]); 
        }

        // 2. 合并数据并打标
        const validInside = insideList.filter(o => o.address?.lng && o.address?.lat)
          .map(o => ({ ...o, isDeliverable: true })); // ✅ 标记为可配送
          
        const validOutside = outsideList.filter(o => o.address?.lng && o.address?.lat)
          .map(o => ({ ...o, isDeliverable: false })); // ✅ 标记为超区

        // 合并所有订单用于地图展示
        setAllOrders([...validInside, ...validOutside]);

      } catch (error) {
        console.error("Init Error", error);
      } finally {
        if (isMounted.current) setInitLoading(false);
      }
    };
    initData();
    return () => {
      isMounted.current = false;
      mapRef.current?.destroy();
    };
  }, []);

  // --- 初始化地图 ---
  useEffect(() => {
    if (mapCenter && !mapRef.current) {
      initMapController();
    }
  }, [mapCenter]);

  // --- 监听变化重绘 Marker ---
  useEffect(() => {
    if (mapRef.current && (window as any).AMap) {
      renderMarkers(mapRef.current, (window as any).AMap);
    }
  }, [allOrders, insideOrders, checkedIds]);

  const initMapController = () => {
    const loadMap = (AMap: any) => {
      if (!isMounted.current) return;
      createMapInstance(AMap);
    };

    if ((window as any).AMap) {
      const AMap = (window as any).AMap;
      AMap.plugin(['AMap.MouseTool', 'AMap.GeometryUtil'], () => loadMap(AMap));
    } else {
      AMapLoader.load({
        key: '3b8390692d5bf40f7a9b065a4e77b7a4', // 替换你的 Key
        version: '2.0',
        plugins: ['AMap.MouseTool', 'AMap.GeometryUtil'],
      }).then(loadMap);
    }
  };

  const createMapInstance = (AMap: any) => {
    if (mapRef.current || !mapCenter) return;
    try {
      const map = new AMap.Map('map-container', {
        zoom: 13,
        center: mapCenter,
        viewMode: '2D',
        mapStyle: 'amap://styles/normal',
      });
      mapRef.current = map;

      const mouseTool = new AMap.MouseTool(map);
      mouseToolRef.current = mouseTool;
      mouseTool.on('draw', (e: any) => handleDrawEnd(e, AMap));

      renderMarkers(map, AMap);
    } catch (error) {
      console.error(error);
    }
  };

  // --- 核心：渲染 Marker (样式逻辑更新) ---
  const renderMarkers = (map: any, AMap: any) => {
    map.clearMap(); 
    
    // 1. 渲染商家点
    if (mapCenter) {
      const shopContent = `
        <div style="position:relative; display:flex; justify-content:center; align-items:center;">
          <div style="background:${THEME.primary}; width:32px; height:32px; border-radius:50%; border:3px solid #fff; box-shadow:0 4px 8px rgba(37,99,235,0.4); display:flex; align-items:center; justify-content:center; color:#fff; font-size:16px;">🏪</div>
        </div>
      `;
      new AMap.Marker({
        position: new AMap.LngLat(mapCenter[0], mapCenter[1]),
        content: shopContent,
        offset: new AMap.Pixel(-16, -16),
        zIndex: 200,
        bubble: true
      }).setMap(map);
    }

    // 2. 渲染订单点
    allOrders.forEach(order => {
      // 是否被现在的框选圈住了
      const isInsideDraw = insideOrders.some(inOrder => inOrder._id === order._id);
      // 是否被勾选
      const isChecked = checkedIds.has(order._id);
      // ✅ 是否在配送范围内 (后端判断)
      const isDeliverable = order.isDeliverable;

      // 🎨 颜色逻辑：
      // 默认颜色 (没被框选)
      let color = isDeliverable ? THEME.danger : THEME.gray; 
      let zIndex = 10;
      let size = 14;
      let borderColor = '#fff';

      if (isInsideDraw) {
        // 如果在框选范围内
        size = 18;
        zIndex = 50;
        
        if (isChecked) {
          // 已勾选
          color = isDeliverable ? THEME.success : '#555'; // 可配送显示绿，超区显示深灰
          zIndex = 100;
          size = 22;
        } else {
          // 未勾选 (但在圈内)
          color = THEME.warning;
        }

        // 如果超区，加一个红色边框警示
        if (!isDeliverable) {
          borderColor = THEME.danger;
        }
      }
      
      const content = `
        <div style="
          background: ${color};
          width: ${size}px; height: ${size}px;
          border-radius: 50%;
          border: 2px solid ${borderColor};
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          transition: all 0.2s;
          display: flex; align-items: center; justify-content: center;
          color: white; font-size: 10px;
        ">
          ${!isDeliverable ? '×' : ''} 
        </div>
      `;

      new AMap.Marker({
        position: new AMap.LngLat(order.address.lng, order.address.lat),
        extData: order,
        content: content,
        offset: new AMap.Pixel(-size/2, -size/2),
        zIndex: zIndex
      }).setMap(map);
    });
  };

  // --- 画圈结束回调 ---
  const handleDrawEnd = (event: any, AMap: any) => {
    const path = event.obj.getPath();
    
    // 计算圈内的点
    const inside = allOrders.filter(order => {
       if (order.address?.lng && order.address?.lat) {
          return AMap.GeometryUtil.isPointInRing([order.address.lng, order.address.lat], path);
       }
       return false;
    });

    setInsideOrders(inside);
    // 默认全选
    const newCheckedIds = new Set(inside.map(o => o._id));
    setCheckedIds(newCheckedIds);
    mouseToolRef.current.close(false); 
    setIsDrawing(false);
  };

  const startDraw = () => {
    if (!mouseToolRef.current) return;
    setIsDrawing(true);
    setInsideOrders([]);
    setCheckedIds(new Set());
    mapRef.current.clearMap();
    renderMarkers(mapRef.current, (window as any).AMap);

    mouseToolRef.current.polygon({
      strokeColor: THEME.primary, 
      strokeOpacity: 1,
      strokeWeight: 2, 
      fillColor: THEME.primary, 
      fillOpacity: 0.2,
      strokeStyle: 'dashed',
    });
  };

  const toggleOrder = (id: string) => {
    const newSet = new Set(checkedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setCheckedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (checkedIds.size === insideOrders.length && insideOrders.length > 0) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(insideOrders.map(o => o._id)));
    }
  };

  const handleShip = async () => {
    if (checkedIds.size === 0) return;
    
    // ⚠️ 增加超区警告
    const outsideCount = Array.from(checkedIds).filter(id => {
      const order = allOrders.find(o => o._id === id);
      return order && !order.isDeliverable;
    }).length;

    let confirmMsg = `确认将选中的 ${checkedIds.size} 个订单发货？`;
    if (outsideCount > 0) {
      confirmMsg += `\n\n⚠️ 注意：其中有 ${outsideCount} 个订单显示【超区】，请确认是否强制发货。`;
    }

    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const idsArray = Array.from(checkedIds);
      const res: any = await batchShipOrders(idsArray);
      
      let msg = '处理完成';
      if (res.details) {
        msg = `成功: ${res.details.success} 单\n失败: ${res.details.failed} 单`;
      }
      alert(msg);

      // 重新获取数据 (也需要重新并行获取)
      const [insideList, outsideList] = await Promise.all([
        fetchPendingOrders('inside').catch(() => []),
        fetchPendingOrders('outside').catch(() => [])
      ]);
      const validInside = insideList.filter(o => o.address?.lng && o.address?.lat).map(o => ({...o, isDeliverable: true}));
      const validOutside = outsideList.filter(o => o.address?.lng && o.address?.lat).map(o => ({...o, isDeliverable: false}));
      setAllOrders([...validInside, ...validOutside]);
      
      setInsideOrders([]);
      setCheckedIds(new Set());
      if (mapRef.current && (window as any).AMap) {
         mapRef.current.clearMap();
         renderMarkers(mapRef.current, (window as any).AMap);
      }
    } catch (error: any) {
      alert(`❌ 系统异常: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isAllSelected = insideOrders.length > 0 && checkedIds.size === insideOrders.length;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow:'hidden' }}>
      
      {/* --- 左侧操作面板 --- */}
      <div style={{ 
        width: '380px', 
        backgroundColor: '#fff', 
        borderRight: `1px solid ${THEME.border}`, 
        display: 'flex', flexDirection: 'column', 
        zIndex: 10, boxShadow: '4px 0 12px rgba(0,0,0,0.05)'
      }}>
        
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: `1px solid ${THEME.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', gap: '10px' }}>
            <button onClick={() => navigate('/orders')} className="btn-icon" style={styles.iconBtn}>🔙</button>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>区域智能发货</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>总待发货</div>
              <div style={styles.statValue}>{allOrders.length}</div>
            </div>
            <div style={{ ...styles.statBox, background: insideOrders.length ? '#ecfdf5' : '#f9fafb' }}>
              <div style={styles.statLabel}>区域内选中</div>
              <div style={{ ...styles.statValue, color: insideOrders.length ? THEME.success : THEME.textSub }}>
                {checkedIds.size} <span style={{fontSize:'12px', color:'#9ca3af'}}>/ {insideOrders.length}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={startDraw}
            disabled={isDrawing || loading}
            style={{
              ...styles.btnOutline,
              borderColor: isDrawing ? '#d1d5db' : THEME.primary,
              color: isDrawing ? '#9ca3af' : THEME.primary,
              background: isDrawing ? '#f3f4f6' : '#fff'
            }}
          >
            {isDrawing ? '🖱️ 请在地图绘制多边形...' : '✏️ 重新框选区域'}
          </button>
        </div>

        {/* 列表工具栏 */}
        {insideOrders.length > 0 && (
          <div style={{ padding: '8px 16px', background: '#f9fafb', borderBottom: `1px solid ${THEME.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize:'14px', fontWeight:500 }}>
              <input 
                type="checkbox" 
                checked={isAllSelected}
                onChange={toggleSelectAll}
                style={{ width:'16px', height:'16px', cursor:'pointer' }}
              />
              全选当前列表
            </label>
            <span style={{ fontSize:'12px', color: THEME.textSub }}>已勾选 {checkedIds.size} 单</span>
          </div>
        )}

        {/* 订单列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', background: '#f9fafb' }}>
          {insideOrders.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>🗺️</div>
              <div>点击上方按钮开始框选</div>
            </div>
          ) : (
            insideOrders.map(o => {
              const isChecked = checkedIds.has(o._id);
              // ✅ 列表项的样式逻辑：如果是超区，显示特殊背景或标签
              const isDeliverable = o.isDeliverable;

              return (
                <div 
                  key={o._id} 
                  onClick={() => toggleOrder(o._id)}
                  style={{ 
                    ...styles.orderItem,
                    borderColor: isChecked ? THEME.success : 'transparent',
                    background: isChecked ? '#fff' : '#f3f4f6',
                    opacity: isChecked ? 1 : 0.8,
                    position: 'relative'
                  }}
                >
                  <div style={{ display:'flex', alignItems:'flex-start', gap:'10px' }}>
                    <input 
                      type="checkbox" 
                      checked={isChecked}
                      onChange={() => {}} 
                      style={{ marginTop:'4px', width:'16px', height:'16px', cursor:'pointer' }}
                    />
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                        <span style={{ fontWeight: 600, color: isDeliverable ? THEME.textMain : THEME.textSub }}>
                          {o.title}
                        </span>
                        {/* ✅ 超区标签 */}
                        {!isDeliverable && (
                          <span style={{ 
                            fontSize:'10px', background:'#fee2e2', color:'#ef4444', 
                            padding:'2px 6px', borderRadius:'4px', border:'1px solid #fecaca' 
                          }}>
                            超区
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: THEME.textSub, lineHeight: 1.4 }}>
                        {o.address?.detail}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部按钮 */}
        <div style={{ padding: '16px', background: '#fff', borderTop: `1px solid ${THEME.border}` }}>
          <button 
            onClick={handleShip} 
            disabled={loading || checkedIds.size === 0}
            style={{ 
              ...styles.btnPrimary,
              background: (checkedIds.size === 0 || loading) ? '#e5e7eb' : `linear-gradient(135deg, ${THEME.success} 0%, #059669 100%)`,
              cursor: (checkedIds.size === 0 || loading) ? 'not-allowed' : 'pointer',
              color: (checkedIds.size === 0 || loading) ? '#9ca3af' : '#fff',
            }}
          >
            {loading ? '处理中...' : `一键发货 (${checkedIds.size})`}
          </button>
        </div>
      </div>

      {/* --- 右侧地图 --- */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div id="map-container" style={{ width: '100%', height: '100%', background: '#e5e7eb' }}></div>
        {initLoading && (
          <div style={styles.loadingOverlay}>
            <div className="spinner"></div>
            <p>地图加载中...</p>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Styles 保持不变，可以直接复用上面的 ---
const styles: { [key: string]: React.CSSProperties } = {
  iconBtn: {
    width: '32px', height: '32px', borderRadius: '8px', border: `1px solid ${THEME.border}`,
    background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  statBox: {
    padding: '12px', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: '#f9fafb'
  },
  statLabel: { fontSize: '12px', color: THEME.textSub, marginBottom:'4px' },
  statValue: { fontSize: '20px', fontWeight: 'bold', color: THEME.textMain },
  btnOutline: {
    width: '100%', padding: '10px', border: '1px dashed', borderRadius: '6px',
    fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
    cursor: 'pointer'
  },
  btnPrimary: {
    width: '100%', padding: '12px', border: 'none', borderRadius: '8px',
    fontSize: '16px', fontWeight: 'bold', transition: 'all 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
  },
  orderItem: {
    padding: '12px', marginBottom: '8px', borderRadius: '8px',
    border: '1px solid', cursor: 'pointer', transition: 'all 0.2s'
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100%', color: THEME.textSub, opacity: 0.6, textAlign:'center'
  },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
    background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)',
    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    color: THEME.textSub, fontWeight: 500
  }
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `
  .spinner { width: 30px; height: 30px; border: 3px solid #e5e7eb; border-top-color: ${THEME.primary}; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 12px; }
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
`;
document.head.appendChild(styleSheet);

export default RegionShipping;