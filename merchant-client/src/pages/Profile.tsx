import React, { useEffect, useState } from "react";
import { fetchProfile, updateProfile } from "../api/profile";

export default function MerchantProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");

  const [addressDetail, setAddressDetail] = useState("");

  // 密码修改
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const load = async () => {
    try {
      const data = await fetchProfile();

      if (data.role !== "merchant") {
        alert("仅商家可以访问此页面");
        return;
      }

      setUsername(data.username);
      setPhone(data.phone || "");
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

  const onSave = async () => {
    if (!username.trim()) return alert("用户名不能为空");
    if (!phone.trim()) return alert("手机号不能为空");
    if (!addressDetail.trim()) return alert("地址不能为空");

    // 密码校验
    if (newPwd || confirmPwd || oldPwd) {
      if (!oldPwd) return alert("请输入原密码");
      if (!newPwd) return alert("请输入新密码");
      if (newPwd !== confirmPwd) return alert("两次输入的新密码不一致");
    }

    setSaving(true);

    try {
      await updateProfile({
        username,
        phone,
        address: {
          detail: addressDetail,
          lng: null,
          lat: null,
        },

        ...(newPwd
          ? {
              oldPassword: oldPwd,
              newPassword: newPwd,
            }
          : {}),
      });

      alert("保存成功！");
      load();
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.error || "保存失败，请查看控制台");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>加载中...</div>;

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      <h2>商家账号信息</h2>

      {/* 用户名 */}
      <div style={{ marginTop: 20 }}>
        <label>商家名称</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* 手机号 */}
      <div style={{ marginTop: 20 }}>
        <label>联系电话</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="请输入手机号"
          style={inputStyle}
        />
      </div>

      {/* 地址 */}
      <div style={{ marginTop: 20 }}>
        <label>商家地址</label>
        <textarea
          rows={3}
          value={addressDetail}
          onChange={(e) => setAddressDetail(e.target.value)}
          style={{
            width: "100%",
            padding: 8,
            resize: "vertical",
            marginTop: 6,
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
        />
      </div>

      {/* 分割线 */}
      <div
        style={{
          height: 1,
          background: "#ddd",
          margin: "30px 0 20px",
        }}
      />

      <h3>修改密码（可选）</h3>

      {/* 原密码 */}
      <div style={{ marginTop: 15 }}>
        <label>原密码</label>
        <input
          type="password"
          value={oldPwd}
          onChange={(e) => setOldPwd(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* 新密码 */}
      <div style={{ marginTop: 15 }}>
        <label>新密码</label>
        <input
          type="password"
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* 确认密码 */}
      <div style={{ marginTop: 15 }}>
        <label>确认新密码</label>
        <input
          type="password"
          value={confirmPwd}
          onChange={(e) => setConfirmPwd(e.target.value)}
          style={inputStyle}
        />
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        style={{
          marginTop: 30,
          width: "100%",
          padding: "10px 14px",
          background: saving ? "#888" : "#007bff",
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 8,
  marginTop: 6,
  borderRadius: 6,
  border: "1px solid #ccc",
};
