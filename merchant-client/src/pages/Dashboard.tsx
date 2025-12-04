import React, { useEffect, useState, useRef } from "react";
import * as echarts from "echarts";

// ----------- 类型定义 -----------
type HeatPoint = [number, number, number]; // [lat, lng, value]

type DeliveryStats = {
  avgDeliveryTime: number;
  count: number;
};

type AbnormalOrder = { _id: string; title: string; eta: number };

const BASE = "https://system-backend.zeabur.app";

export default function Dashboard() {
  const [heatmapData, setHeatmapData] = useState<HeatPoint[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats | null>(null);
  const [abnormalOrders, setAbnormalOrders] = useState<AbnormalOrder[]>([]);
  // 注意：这里我们移除了全局 loading 状态对 DOM 的阻塞，确保图表容器尽早渲染
  const [loading, setLoading] = useState(true);

  // 引用 DOM 元素
  const chartDomRef = useRef<HTMLDivElement>(null);
  // 引用 ECharts 实例
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  // 1. 请求数据
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

        if (heatRes.ok) {
          const data = await heatRes.json();
          setHeatmapData(data.points || []);
        }
        if (statRes.ok) {
          const data = await statRes.json();
          setDeliveryStats(data);
        }
        if (abnRes.ok) {
          const data = await abnRes.json();
          setAbnormalOrders(data.abnormal || []);
        }
      } catch (err) {
        console.error("加载失败", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // 2. 【核心修复】初始化与更新合二为一，确保图表始终存在
  useEffect(() => {
    // 如果 DOM 还没准备好，就不执行
    if (!chartDomRef.current) return;

    // A. 获取或初始化实例
    // echarts.getInstanceByDom 可以防止重复初始化报错
    let chart = echarts.getInstanceByDom(chartDomRef.current);
    if (!chart) {
      chart = echarts.init(chartDomRef.current);
      chartInstanceRef.current = chart;
    }

    // ----------------------------------------------------
    // ⭐ 新增：数据聚合逻辑
    // 将相同坐标的点合并，数量相加
    // ----------------------------------------------------
    const aggMap = new Map<string, number[]>();
    
    heatmapData.forEach((item) => {
      // item 是 [lat, lng, 1]
      const lat = item[0];
      const lng = item[1];
      const count = item[2]; // 后端传过来总是 1
      
      // 生成唯一 key，例如 "31.23,121.47"
      const key = `${lat},${lng}`;

      if (aggMap.has(key)) {
        const existing = aggMap.get(key)!;
        // 如果坐标已存在，让数量 +1
        existing[2] += count; 
      } else {
        // 如果是新坐标，存入 Map (注意要复制一份数组，不要修改原数据)
        aggMap.set(key, [lat, lng, count]);
      }
    });

    // 将 Map 转回数组，得到合并后的数据
    const aggregatedData = Array.from(aggMap.values());

    // ----------------------------------------------------
    // 数据转换：[纬度, 经度, 总数] -> [经度, 纬度, 总数]
    // ----------------------------------------------------
    const formattedData = aggregatedData.map((p) => [p[1], p[0], p[2]]);
    
    // 计算最大值 (用于 VisualMap 颜色映射)
    const values = formattedData.map((p) => p[2]);
    const maxVal = values.length ? Math.max(...values) : 10;

    const option: echarts.EChartsOption = {
      backgroundColor: "#fff",
      title: {
        text: "订单地理分布",
        // 显示原始数据点的总数（比如 8 单），而不是合并后的点数（2 个位置）
        subtext: `总订单量: ${heatmapData.length} 单 / 分布位置: ${aggregatedData.length} 个`,
        left: "center",
        top: 10,
      },
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          return `
            <b>📍 坐标聚合</b><br/>
            经度: ${params.value[0]}<br/>
            纬度: ${params.value[1]}<br/>
            <b style="color:#d94e5d; font-size:14px">订单数: ${params.value[2]}</b>
          `;
        }
      },
      grid: {
        top: 80, bottom: 40, left: 50, right: 60,
        containLabel: true,
      },
      xAxis: {
        type: "value",
        scale: true,
        name: "经度",
        nameLocation: "middle",
        nameGap: 25,
        splitLine: { show: true, lineStyle: { type: "dashed" } },
      },
      yAxis: {
        type: "value",
        scale: true,
        name: "纬度",
        splitLine: { show: true, lineStyle: { type: "dashed" } },
      },
      visualMap: {
        min: 0,
        max: maxVal, // 现在最大值会变成 7，颜色就会拉开了
        calculable: true,
        orient: "vertical",
        right: 10,
        top: "center",
        inRange: { color: ["#50a3ba", "#eac736", "#d94e5d"] },
      },
      series: [
        {
          type: "scatter",
          data: formattedData,
          // ⭐ 动态气泡大小：订单越多，圆圈越大
          symbolSize: function (data: any) {
            // 基础大小 15，每多一单增加一些，最大限制在 50
            const size = 15 + (data[2] * 3); 
            return Math.min(size, 50);
          },
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0, 0, 0, 0.5)",
            borderColor: "#fff",
            borderWidth: 1,
          },
        },
      ],
    };

    chart.setOption(option);

    const resizeObserver = new ResizeObserver(() => {
      chart?.resize();
    });
    resizeObserver.observe(chartDomRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [heatmapData]);

  // 计算 KPI
  const avgMins = deliveryStats
    ? Math.round(deliveryStats.avgDeliveryTime / 60000)
    : 0;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>📦 智能物流数据看板</h1>
        <span style={styles.date}>{new Date().toLocaleDateString()}</span>
      </header>

      <div style={styles.grid}>
        {/* 左侧图表卡片 */}
        <div style={styles.mainCard}>
          {/* 
             ⭐ 关键点：
             1. ref 绑定在这里
             2. height: 500px 写死，防止塌陷
             3. border: 1px solid #eee 让你看清楚容器是否存在
          */}
          <div
            ref={chartDomRef}
            style={{
              width: "100%",
              height: "500px",
              border: "1px dashed #e5e7eb", // 调试边框，如果看到这个框说明 div 没问题
              borderRadius: "8px",
            }}
          ></div>
        </div>

        {/* 右侧数据面板 */}
        <div style={styles.sideColumn}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>平均配送时效</div>
            <div style={styles.statValueRow}>
              <span style={styles.statNumber}>{avgMins}</span>
              <span style={styles.statUnit}>分钟</span>
            </div>
            <div style={styles.progressBarBg}>
              <div style={{ ...styles.progressBarFill, width: `${Math.min(avgMins, 100)}%` }}></div>
            </div>
          </div>

          <div style={styles.statCard}>
            <div style={styles.statLabel}>已送达订单</div>
            <div style={styles.statValueRow}>
              <span style={{ ...styles.statNumber, color: "#10B981" }}>
                {deliveryStats?.count || 0}
              </span>
              <span style={styles.statUnit}>单</span>
            </div>
          </div>

          <div style={{ ...styles.statCard, flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ ...styles.statLabel, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
              <span>⚠️ 异常监控</span>
              {abnormalOrders.length > 0 && <span style={styles.badge}>{abnormalOrders.length}</span>}
            </div>
            <div style={styles.listContainer}>
              {abnormalOrders.length === 0 ? (
                <div style={styles.emptyText}>当前无异常订单</div>
              ) : (
                <ul style={styles.list}>
                  {abnormalOrders.map((o) => (
                    <li key={o._id} style={styles.listItem}>
                      <div style={styles.itemTitle}>{o.title}</div>
                      <div style={styles.itemTime}>ETA: {new Date(o.eta).toLocaleTimeString()}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------- 样式保持不变 -----------
const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", backgroundColor: "#f3f4f6", padding: "24px", fontFamily: "sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" },
  title: { fontSize: "24px", fontWeight: "700", color: "#111827", margin: 0 },
  date: { color: "#6b7280", fontSize: "14px" },
  grid: { display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" },
  mainCard: { backgroundColor: "#ffffff", borderRadius: "16px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", padding: "20px" },
  sideColumn: { display: "flex", flexDirection: "column", gap: "24px" },
  statCard: { backgroundColor: "#ffffff", borderRadius: "16px", padding: "20px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" },
  statLabel: { fontSize: "14px", color: "#6b7280", fontWeight: "600" },
  statValueRow: { display: "flex", alignItems: "baseline", marginTop: "8px", gap: "4px" },
  statNumber: { fontSize: "36px", fontWeight: "800", color: "#1f2937", lineHeight: 1 },
  statUnit: { fontSize: "14px", color: "#9ca3af" },
  progressBarBg: { height: "6px", width: "100%", backgroundColor: "#f3f4f6", borderRadius: "3px", marginTop: "12px" },
  progressBarFill: { height: "100%", backgroundColor: "#3b82f6", borderRadius: "3px" },
  badge: { backgroundColor: "#fee2e2", color: "#ef4444", padding: "2px 8px", borderRadius: "99px", fontSize: "12px" },
  listContainer: { flex: 1, overflowY: "auto", marginTop: "10px", maxHeight: "300px" },
  list: { listStyle: "none", padding: 0, margin: 0 },
  listItem: { padding: "12px", borderBottom: "1px solid #f3f4f6" },
  itemTitle: { fontSize: "14px", fontWeight: "500", color: "#374151" },
  itemTime: { fontSize: "12px", color: "#ef4444" },
  emptyText: { textAlign: "center", color: "#9ca3af", fontSize: "14px", marginTop: "20px" },
};