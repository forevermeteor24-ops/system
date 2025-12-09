import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, FeatureGroup, useMap, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";

// 引入 API
import { saveDeliveryZone, fetchProfile } from "../api/profile";

// === 修复 Leaflet 图标丢失问题 ===
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// === 辅助组件：用于动态移动地图视角 ===
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13); // 13 是缩放级别
  }, [center, map]);
  return null;
}

// === 自定义绘图控件 ===
const DrawControl = ({ onCreated }: { onCreated: (layer: any) => void }) => {
  const map = useMap();
  const drawControlRef = useRef<any>(null);

  useEffect(() => {
    if (!map) return;

    // @ts-ignore
    const drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false,
        polygon: {
          allowIntersection: false,
          showArea: true,
        },
      },
    });

    map.addControl(drawControl);
    drawControlRef.current = drawControl;

    const handleCreated = (e: any) => {
      onCreated(e.layer);
    };

    map.on(L.Draw.Event.CREATED, handleCreated);

    return () => {
      map.removeControl(drawControl);
      map.off(L.Draw.Event.CREATED, handleCreated);
    };
  }, [map, onCreated]);

  return null;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ShippingZoneModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const featureGroupRef = useRef<any>(null);
  // 默认中心 (成都)，如果获取不到商家地址则使用此地址
  const [center, setCenter] = useState<[number, number]>([30.657, 104.066]);
  const [loading, setLoading] = useState(true);

  // 打开弹窗时获取商家位置
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchProfile().then((data) => {
        // 注意：Mongo存储通常是 [lng, lat], Leaflet 需要 [lat, lng]
        // 你的接口 address 结构是 { lng, lat }
        if (data.address && data.address.lat && data.address.lng) {
          console.log("定位到商家地址:", data.address);
          setCenter([data.address.lat, data.address.lng]);
        }
        setLoading(false);
      }).catch(err => {
        console.error("获取位置失败", err);
        setLoading(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDrawCreated = (layer: any) => {
    if (featureGroupRef.current) {
      featureGroupRef.current.clearLayers();
      featureGroupRef.current.addLayer(layer);
    }
  };

  const handleSave = async () => {
    if (!featureGroupRef.current) return;
    const layers = featureGroupRef.current.getLayers();
    
    if (layers.length === 0) {
      alert("请先在地图上绘制一个多边形区域！");
      return;
    }

    const layer = layers[layers.length - 1];
    const geoJSON = layer.toGeoJSON();
    const coordinates = geoJSON.geometry.coordinates; // [[[lng, lat], ...]]

    try {
      await saveDeliveryZone(coordinates);
      alert("配送范围已保存成功！");
      onClose();
    } catch (err: any) {
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
          以您的店铺（蓝色标记）为中心，使用右上角 <span style={{fontWeight:'bold'}}>⬠</span> 工具绘制区域。
        </p>

        <div style={styles.mapWrapper}>
          <MapContainer 
            // 这里设置初始中心，后续由 ChangeView 控制移动
            center={center} 
            zoom={13} 
            style={{ height: "100%", width: "100%" }}
          >
            <ChangeView center={center} />

            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {/* 显示商家位置的标记 */}
            <Marker position={center}>
              <Popup>
                <b>您的店铺位置</b><br />
                以此为中心规划配送
              </Popup>
            </Marker>

            <FeatureGroup ref={featureGroupRef} />
            <DrawControl onCreated={handleDrawCreated} />
          </MapContainer>
          
          {loading && (
            <div style={styles.loader}>
              📍 正在定位店铺位置...
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.btnCancel}>取消</button>
          <button onClick={handleSave} style={styles.btnSave}>保存范围</button>
        </div>
      </div>
    </div>
  );
};

// 样式
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center",
    zIndex: 1000, backdropFilter: 'blur(3px)'
  },
  content: {
    backgroundColor: "#fff", borderRadius: "8px", width: "800px", maxWidth: "95%", height: "600px",
    display: "flex", flexDirection: "column", padding: "20px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' },
  mapWrapper: { 
    flex: 1, border: "1px solid #ddd", borderRadius: "4px", overflow: "hidden", 
    marginBottom: "15px", position: "relative" 
  },
  footer: { display: "flex", justifyContent: "flex-end", gap: "10px" },
  btnCancel: { padding: "8px 16px", background: "white", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer" },
  btnSave: { padding: "8px 16px", background: "#1890ff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" },
  loader: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(255,255,255,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center',
    zIndex: 1000, color: '#333', fontWeight: 'bold'
  }
};

export default ShippingZoneModal;