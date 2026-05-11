import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const defaultRegister = {
  username: "",
  email: "",
  password: "",
  first_name: "",
  last_name: "",
  age: "",
  year: "",
  course: "",
  sex: "prefer_not"
};

export default function AuthScreen() {
  const { login, register, loading } = useAuth();
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [registerData, setRegisterData] = useState(defaultRegister);

  const onLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await login(loginData);
    } catch (err) {
      setError(err.message);
    }
  };

  const onRegister = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await register({
        ...registerData,
        age: registerData.age ? Number(registerData.age) : null
      });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <h1>Event Tracker</h1>
        <p>Attendance, reporting, committee workflow, and analytics in one platform.</p>
        <div className="auth-switch">
          <button onClick={() => setMode("login")} className={mode === "login" ? "active" : ""}>
            Login
          </button>
          <button onClick={() => setMode("register")} className={mode === "register" ? "active" : ""}>
            Register
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {mode === "login" ? (
          <form onSubmit={onLogin} className="form-grid">
            <input
              required
              placeholder="Username"
              value={loginData.username}
              onChange={(e) => setLoginData((v) => ({ ...v, username: e.target.value }))}
            />
            <input
              required
              type="password"
              placeholder="Password"
              value={loginData.password}
              onChange={(e) => setLoginData((v) => ({ ...v, password: e.target.value }))}
            />
            <button disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
          </form>
        ) : (
          <form onSubmit={onRegister} className="form-grid">
            <input
              required
              placeholder="Username"
              value={registerData.username}
              onChange={(e) => setRegisterData((v) => ({ ...v, username: e.target.value }))}
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={registerData.email}
              onChange={(e) => setRegisterData((v) => ({ ...v, email: e.target.value }))}
            />
            <input
              required
              type="password"
              placeholder="Password"
              value={registerData.password}
              onChange={(e) => setRegisterData((v) => ({ ...v, password: e.target.value }))}
            />
            <input
              placeholder="First name"
              value={registerData.first_name}
              onChange={(e) => setRegisterData((v) => ({ ...v, first_name: e.target.value }))}
            />
            <input
              placeholder="Last name"
              value={registerData.last_name}
              onChange={(e) => setRegisterData((v) => ({ ...v, last_name: e.target.value }))}
            />
            <input
              type="number"
              placeholder="Age"
              value={registerData.age}
              onChange={(e) => setRegisterData((v) => ({ ...v, age: e.target.value }))}
            />
            <input
              placeholder="Year"
              value={registerData.year}
              onChange={(e) => setRegisterData((v) => ({ ...v, year: e.target.value }))}
            />
            <input
              placeholder="Course"
              value={registerData.course}
              onChange={(e) => setRegisterData((v) => ({ ...v, course: e.target.value }))}
            />
            <select value={registerData.sex} onChange={(e) => setRegisterData((v) => ({ ...v, sex: e.target.value }))}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="prefer_not">Prefer not to say</option>
              <option value="other">Other</option>
            </select>
            <button disabled={loading}>{loading ? "Creating..." : "Create account"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
