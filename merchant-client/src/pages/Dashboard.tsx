import React, { useEffect, useState, useRef } from "react";
import * as echarts from "echarts";

// 引入高德地图扩展
import "echarts-extension-amap"; 
// 引入高德加载器
import AMapLoader from "@amap/amap-jsapi-loader";

// ----------- 类型定义 (保持不变) -----------
type HeatPoint = [number, number, number]; 
type DeliveryStats = { avgDeliveryTime: number; count: number };
type AbnormalOrder = { _id: string; title: string; eta: number };

const BASE = "https://system-backend.zeabur.app";

// 🔴 请替换为你截图里的 Key
const AMAP_KEY = "3b8390692d5bf40f7a9b065a4e77b7a4"; // JS-API-Key
const AMAP_SECURITY_CODE = "77a072080cb11c735ea19b7c59ad9781"; // 安全密钥

export default function Dashboard() {
  const [heatmapData, setHeatmapData] = useState<HeatPoint[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats>({ avgDeliveryTime: 0, count: 0 });
  const [abnormalOrders, setAbnormalOrders] = useState<AbnormalOrder[]>([]);
  const [fixedCount, setFixedCount] = useState(0);

  // 状态：地图 API 是否加载完成
  const [mapReady, setMapReady] = useState(false);

  const mapChartRef = useRef<HTMLDivElement>(null);
  const gaugeChartRef = useRef<HTMLDivElement>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);

  const mapInstance = useRef<echarts.ECharts | null>(null);
  const gaugeInstance = useRef<echarts.ECharts | null>(null);
  const pieInstance = useRef<echarts.ECharts | null>(null);

  // 1. 初始化高德地图脚本
  useEffect(() => {
    // 设置安全密钥 (必须在加载 API 之前)
    (window as any)._AMapSecurityConfig = {
      securityJsCode: AMAP_SECURITY_CODE,
    };

    AMapLoader.load({
      key: AMAP_KEY, 
      version: "2.0",
      plugins: ["AMap.Scale", "AMap.ToolBar"], // 需要用到的插件
    })
      .then((AMap) => {
        console.log("高德地图加载成功");
        setMapReady(true);
      })
      .catch((e) => {
        console.error("高德地图加载失败", e);
      });
  }, []);

  // 2. 请求数据 (保持不变)
  useEffect(() => {
    async function loadData() {
      try {
        const token = localStorage.getItem("token");
        const headers = { "Authorization": token ? `Bearer ${token}` : "", "Content-Type": "application/json" };

        const [heatRes, statRes, abnRes] = await Promise.all([
          fetch(`${BASE}/api/dashboard/heatmap`, { headers }),
          fetch(`${BASE}/api/dashboard/delivery-stats`, { headers }),
          fetch(`${BASE}/api/dashboard/abnormal-orders`, { headers }),
        ]);

        if (heatRes.ok) {
          const data = await heatRes.json();
          setHeatmapData(data.points || []);
        }

        let currentStats: DeliveryStats = { avgDeliveryTime: 0, count: 0 };
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
      } catch (err) { console.error(err); }
    }
    loadData();
  }, []);

  // 3. 渲染地图 (改为使用 amap 组件)
  useEffect(() => {
    if (!mapReady || !mapChartRef.current) return;

    if (!mapInstance.current) {
      mapInstance.current = echarts.init(mapChartRef.current);
    }

    // 格式化数据：[lng, lat, value]
    const formattedPoints = heatmapData.map((p) => [p[1], p[0], p[2]]);

    const option: any = {
      tooltip: {
        trigger: "item"
      },
      // amap 配置是插件特有的，标准类型里没有，所以必须用 any
      amap: {
        center: [104.114129, 37.550339],
        zoom: 4,
        resizeEnable: true,
        mapStyle: "amap://styles/whitesmoke",
        renderOnMoving: true,
        echartsLayerZIndex: 2000,
      },
      visualMap: {
        min: 0,
        max: 50,
        calculable: true,
        inRange: { color: ["#50a3ba", "#eac736", "#d94e5d"] },
        bottom: 30,
        left: 20,
      },
      series: [
        {
          type: "heatmap",
          // 🟢 因为 option 是 any，这里写 "amap" 就不会报错了
          coordinateSystem: "amap",
          data: formattedPoints,
          pointSize: 10,
          blurSize: 15,
          itemStyle: { opacity: 0.8 }
        }
      ],
    };

    mapInstance.current.setOption(option);

    // 获取高德地图实例，如果你想原生操作地图（比如添加路况图层）
    // const amapComponent = mapInstance.current.getModel().getComponent('amap');
    // const amap = amapComponent.getAMap(); 

    const handleResize = () => mapInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mapReady, heatmapData]);

  // 4. 仪表盘 (保持逻辑，略微调整样式适配)
  useEffect(() => {
    if (!gaugeChartRef.current) return;
    if (!gaugeInstance.current) gaugeInstance.current = echarts.init(gaugeChartRef.current);

    const avgMins = Math.round(deliveryStats.avgDeliveryTime / 60000);
    const option: echarts.EChartsOption = {
      series: [{
        type: "gauge",
        min: 0, max: 60,
        axisLine: { lineStyle: { width: 15, color: [[0.3, "#10B981"], [0.7, "#3B82F6"], [1, "#EF4444"]] } },
        pointer: { width: 5 },
        detail: { formatter: "{value}分", fontSize: 20, offsetCenter: [0, "70%"] },
        data: [{ value: avgMins, name: "平均配送时效" }]
      }]
    };
    gaugeInstance.current.setOption(option);
  }, [deliveryStats]);

  // 5. 饼图 (保持逻辑)
  useEffect(() => {
    if (!pieChartRef.current) return;
    if (!pieInstance.current) pieInstance.current = echarts.init(pieChartRef.current);
    const total = deliveryStats.count;
    const normal = total > fixedCount ? total - fixedCount : 0;
    
    const option: echarts.EChartsOption = {
       tooltip: { trigger: 'item' },
       legend: { bottom: 0 },
       color: ['#10B981', '#F59E0B', '#EF4444'],
       series: [{
         type: 'pie',
         radius: ['40%', '70%'],
         avoidLabelOverlap: false,
         label: { show: false },
         emphasis: { label: { show: true, fontSize: '18', fontWeight: 'bold' } },
         data: total === 0 ? [{value:0, name:'暂无'}] : [
           { value: normal, name: '正常' },
           { value: fixedCount, name: '已修复' },
           { value: abnormalOrders.length, name: '异常' }
         ]
       }]
    };
    pieInstance.current.setOption(option);
  }, [deliveryStats, fixedCount, abnormalOrders]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>🚚 实时物流监控驾驶舱 (高德版)</h1>
      </header>

      <div style={styles.grid}>
        {/* 左侧：地图区域，移除 padding 让他看起来像个大屏 */}
        <div style={{ ...styles.mainCard, padding: 0, position: 'relative' }}>
          <div ref={mapChartRef} style={{ width: "100%", height: "100%", minHeight: "500px", borderRadius: "16px" }}></div>
          {/* 添加一个悬浮标题 */}
          <div style={styles.mapTitleOverlay}>📍 实时热力分布</div>
        </div>

        {/* 右侧数据列 */}
        <div style={styles.sideColumn}>
          <div style={styles.statCard}>
            <h3 style={styles.cardTitle}>⏱️ 配送时效</h3>
            <div ref={gaugeChartRef} style={{ width: "100%", height: "200px" }}></div>
          </div>
          <div style={styles.statCard}>
             <h3 style={styles.cardTitle}>🛡️ 订单健康度</h3>
            <div ref={pieChartRef} style={{ width: "100%", height: "200px" }}></div>
            {fixedCount > 0 && <div style={styles.alertBox}>⚡ 已自动修复 {fixedCount} 单异常</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", backgroundColor: "#f3f4f6", padding: "20px" },
  header: { marginBottom: "20px", padding: "15px", backgroundColor: "#fff", borderRadius: "12px", boxShadow: "0 2px 5px rgba(0,0,0,0.05)" },
  title: { margin: 0, fontSize: "22px", color: "#1f2937" },
  grid: { display: "grid", gridTemplateColumns: "7fr 3fr", gap: "20px", height: "calc(100vh - 110px)" },
  mainCard: { backgroundColor: "#fff", borderRadius: "16px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", overflow: "hidden" },
  sideColumn: { display: "flex", flexDirection: "column", gap: "20px" },
  statCard: { flex: 1, backgroundColor: "#fff", borderRadius: "16px", padding: "15px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  cardTitle: { margin: "0 0 10px 0", fontSize: "16px", color: "#6b7280" },
  alertBox: { marginTop: "10px", padding: "5px 10px", backgroundColor: "#ecfdf5", color: "#047857", borderRadius: "6px", fontSize: "12px" },
  mapTitleOverlay: { position: "absolute", top: "20px", left: "20px", backgroundColor: "rgba(255,255,255,0.9)", padding: "8px 16px", borderRadius: "8px", fontWeight: "bold", zIndex: 999, boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }
};