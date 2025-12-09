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
type Point = [number, number, number];
type DeliveryStats = { avgDeliveryTime: number; count: number };
type AbnormalOrder = { _id: string; title: string; eta: number };

const BASE = "https://system-backend.zeabur.app";

// 📍 静态演示数据 [经度, 纬度, 数量]
const MOCK_POINTS: Point[] = [
  [116.40, 39.90, 50], // 北京 - 50单
  [121.47, 31.23, 40], // 上海 - 40单
  [113.26, 23.12, 30], // 广州 - 30单
  [104.06, 30.67, 20], // 成都 - 20单
  [102.71, 25.04, 5],  // 昆明 - 5单
];

export default function Dashboard() {
  const [mapData, setMapData] = useState<Point[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats>({ avgDeliveryTime: 0, count: 0 });
  const [abnormalOrders, setAbnormalOrders] = useState<AbnormalOrder[]>([]);
  const [fixedCount, setFixedCount] = useState(0);
  const [mapReady, setMapReady] = useState(false);

  const mapChartRef = useRef<HTMLDivElement>(null);
  const gaugeChartRef = useRef<HTMLDivElement>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);

  const mapInstance = useRef<echarts.ECharts | null>(null);
  const gaugeInstance = useRef<echarts.ECharts | null>(null);
  const pieInstance = useRef<echarts.ECharts | null>(null);

  // 1. 加载高德地图 API
  useEffect(() => {
    if ((window as any).AMap) {
      setMapReady(true);
      return;
    }
    const existingScript = document.querySelector('script[src*="webapi.amap.com/maps"]');
    if (existingScript) {
        const checkInterval = setInterval(() => {
            if ((window as any).AMap) {
                clearInterval(checkInterval);
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
        const headers = { Authorization: token ? `Bearer ${token}` : "", "Content-Type": "application/json" };

        const [heatRes, statRes, abnRes] = await Promise.all([
          fetch(`${BASE}/api/dashboard/heatmap`, { headers }),
          fetch(`${BASE}/api/dashboard/delivery-stats`, { headers }),
          fetch(`${BASE}/api/dashboard/abnormal-orders`, { headers }),
        ]);

        if (heatRes.ok) {
          const data = await heatRes.json();
          const rawPoints = data.points || [];
          if (rawPoints.length === 0) {
            setMapData(MOCK_POINTS);
          } else {
            // [lat, lng, val] -> [lng, lat, val]
            const points = rawPoints.map((p: any) => [p[1], p[0], p[2]]);
            setMapData(points);
          }
        } else {
          setMapData(MOCK_POINTS);
        }

        let currentStats = { avgDeliveryTime: 0, count: 0 };
        if (statRes.ok) {
          currentStats = await statRes.json();
          setDeliveryStats(currentStats);
        }

        if (abnRes.ok) {
          const data = await abnRes.json();
          const zombies = data.abnormal || [];
          setAbnormalOrders(zombies);
          if (zombies.length > 0) {
            setFixedCount(zombies.length);
            setDeliveryStats({ ...currentStats, count: currentStats.count + zombies.length });
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
        setMapData(MOCK_POINTS);
      }
    }
    loadData();
  }, []);

  // 3. 渲染地图 (核心修改部分)
  useEffect(() => {
    if (!mapReady || !mapChartRef.current) return;

    if (mapInstance.current) {
        mapInstance.current.dispose();
    }
    mapInstance.current = echarts.init(mapChartRef.current);

    const option: any = {
      // 🟢 改进 1：悬浮提示，显示具体的数值
      tooltip: {
        trigger: "item",
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderWidth: 0,
        textStyle: { color: '#333' },
        formatter: (params: any) => {
          // params.value[2] 就是订单数量
          return `
            <div style="font-weight:bold; font-size:14px; margin-bottom:5px;">📍 区域详情</div>
            经度: ${params.value[0]}<br/>
            纬度: ${params.value[1]}<br/>
            <div style="margin-top:5px; color:#ef4444; font-weight:bold;">
              📦 订单量: ${params.value[2]} 单
            </div>
          `;
        }
      },
      amap: {
        center: [105.0, 36.0],
        zoom: 4,
        resizeEnable: true,
        mapStyle: "amap://styles/normal",
        renderOnMoving: true,
        echartsLayerInteractive: true, 
      },
      visualMap: {
        show: false,
        min: 0,
        max: 60,
        inRange: { color: ["#79ccff", "#fffb00", "#ff3333"] }
      },
      series: [
        // 1. 呼吸点 (显示文字标签)
        {
          name: "实时订单",
          type: "effectScatter",
          coordinateSystem: "amap",
          data: mapData,
          // 🟢 改进 2：动态大小，订单越多，圆点越大 (最小15px，最大30px)
          symbolSize: function (val: any) {
            return Math.min(Math.max(val[2] / 2, 15), 30);
          },
          showEffectOn: "render",
          rippleEffect: { brushType: "stroke", scale: 4 },
          itemStyle: { color: "#ef4444", shadowBlur: 10, shadowColor: "#333" },
          
          // 🟢 改进 3：直接在地图上显示数字
          label: {
            show: true,           // 开启标签
            position: 'top',      // 显示在圆点上方
            formatter: '{@2}单',  // 格式：取数组第3个值(index 2) + "单"
            color: '#000',        // 黑色文字
            fontWeight: 'bold',   // 加粗
            fontSize: 12,
            backgroundColor: 'rgba(255, 255, 255, 0.7)', // 半透明白底，防止看不清
            padding: [2, 4],      // 内边距
            borderRadius: 4       // 圆角
          },
          zlevel: 1,
        },
        // 2. 热力图
        {
            name: "热力图",
            type: "heatmap",
            coordinateSystem: "amap",
            data: mapData,
            pointSize: 40,
            blurSize: 40,
            itemStyle: { opacity: 0.6 }
        }
      ],
    };

    mapInstance.current.setOption(option);

    const handleResize = () => mapInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mapReady, mapData]);

  // 4. 其他图表 (保持不变)
  useEffect(() => {
    if (gaugeChartRef.current && !gaugeInstance.current) gaugeInstance.current = echarts.init(gaugeChartRef.current);
    const avgMins = Math.round(deliveryStats.avgDeliveryTime / 60000);
    gaugeInstance.current?.setOption({
      series: [{
        type: "gauge", max: avgMins > 60 ? 1440 : 60,
        axisLine: { lineStyle: { width: 10, color: [[0.3, "#10B981"], [0.7, "#3B82F6"], [1, "#EF4444"]] } },
        detail: { formatter: "{value}分", fontSize: 16 }, data: [{ value: avgMins, name: "时效" }]
      }]
    });

    if (pieChartRef.current && !pieInstance.current) pieInstance.current = echarts.init(pieChartRef.current);
    const total = deliveryStats.count;
    pieInstance.current?.setOption({
      series: [{
        type: "pie", radius: ['50%', '70%'], label: { show: false },
        data: total === 0 ? [{value:0, name:'暂无'}] : [
          { value: total > fixedCount ? total - fixedCount : 0, name: '正常', itemStyle: {color: '#10B981'} },
          { value: fixedCount, name: '已修复', itemStyle: {color: '#F59E0B'} },
          { value: abnormalOrders.length, name: '异常', itemStyle: {color: '#EF4444'} }
        ]
      }]
    });
  }, [deliveryStats, fixedCount, abnormalOrders]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>🚚 物流实时大屏</h1>
        <div style={styles.badge}>🟢 系统正常</div>
      </header>
      <div style={styles.grid}>
        <div style={{ ...styles.card, padding: 0, position: 'relative' }}>
          <div ref={mapChartRef} style={{ width: "100%", height: "600px", borderRadius: "16px" }}></div>
          <div style={styles.overlay}>📍 实时分布</div>
        </div>
        <div style={styles.column}>
          <div style={styles.card}><h3>⏱️ 平均时效</h3><div ref={gaugeChartRef} style={{ height: "200px" }}></div></div>
          <div style={styles.card}><h3>🛡️ 订单健康</h3><div ref={pieChartRef} style={{ height: "200px" }}></div></div>
        </div>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", backgroundColor: "#f0f2f5", padding: "20px" },
  header: { display: "flex", justifyContent: "space-between", marginBottom: "20px", background: "#fff", padding: "15px", borderRadius: "10px" },
  title: { margin: 0, fontSize: "20px" },
  badge: { background: "#d1fae5", color: "#065f46", padding: "5px 10px", borderRadius: "20px", fontSize: "12px" },
  grid: { display: "grid", gridTemplateColumns: "7fr 3fr", gap: "20px" },
  card: { background: "#fff", borderRadius: "16px", padding: "15px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" },
  column: { display: "flex", flexDirection: "column", gap: "20px" },
  overlay: { position: "absolute", top: "20px", left: "20px", background: "rgba(255,255,255,0.9)", padding: "8px 15px", borderRadius: "8px", fontWeight: "bold", zIndex: 100 },
};