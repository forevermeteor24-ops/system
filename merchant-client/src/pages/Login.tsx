import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);

    try {
      const res = await fetch("https://system-backend.zeabur.app/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "登录失败");
        setLoading(false);
        return;
      }

      /* 保存 token 和角色 */
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);

      alert("登录成功！");

      /* 按角色跳转 */
      if (data.role === "merchant") navigate("/merchant/orders");
      else navigate("/orders");

    } catch (err) {
      console.error(err);
      alert("登录失败，请检查网络");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "70px auto",
        padding: 20,
        borderRadius: 8,
        background: "#fff",
        boxShadow: "0 0 10px rgba(0,0,0,0.06)",
      }}
    >
      <h2 style={{ textAlign: "center", marginBottom: 25 }}>登录</h2>

      <form onSubmit={handleLogin}>
        {/* 用户名 */}
        <div style={{ marginBottom: 15 }}>
          <label>用户名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={inputStyle}
          />
        </div>

        {/* 密码 + 小眼睛 */}
        <div style={{ marginBottom: 15, position: "relative" }}>
          <label>密码</label>
          <input
            type={showPwd ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
          <span
            onClick={() => setShowPwd(!showPwd)}
            style={eyeStyle}
          >
            {showPwd ? "🙈" : "👁️"}
          </span>
        </div>

        {/* 登录按钮 */}
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
          {loading ? "登录中..." : "登录"}
        </button>
      </form>

      {/* 注册跳转 */}
      <div style={{ textAlign: "center", marginTop: 20 }}>
        还没有账号？
        <Link to="/register" style={{ marginLeft: 5, color: "#4a90e2" }}>
          马上注册
        </Link>
      </div>
    </div>
  );
}

/* 样式 */
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 40px 10px 10px",
  borderRadius: 6,
  border: "1px solid #ccc",
  marginTop: 5,
};

const eyeStyle: React.CSSProperties = {
  position: "absolute",
  right: 10,
  top: 38,
  cursor: "pointer",
  fontSize: 20,
};
