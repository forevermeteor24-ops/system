import React, { useEffect, useState, useRef } from "react";
import * as echarts from "echarts";

// 1. 引入高德扩展
import "echarts-extension-amap";
import AMapLoader from "@amap/amap-jsapi-loader";

// ----------- 🛡️ 安全密钥 -----------
if (!(window as any)._AMapSecurityConfig) {
  (window as any)._AMapSecurityConfig = {
    securityJsCode: "77a072080cb11c735ea19b7c59ad9781", // 你的安全密钥
  };
}

const AMAP_KEY = "3b8390692d5bf40f7a9b065a4e77b7a4"; // 你的 Key

// ----------- 类型定义 -----------
type RawPoint = [number, number, number]; // [lat, lng, value]
type MapPoint = [number, number, number]; // [lng, lat, value]

type DeliveryStats = {
  avgDeliveryTime: number;
  count: number;
  // 🟢 新增：接收后端的分布数据
  distribution?: number[]; 
  // 🟢 新增：接收后端的健康度数据
  health?: {
    onTime: number;
    late: number;
  };
};

type AbnormalOrder = { _id: string; title: string; eta: number };

const BASE = "https://system-backend.zeabur.app";

export default function Dashboard() {
  // 数据状态
  const [mapData, setMapData] = useState<MapPoint[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats>({ avgDeliveryTime: 0, count: 0 });
  const [abnormalOrders, setAbnormalOrders] = useState<AbnormalOrder[]>([]);
  const [fixedCount, setFixedCount] = useState(0);
  const [mapReady, setMapReady] = useState(false);

  // DOM 引用
  const mapChartRef = useRef<HTMLDivElement>(null);
  const timeChartRef = useRef<HTMLDivElement>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);

  // 实例引用
  const mapInstance = useRef<echarts.ECharts | null>(null);
  const timeInstance = useRef<echarts.ECharts | null>(null);
  const pieInstance = useRef<echarts.ECharts | null>(null);

  // 1. 初始化高德地图
  useEffect(() => {
    if ((window as any).AMap) {
      setMapReady(true);
      return;
    }
    const existingScript = document.querySelector('script[src*="webapi.amap.com/maps"]');
    if (existingScript) {
      const timer = setInterval(() => {
        if ((window as any).AMap) {
          clearInterval(timer);
          setMapReady(true);
        }
      }, 500);
      return;
    }

    AMapLoader.load({
      key: AMAP_KEY,
      version: "2.0",
      plugins: ["AMap.Scale", "AMap.ToolBar"],
    })
      .then(() => setMapReady(true))
      .catch((e) => console.error("地图加载失败", e));

    return () => { mapInstance.current?.dispose(); };
  }, []);

  // 2. 请求数据
  useEffect(() => {
    async function loadData() {
      try {
        const token = localStorage.getItem("token");
        const headers = {
          "Authorization": token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        };

        const [heatRes, statRes, abnRes] = await Promise.all([
          fetch(`${BASE}/api/dashboard/heatmap`, { headers }),
          fetch(`${BASE}/api/dashboard/delivery-stats`, { headers }),
          fetch(`${BASE}/api/dashboard/abnormal-orders`, { headers }),
        ]);

        // --- 地图数据处理 ---
        if (heatRes.ok) {
          const data = await heatRes.json();
          const rawPoints: RawPoint[] = data.points || [];

          // 聚合逻辑
          const aggMap = new Map<string, number[]>();
          rawPoints.forEach((item) => {
            const key = `${item[0]},${item[1]}`;
            if (aggMap.has(key)) {
              aggMap.get(key)![2] += item[2];
            } else {
              aggMap.set(key, [item[0], item[1], item[2]]);
            }
          });

          // 转为 [lng, lat]
          const aggregatedData = Array.from(aggMap.values()).map((p) => [p[1], p[0], p[2]] as MapPoint);
          setMapData(aggregatedData);
        }

        // --- 统计数据 ---
        let currentStats: DeliveryStats = { avgDeliveryTime: 0, count: 0 };
        if (statRes.ok) {
          currentStats = await statRes.json();
          setDeliveryStats(currentStats);
        }

        // --- 异常处理 ---
        if (abnRes.ok) {
          const data = await abnRes.json();
          const zombies = data.abnormal || [];
          setAbnormalOrders(zombies);

          if (zombies.length > 0) {
            setFixedCount(zombies.length);
            // 这里我们不再手动修改 count，假设后端已修复
            setDeliveryStats(prev => ({
              ...prev,
              count: prev.count + zombies.length
            }));

            zombies.forEach((order: AbnormalOrder) => {
              fetch(`${BASE}/api/orders/${order._id}/status`, {
                method: "PUT",
                headers,
                body: JSON.stringify({ status: "已送达" }),
              });
            });
          }
        }
      } catch (err) {
        console.error("加载失败", err);
      }
    }
    loadData();
  }, []);

  // 3. 渲染地图 (保持原样不动)
  useEffect(() => {
    if (!mapReady || !mapChartRef.current) return;

    if (mapInstance.current) mapInstance.current.dispose();
    mapInstance.current = echarts.init(mapChartRef.current);

    const option: any = {
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(255,255,255,0.95)",
        textStyle: { color: "#333" },
        formatter: (params: any) => `
          <div style="font-weight:bold; margin-bottom:5px">📍 区域详情</div>
          经纬度: ${params.value[0]}, ${params.value[1]}<br/>
          <span style="color:#ef4444; font-weight:bold">📦 订单量: ${params.value[2]} 单</span>
        `
      },
      amap: {
        center: [105.0, 36.0],
        zoom: 4,
        resizeEnable: true,
        mapStyle: "amap://styles/normal",
        renderOnMoving: true,
        echartsLayerInteractive: true,
      },
      series: [
        {
          name: "订单点",
          type: "effectScatter",
          coordinateSystem: "amap",
          data: mapData,
          symbolSize: (val: any) => Math.min(Math.max(val[2] * 2 + 15, 20), 40),
          showEffectOn: "render",
          rippleEffect: { brushType: "stroke", scale: 3 },
          itemStyle: { color: "#ef4444", shadowBlur: 10, shadowColor: "rgba(0,0,0,0.3)" },
          label: {
            show: true,
            position: "top",
            formatter: "{@2}单",
            color: "#fff",
            backgroundColor: "#ef4444",
            padding: [4, 8],
            borderRadius: 4,
            fontWeight: "bold",
            fontSize: 12
          },
          zlevel: 1
        }
      ]
    };

    mapInstance.current.setOption(option);
    const ro = new ResizeObserver(() => mapInstance.current?.resize());
    ro.observe(mapChartRef.current);
    return () => {
      ro.disconnect();
      mapInstance.current?.dispose();
    };
  }, [mapReady, mapData]);

  // =========================================================
  // 4. 渲染图表：时效分布 (按小时)
  // =========================================================
  useEffect(() => {
    if (timeChartRef.current && !timeInstance.current) {
      timeInstance.current = echarts.init(timeChartRef.current);
    }

    // 🟢 获取后端返回的分布数据 (如果没有则给个默认值)
    const distData = deliveryStats.distribution || [0, 0, 0, 0];

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: '{b}: {c}单'
      },
      grid: {
        top: '15%',
        left: '3%',
        right: '4%',
        bottom: '5%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        // 🟢 修改为小时区间
        data: ['0-12h', '12-24h', '24-48h', '48h+'], 
        axisTick: { alignWithLabel: true },
        axisLine: { lineStyle: { color: '#9ca3af' } },
        axisLabel: { color: '#6b7280' }
      },
      yAxis: {
        type: 'value',
        name: '订单数',
        splitLine: { lineStyle: { type: 'dashed', color: '#e5e7eb' } }
      },
      series: [
        {
          name: '订单量',
          type: 'bar',
          barWidth: '50%',
          data: distData,
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            // 🟢 动态颜色逻辑
            color: (params) => {
              const colors = [
                '#10B981', // 0-12h (极速)
                '#34D399', // 12-24h (正常)
                '#F59E0B', // 24-48h (稍慢)
                '#EF4444'  // 48h+ (慢)
              ];
              return colors[params.dataIndex] || '#EF4444';
            }
          },
          label: {
            show: true,
            position: 'top',
            color: '#666',
            formatter: '{c}'
          }
        }
      ]
    };
    timeInstance.current?.setOption(option);
  }, [deliveryStats]);

  // =========================================================
  // 5. 渲染图表：全能订单健康分析 (含超时送达)
  // =========================================================
  useEffect(() => {
    if (pieChartRef.current && !pieInstance.current) {
      pieInstance.current = echarts.init(pieChartRef.current);
    }

    // 1. 获取已完成订单健康度
    const health = deliveryStats.health || { onTime: 0, late: 0 };
    // 2. 获取未完成订单异常数
    const pendingAbnormalCount = abnormalOrders.length;

    // 🟢 组装数据：合并历史(late)和现在(abnormal)
    const pieData = [
      { 
        value: health.onTime, 
        name: '准时送达', 
        itemStyle: { color: '#10B981' } // 绿
      },
      { 
        value: health.late, 
        name: '超时送达', 
        itemStyle: { color: '#F59E0B' } // 黄 (已送达但晚了)
      },
      { 
        value: fixedCount, 
        name: '自动修复', 
        itemStyle: { color: '#8B5CF6' } // 紫
      },
      { 
        value: pendingAbnormalCount, 
        name: '异常挂起', 
        itemStyle: { color: '#EF4444' } // 红 (未送达且超时)
      }
    ].filter(item => item.value > 0);

    const option: echarts.EChartsOption = {
      tooltip: { trigger: 'item' },
      legend: { bottom: '0%', left: 'center' },
      series: [
        {
          name: '订单健康分布',
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: { 
            label: { 
              show: true, 
              fontSize: 18, 
              fontWeight: 'bold',
              formatter: '{b}\n{c}单' 
            } 
          },
          data: pieData.length > 0 ? pieData : [{ value: 0, name: '暂无数据', itemStyle: { color: '#f3f4f6' } }]
        }
      ]
    };
    pieInstance.current?.setOption(option);
  }, [deliveryStats, fixedCount, abnormalOrders]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
          <h1 style={styles.title}>🚚 智能物流实时看板</h1>
          <span style={styles.tag}>Live Data</span>
        </div>
        <div style={styles.status}>系统运行正常 🟢</div>
      </header>

      <div style={styles.grid}>
        {/* 左侧大地图 */}
        <div style={{ ...styles.card, padding: 0, position: 'relative' }}>
          <div ref={mapChartRef} style={{ width: "100%", height: "600px" }}></div>
          <div style={styles.mapOverlay}>
            <div style={{fontWeight: 'bold', fontSize: '16px'}}>📍 实时分布</div>
            <div style={{fontSize: '12px', color: '#666'}}>呼吸点 = 订单量聚合</div>
          </div>
        </div>

        {/* 右侧数据列 */}
        <div style={styles.column}>
          
          {/* 1. 时效分布 (柱状图) - 小时版 */}
          <div style={styles.card}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <h3 style={styles.cardTitle}>⏱️ 配送时效分布</h3>
                {/* 🟢 将毫秒转为小时显示 */}
                <span style={{fontSize:'12px', color:'#999'}}>
                  平均: {(deliveryStats.avgDeliveryTime / 3600000).toFixed(1)} 小时
                </span>
            </div>
            <div ref={timeChartRef} style={{ width: "100%", height: "220px" }}></div>
          </div>

          {/* 2. 健康度 (综合饼图) */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>🛡️ 订单健康分析</h3>
            <div ref={pieChartRef} style={{ width: "100%", height: "220px" }}></div>
            {fixedCount > 0 && (
              <div style={styles.alertBox}>
                🤖 已自动修复 <b>{fixedCount}</b> 个异常订单
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ----------- 样式设计 -----------
const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", backgroundColor: "#f3f4f6", padding: "20px", fontFamily: "'Inter', sans-serif" },
  header: { 
    display: "flex", justifyContent: "space-between", alignItems: "center", 
    marginBottom: "20px", padding: "16px 24px", 
    backgroundColor: "#fff", borderRadius: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" 
  },
  title: { margin: 0, fontSize: "22px", fontWeight: "800", color: "#1f2937" },
  tag: { backgroundColor: "#fee2e2", color: "#ef4444", padding: "2px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" },
  status: { fontSize: "14px", color: "#059669", fontWeight: "500", backgroundColor: "#d1fae5", padding: "6px 12px", borderRadius: "20px" },
  
  grid: { display: "grid", gridTemplateColumns: "2.5fr 1fr", gap: "20px" },
  column: { display: "flex", flexDirection: "column", gap: "20px" },
  
  card: { 
    backgroundColor: "#fff", borderRadius: "20px", 
    boxShadow: "0 4px 20px rgba(0,0,0,0.05)", 
    padding: "20px", overflow: "hidden", border: "1px solid #fff" 
  },
  cardTitle: { margin: "0 0 10px 0", fontSize: "16px", color: "#4b5563", fontWeight: "600" },
  
  mapOverlay: { 
    position: "absolute", top: "20px", left: "20px", 
    backgroundColor: "rgba(255,255,255,0.9)", backdropFilter: "blur(4px)",
    padding: "10px 16px", borderRadius: "12px", 
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 10 
  },
  
  alertBox: { 
    marginTop: "10px", padding: "8px", 
    backgroundColor: "#fffbeb", color: "#b45309", border: "1px solid #fcd34d",
    borderRadius: "8px", fontSize: "13px", textAlign: "center" 
  }
};