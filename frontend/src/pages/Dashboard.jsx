import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { request } from "../api/client";
import { useAuth } from "../context/AuthContext";

const initialEventForm = {
  name: "",
  description: "",
  location: ""
};

export default function Dashboard() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [live, setLive] = useState(null);
  const [sortBy, setSortBy] = useState("time");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [eventForm, setEventForm] = useState(initialEventForm);
  const [actionLoading, setActionLoading] = useState(null);

  const isAdmin = user?.role === "admin";

  const loadEvents = async () => {
    const data = await request(`/events/?sort_by=${sortBy}`, { token });
    setEvents(data);
  };

  const loadLive = async () => {
    const data = await request("/analytics/live/", { token });
    setLive(data);
  };

  useEffect(() => {
    loadEvents().catch((err) => setError(err.message));
    loadLive().catch(() => null);
    const timer = setInterval(() => {
      loadLive().catch(() => null);
      loadEvents().catch(() => null);
    }, 5000);
    return () => clearInterval(timer);
  }, [sortBy]);

  const showError = (msg) => { setInfo(""); setError(msg); };
  const showInfo = (msg) => { setError(""); setInfo(msg); };

  const runAction = async (actionName, fn) => {
    setActionLoading(actionName);
    showError("");
    showInfo("");
    try {
      await fn();
      return true;
    } catch (err) {
      showError(err.message);
      return false;
    } finally {
      setActionLoading(null);
    }
  };

  const createEvent = async (e) => {
    e.preventDefault();
    const ok = await runAction("create", async () => {
      await request("/events/", { method: "POST", token, body: eventForm });
      setEventForm(initialEventForm);
      await loadEvents();
    });
    if (ok) showInfo("Event created.");
  };

  const downloadAllPDF = async () => {
    const ok = await runAction("pdf", async () => {
      const res = await fetch("http://127.0.0.1:8000/api/analytics/pdf/", {
        headers: { Authorization: `Token ${token}` }
      });
      if (!res.ok) throw new Error("Failed to download PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "all_events_analytics.pdf";
      a.click();
      URL.revokeObjectURL(url);
    });
    if (ok) showInfo("All events PDF downloaded.");
  };

  return (
    <div className="app-layout">
      <header className="topbar">
        <div>
          <h2>Event Tracker Dashboard</h2>
          <p>
            Signed in as <b>{user?.username}</b> ({user?.role})
          </p>
        </div>
        <button onClick={logout}>Logout</button>
      </header>

      {error && <div className="error">{error}</div>}
      {info && <div className="success">{info}</div>}

      <div className="section">
        <div className="row">
          <label>Sort events:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="time">Time</option>
            <option value="attendance">Attendance</option>
            <option value="alphabetical">Alphabetical</option>
          </select>
        </div>
        <div className="event-grid">
          {events.filter((e) => e.status !== "ended").map((event) => (
            <button
              key={event.id}
              className="event-card"
              onClick={() => navigate(`/events/${event.id}`)}
            >
              <h4>{event.name}</h4>
              <p>{event.location || "No location"}</p>
              <p>Status: {event.status}</p>
              <p>Attendance: {event.attendance_count || 0}</p>
            </button>
          ))}
        </div>
      </div>

      {events.filter((e) => e.status === "ended").length > 0 && (
        <div className="section">
          <h3>Event History (Ended)</h3>
          <div className="event-grid">
            {events.filter((e) => e.status === "ended").map((event) => (
              <button
                key={event.id}
                className="event-card"
                onClick={() => navigate(`/events/${event.id}`)}
              >
                <h4>{event.name}</h4>
                <p>{event.location || "No location"}</p>
                <p>Status: {event.status}</p>
                <p>Attendance: {event.attendance_count || 0}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {live && (
        <div className="section">
          <h3>Live Metrics</h3>
          <div className="live-grid">
            {live.events?.map((item) => (
              <div key={item.event_id} className="live-card">
                <b>{item.event_name}</b>
                <div>Status: {item.status}</div>
                <div>Attendance: {item.attendance_population}</div>
                <div>Accidents: {item.accident_count}</div>
                <div>Avg rating: {item.avg_experience_rating}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="section">
          <h3>Create Event</h3>
          <form onSubmit={createEvent} className="form-grid inline">
            <input
              required
              placeholder="Event name"
              value={eventForm.name}
              onChange={(e) => setEventForm((v) => ({ ...v, name: e.target.value }))}
            />
            <input
              placeholder="Description"
              value={eventForm.description}
              onChange={(e) => setEventForm((v) => ({ ...v, description: e.target.value }))}
            />
            <input
              placeholder="Location"
              value={eventForm.location}
              onChange={(e) => setEventForm((v) => ({ ...v, location: e.target.value }))}
            />
            <button disabled={actionLoading === "create"}>
              {actionLoading === "create" ? "Processing..." : "Create"}
            </button>
          </form>
          <div className="row" style={{ marginTop: 12 }}>
            <button disabled={actionLoading === "pdf"} onClick={downloadAllPDF}>
              {actionLoading === "pdf" ? "Processing..." : "Download All Events PDF"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
