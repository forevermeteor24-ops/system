import React, { useEffect, useState } from "react";
import { fetchProfile, updateProfile } from "../api/profile";

export default function UserProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [username, setUsername] = useState("");
  const [addressDetail, setAddressDetail] = useState("");

  /** 加载用户资料 */
  const load = async () => {
    try {
      const data = await fetchProfile();

      if (data.role !== "user") {
        alert("仅用户可以访问此页面");
        return;
      }

      setUsername(data.username);
      setAddressDetail(data.address?.detail || "");
    } catch (err) {
      console.error(err);
      alert("加载资料失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /** 保存更新 */
  const onSave = async () => {
    if (!username.trim()) return alert("用户名不能为空");
    if (!addressDetail.trim()) return alert("收货地址不能为空");

    setSaving(true);
    try {
      await updateProfile({
        username,
        address: {
          detail: addressDetail,
          lng: null,
          lat: null,
        },
      });

      alert("资料已更新！");
      load();
    } catch (err) {
      console.error(err);
      alert("保存失败，请查看控制台");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>加载中...</div>;

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      <h2>用户账号信息</h2>

      {/* 用户名 */}
      <div style={{ marginTop: 20 }}>
        <label>用户名</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            marginTop: 6,
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
        />
      </div>

      {/* 收货地址 */}
      <div style={{ marginTop: 20 }}>
        <label>收货地址</label>
        <textarea
          rows={3}
          value={addressDetail}
          onChange={(e) => setAddressDetail(e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            resize: "vertical",
            marginTop: 6,
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
        />
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        style={{
          marginTop: 30,
          width: "100%",
          padding: "10px 14px",
          background: saving ? "#888" : "#1677ff",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: saving ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "保存中..." : "保存修改"}
      </button>
    </div>
  );
}
