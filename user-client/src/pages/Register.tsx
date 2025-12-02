import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function Register() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [phone, setPhone] = useState("");   // ⭐ 新增手机号

  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPwd) {
      alert("两次输入的密码不一致！");
      return;
    }

    if (!phone || phone.trim().length < 5) {
      alert("请输入正确的手机号！");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("https://system-backend.zeabur.app/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          role: "user", // 固定为商家
          phone,           // ⭐ 新增：手机号
          address: {
            detail: address,
            lng: null,
            lat: null,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "注册失败");
        setLoading(false);
        return;
      }

      alert("用户注册成功，请登录！");
      navigate("/login");

    } catch (err) {
      console.error(err);
      alert("注册失败，请检查网络");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "50px auto",
        padding: 20,
        borderRadius: 8,
        background: "#fff",
        boxShadow: "0 0 10px rgba(0,0,0,0.05)",
      }}
    >
      <h2 style={{ textAlign: "center", marginBottom: 20 }}>用户注册</h2>

      <form onSubmit={handleRegister}>

        {/* 用户名 */}
        <div style={{ marginBottom: 15 }}>
          <label>用户账号</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            placeholder="请输入用户登录名"
            style={inputStyle}
          />
        </div>

        {/* 手机号 ⭐ */}
        <div style={{ marginBottom: 15 }}>
          <label>联系电话</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            placeholder="请输入用户联系电话"
            style={inputStyle}
          />
        </div>

        {/* 密码 */}
        <div style={{ marginBottom: 15, position: "relative" }}>
          <label>密码</label>
          <input
            type={showPwd ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="请输入密码"
            style={inputStyle}
          />
          <span
            style={eyeStyle}
            onClick={() => setShowPwd(!showPwd)}
          >
            {showPwd ? "🙈" : "👁️"}
          </span>
        </div>

        {/* 确认密码 */}
        <div style={{ marginBottom: 15 }}>
          <label>确认密码</label>
          <input
            type={showPwd ? "text" : "password"}
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            required
            placeholder="请再次输入密码"
            style={inputStyle}
          />
        </div>

        {/* 地址 */}
        <div style={{ marginBottom: 15 }}>
          <label>收货地址</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            placeholder="请输入收货地址（如：北京市海淀区xxx）"
            style={inputStyle}
          />
        </div>

        {/* 注册按钮 */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            background: "#4a90e2",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 16,
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "注册中..." : "立即注册"}
        </button>
      </form>

      <div style={{ marginTop: 20, textAlign: "center" }}>
        已有账号？
        <Link to="/login" style={{ color: "#4a90e2", marginLeft: 5 }}>
          立即登录
        </Link>
      </div>
    </div>
  );
}

/* 输入框样式 */
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 40px 10px 10px",
  marginTop: 5,
  borderRadius: 6,
  border: "1px solid #ccc",
};

/* 小眼睛按钮 */
const eyeStyle: React.CSSProperties = {
  position: "absolute",
  right: 10,
  top: 38,
  cursor: "pointer",
  fontSize: 20,
};
