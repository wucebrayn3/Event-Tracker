import { useEffect, useMemo, useState } from "react";
import { request } from "../api/client";
import ChartsPanel from "../components/ChartsPanel";
import { useAuth } from "../context/AuthContext";

const initialEventForm = {
  name: "",
  description: "",
  location: ""
};

export default function Dashboard() {
  const { token, user, logout } = useAuth();
  const [events, setEvents] = useState([]);
  const [live, setLive] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [sortBy, setSortBy] = useState("time");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [eventForm, setEventForm] = useState(initialEventForm);
  const [charts, setCharts] = useState(null);
  const [summary, setSummary] = useState(null);
  const [attendanceFile, setAttendanceFile] = useState(null);
  const [committeeCode, setCommitteeCode] = useState("");
  const [reportForm, setReportForm] = useState({ title: "", content: "", report_type: "request" });
  const [accidentForm, setAccidentForm] = useState({ accident_type: "other", description: "" });
  const [ratingForm, setRatingForm] = useState({ rating: 5, comment: "" });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadedCharts, setUploadedCharts] = useState(null);
  const [attendanceList, setAttendanceList] = useState([]);
  const [broadcastForm, setBroadcastForm] = useState({ title: "", message: "", target_committee: "" });
  const [broadcasts, setBroadcasts] = useState([]);

  const isAdmin = user?.role === "admin";
  const selectedEvent = useMemo(() => events.find((item) => item.id === selectedId), [events, selectedId]);

  const loadEvents = async () => {
    const data = await request(`/events/?sort_by=${sortBy}`, { token });
    setEvents(data);
    if (!selectedId && data.length) {
      setSelectedId(data[0].id);
    }
  };

  const loadLive = async () => {
    const data = await request("/analytics/live/", { token });
    setLive(data);
  };

  const loadEventData = async (eventId) => {
    if (!eventId) return;
    const [chartData, summaryData, attendanceData, broadcastData] = await Promise.all([
      request(`/analytics/event/${eventId}/charts/`, { token }),
      request(`/analytics/event/${eventId}/summary/`, { token }),
      request(`/attendance/review/${eventId}/`, { token }).catch(() => []),
      request("/broadcasts/", { token }).catch(() => [])
    ]);
    setCharts(chartData);
    setSummary(summaryData);
    setAttendanceList(Array.isArray(attendanceData) ? attendanceData : []);
    setBroadcasts(
      (Array.isArray(broadcastData) ? broadcastData : []).filter((item) => Number(item.event) === Number(eventId))
    );
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

  useEffect(() => {
    if (!selectedId) return;
    loadEventData(selectedId).catch((err) => setError(err.message));
  }, [selectedId]);

  const withNotice = async (fn) => {
    setError("");
    setInfo("");
    try {
      await fn();
      setInfo("Action completed.");
    } catch (err) {
      setError(err.message);
    }
  };

  const createEvent = async (e) => {
    e.preventDefault();
    await withNotice(async () => {
      await request("/events/", { method: "POST", token, body: eventForm });
      setEventForm(initialEventForm);
      await loadEvents();
    });
  };

  const eventAction = async (action, body = {}) => {
    if (!selectedEvent) return;
    await withNotice(async () => {
      await request(`/events/${selectedEvent.id}/${action}/`, { method: "POST", token, body });
      await loadEvents();
      await loadEventData(selectedEvent.id);
    });
  };

  const submitAttendance = async () => {
    if (!selectedEvent || !attendanceFile) return;
    await withNotice(async () => {
      const form = new FormData();
      form.append("event", selectedEvent.id);
      form.append("image_proof", attendanceFile);
      await request("/attendance/", { method: "POST", token, body: form, isForm: true });
    });
  };

  const joinCommittee = async () => {
    if (!selectedEvent || !committeeCode) return;
    await withNotice(async () => {
      await request(`/events/${selectedEvent.id}/join-committee/`, {
        method: "POST",
        token,
        body: { code: committeeCode }
      });
      setCommitteeCode("");
    });
  };

  const submitCommitteeReport = async () => {
    if (!selectedEvent) return;
    await withNotice(async () => {
      await request("/committee-reports/create/", {
        method: "POST",
        token,
        body: { ...reportForm, event: selectedEvent.id }
      });
      setReportForm({ title: "", content: "", report_type: "request" });
    });
  };

  const submitAccident = async () => {
    if (!selectedEvent) return;
    await withNotice(async () => {
      await request("/accidents/", {
        method: "POST",
        token,
        body: { ...accidentForm, event: selectedEvent.id }
      });
      setAccidentForm({ accident_type: "other", description: "" });
      await loadEventData(selectedEvent.id);
    });
  };

  const submitRating = async () => {
    if (!selectedEvent) return;
    await withNotice(async () => {
      await request("/ratings/", {
        method: "POST",
        token,
        body: { ...ratingForm, event: selectedEvent.id, rating: Number(ratingForm.rating) }
      });
      await loadEventData(selectedEvent.id);
    });
  };

  const reviewAttendance = async (attendanceId, status) => {
    await withNotice(async () => {
      await request(`/attendance/${attendanceId}/review/`, {
        method: "POST",
        token,
        body: { status }
      });
      await loadEventData(selectedEvent.id);
    });
  };

  const uploadJson = async () => {
    if (!uploadFile) return;
    await withNotice(async () => {
      const form = new FormData();
      form.append("file", uploadFile);
      const result = await request("/analytics/upload-json/", { method: "POST", token, body: form, isForm: true });
      setUploadedCharts(result);
    });
  };

  const sendBroadcast = async () => {
    if (!selectedEvent) return;
    await withNotice(async () => {
      await request("/broadcasts/", {
        method: "POST",
        token,
        body: {
          ...broadcastForm,
          event: selectedEvent.id,
          target_committee: broadcastForm.target_committee || null
        }
      });
      setBroadcastForm({ title: "", message: "", target_committee: "" });
      await loadEventData(selectedEvent.id);
    });
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
          {events.map((event) => (
            <button
              key={event.id}
              className={`event-card ${event.id === selectedId ? "selected" : ""}`}
              onClick={() => setSelectedId(event.id)}
            >
              <h4>{event.name}</h4>
              <p>{event.location || "No location"}</p>
              <p>Status: {event.status}</p>
              <p>Attendance: {event.attendance_count || 0}</p>
            </button>
          ))}
        </div>
      </div>

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
            <button>Create</button>
          </form>
        </div>
      )}

      {selectedEvent && (
        <div className="section">
          <h3>Selected Event: {selectedEvent.name}</h3>
          {summary && (
            <div className="live-grid">
              <div className="live-card">Population: {summary.attendance_population}</div>
              <div className="live-card">Approved: {summary.approved_attendance_population}</div>
              <div className="live-card">Committees: {summary.committee_population}</div>
              <div className="live-card">Accidents: {summary.accident_count}</div>
              <div className="live-card">Duration(hr): {summary.event?.duration_hours}</div>
              <div className="live-card">Expenditure: {summary.event_expenditure_total}</div>
            </div>
          )}

          <ChartsPanel charts={charts} title="Event Data Visualization" />

          <div className="section">
            <h3>JSON Upload Analytics</h3>
            <div className="row">
              <input type="file" accept=".json" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
              <button onClick={uploadJson}>Analyze JSON</button>
            </div>
            {uploadedCharts && <ChartsPanel charts={uploadedCharts} title="Uploaded JSON Visualization" />}
          </div>

          {isAdmin && (
            <div className="section">
              <h3>Admin Controls</h3>
              <div className="row">
                <button onClick={() => eventAction("prepare", {})}>Initiate Preparation</button>
                <button onClick={() => eventAction("start", {})}>Start Event</button>
                <button onClick={() => eventAction("end", {})}>End Event</button>
                <button onClick={() => eventAction("attendance-toggle", { attendance_open: false })}>
                  Stop Attendance
                </button>
                <button onClick={() => eventAction("attendance-toggle", { attendance_open: true })}>
                  Resume Attendance
                </button>
              </div>
              <div className="row">
                <input
                  placeholder="Committee join code"
                  value={committeeCode}
                  onChange={(e) => setCommitteeCode(e.target.value)}
                />
                <button onClick={() => eventAction("prepare", { code: committeeCode || undefined })}>
                  Generate/Set Code
                </button>
              </div>
              <h4>Attendance Reviews</h4>
              <div className="table-list">
                {attendanceList.map((row) => (
                  <div key={row.id} className="table-item">
                    <span>
                      {row.student?.username} - {row.status}
                    </span>
                    <div className="row">
                      <a href={row.image_proof} target="_blank" rel="noreferrer">
                        Open Image
                      </a>
                      <button onClick={() => reviewAttendance(row.id, "approved")}>Approve</button>
                      <button onClick={() => reviewAttendance(row.id, "rejected")}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
              <h4>Broadcast to Committees</h4>
              <div className="form-grid inline">
                <input
                  placeholder="Title"
                  value={broadcastForm.title}
                  onChange={(e) => setBroadcastForm((v) => ({ ...v, title: e.target.value }))}
                />
                <input
                  placeholder="Message"
                  value={broadcastForm.message}
                  onChange={(e) => setBroadcastForm((v) => ({ ...v, message: e.target.value }))}
                />
                <input
                  placeholder="Target committee user id (optional)"
                  value={broadcastForm.target_committee}
                  onChange={(e) => setBroadcastForm((v) => ({ ...v, target_committee: e.target.value }))}
                />
                <button onClick={sendBroadcast}>Send</button>
              </div>
              <div className="table-list">
                {broadcasts.map((b) => (
                  <div className="table-item" key={b.id}>
                    <b>{b.title}</b> - {b.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isAdmin && (
            <div className="section">
              <h3>Student and Committee Actions</h3>
              <div className="row">
                <button onClick={() => withNotice(() => request(`/events/${selectedEvent.id}/pick/`, { method: "POST", token }))}>
                  Pick This Event
                </button>
              </div>
              <div className="row">
                <input
                  placeholder="Committee code"
                  value={committeeCode}
                  onChange={(e) => setCommitteeCode(e.target.value)}
                />
                <button onClick={joinCommittee}>Join Committee</button>
              </div>
              <div className="row">
                <input type="file" accept="image/*" onChange={(e) => setAttendanceFile(e.target.files?.[0] || null)} />
                <button onClick={submitAttendance}>Submit Attendance Image</button>
              </div>
              <div className="form-grid inline">
                <select
                  value={accidentForm.accident_type}
                  onChange={(e) => setAccidentForm((v) => ({ ...v, accident_type: e.target.value }))}
                >
                  <option value="injury">Injury</option>
                  <option value="medical">Medical</option>
                  <option value="property">Property</option>
                  <option value="security">Security</option>
                  <option value="other">Other</option>
                </select>
                <input
                  placeholder="Accident details"
                  value={accidentForm.description}
                  onChange={(e) => setAccidentForm((v) => ({ ...v, description: e.target.value }))}
                />
                <button onClick={submitAccident}>Send Accident Report</button>
              </div>
              <div className="form-grid inline">
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={ratingForm.rating}
                  onChange={(e) => setRatingForm((v) => ({ ...v, rating: e.target.value }))}
                />
                <input
                  placeholder="Experience comment"
                  value={ratingForm.comment}
                  onChange={(e) => setRatingForm((v) => ({ ...v, comment: e.target.value }))}
                />
                <button onClick={submitRating}>Submit Rating</button>
              </div>
              <div className="form-grid">
                <input
                  placeholder="Committee report title"
                  value={reportForm.title}
                  onChange={(e) => setReportForm((v) => ({ ...v, title: e.target.value }))}
                />
                <textarea
                  rows="3"
                  placeholder="Committee report content"
                  value={reportForm.content}
                  onChange={(e) => setReportForm((v) => ({ ...v, content: e.target.value }))}
                />
                <select
                  value={reportForm.report_type}
                  onChange={(e) => setReportForm((v) => ({ ...v, report_type: e.target.value }))}
                >
                  <option value="request">Request</option>
                  <option value="update">Update</option>
                  <option value="issue">Issue</option>
                </select>
                <button onClick={submitCommitteeReport}>Send Committee Report</button>
              </div>
              <h4>Admin Broadcasts</h4>
              <div className="table-list">
                {broadcasts.map((b) => (
                  <div key={b.id} className="table-item">
                    <b>{b.title}</b> - {b.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
