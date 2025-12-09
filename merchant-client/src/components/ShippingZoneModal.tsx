import React, { useRef, useEffect } from "react";
import { MapContainer, TileLayer, FeatureGroup } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

// 引入我们之前写好的 API
import { saveDeliveryZone } from "../api/profile";

// === 修复 Leaflet 图标丢失的已知问题 ===
// 这一步必须有，否则地图上的点标记会显示不出来
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;
// ==========================================

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ShippingZoneModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const featureGroupRef = useRef<any>(null);

  // 如果弹窗没打开，不渲染任何内容
  if (!isOpen) return null;

  const handleSave = async () => {
    // 1. 获取绘图层
    const layers = featureGroupRef.current?.getLayers();
    
    if (!layers || layers.length === 0) {
      alert("请先在地图上绘制一个多边形区域！");
      return;
    }

    // 2. 取最后一个绘制的图形（假设我们只允许一个配送范围）
    // 如果允许画多个，这里需要遍历 layers
    const layer = layers[layers.length - 1];
    
    // 3. 转为 GeoJSON 格式
    const geoJSON = layer.toGeoJSON();
    
    // GeoJSON 的 coordinates 格式通常是 [经度, 纬度]
    // 形状: [ [ [lng, lat], [lng, lat], ... ] ]
    const coordinates = geoJSON.geometry.coordinates;

    try {
      console.log("正在保存区域坐标:", coordinates);
      await saveDeliveryZone(coordinates);
      alert("配送范围已保存成功！");
      onClose();
    } catch (err: any) {
      console.error(err);
      alert("保存失败: " + (err.message || "未知错误"));
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.content}>
        <div style={styles.header}>
          <h3 style={{ margin: 0 }}>划定配送范围</h3>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>
        
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
          请使用右上角的多边形工具 <span style={{fontWeight:'bold'}}>⬠</span> 在地图上绘制您的配送区域。
        </p>

        {/* 地图容器 */}
        <div style={styles.mapWrapper}>
          <MapContainer 
            center={[30.657, 104.066]} // 默认中心点 (你可以改成你的城市中心，例如成都)
            zoom={12} 
            style={{ height: "100%", width: "100%" }}
          >
            {/* 地图底图 (OpenStreetMap) */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {/* 绘图控件组 */}
            <FeatureGroup ref={featureGroupRef}>
              <EditControl
                position="topright"
                draw={{
                  rectangle: false, // 禁用矩形
                  circle: false,    // 禁用圆形 (MongoDB GeoJSON 主要是多边形支持最好)
                  circlemarker: false,
                  marker: false,    // 禁用点标记
                  polyline: false,  // 禁用线条
                  polygon: true,    // ✅ 只开启多边形绘制
                }}
              />
            </FeatureGroup>
          </MapContainer>
        </div>

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.btnCancel}>取消</button>
          <button onClick={handleSave} style={styles.btnSave}>保存范围</button>
        </div>
      </div>
    </div>
  );
};

// 简单的内联样式
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    backdropFilter: 'blur(3px)'
  },
  content: {
    backgroundColor: "#fff",
    borderRadius: "8px",
    width: "800px",
    maxWidth: "95%",
    height: "600px",
    display: "flex",
    flexDirection: "column",
    padding: "20px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#999'
  },
  mapWrapper: {
    flex: 1,
    border: "1px solid #ddd",
    borderRadius: "4px",
    overflow: "hidden",
    marginBottom: "15px",
    position: "relative" // 确保 Leaflet 控件定位正确
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px"
  },
  btnCancel: {
    padding: "8px 16px",
    background: "white",
    border: "1px solid #ccc",
    borderRadius: "4px",
    cursor: "pointer"
  },
  btnSave: {
    padding: "8px 16px",
    background: "#1890ff",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "bold"
  }
};

export default ShippingZoneModal;