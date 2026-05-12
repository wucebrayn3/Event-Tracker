import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { request } from "../api/client";
import ChartsPanel from "../components/ChartsPanel";
import { useAuth } from "../context/AuthContext";

export default function EventDetailPage() {
  const { token, user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [charts, setCharts] = useState(null);
  const [summary, setSummary] = useState(null);
  const [live, setLive] = useState(null);
  const [isCommittee, setIsCommittee] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [attendanceFile, setAttendanceFile] = useState(null);
  const [committeeCode, setCommitteeCode] = useState("");
  const [reportForm, setReportForm] = useState({ title: "", content: "", report_type: "request" });
  const [accidentForm, setAccidentForm] = useState({ accident_type: "other", description: "" });
  const [ratingForm, setRatingForm] = useState({ rating: 5, comment: "" });
  const [attendanceList, setAttendanceList] = useState([]);
  const [broadcastForm, setBroadcastForm] = useState({ title: "", message: "", target_committee: "" });
  const [broadcasts, setBroadcasts] = useState([]);
  const [committeeReports, setCommitteeReports] = useState([]);
  const [accidentReports, setAccidentReports] = useState([]);
  const [expenditures, setExpenditures] = useState([]);
  const [expenditureForm, setExpenditureForm] = useState({ description: "", quantity: 1, price_per_unit: "" });
  const [users, setUsers] = useState([]);
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const liveIntervalRef = useRef(null);

  const isAdmin = user?.role === "admin";
  const canViewCharts = isAdmin || isCommittee;
  const isStudent = user?.role === "student";

  const showError = useCallback((msg) => {
    setInfo("");
    setError(msg);
  }, []);

  const showInfo = useCallback((msg) => {
    setError("");
    setInfo(msg);
  }, []);

  const runAction = useCallback(async (actionName, fn) => {
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
  }, [showError, showInfo]);

  const loadEvent = useCallback(async () => {
    const data = await request(`/events/${id}/`, { token });
    setEvent(data);
  }, [id, token]);

  const loadCharts = useCallback(async () => {
    const [chartData, summaryData] = await Promise.all([
      request(`/analytics/event/${id}/charts/`, { token }),
      request(`/analytics/event/${id}/summary/`, { token }),
    ]);
    setCharts(chartData);
    setSummary(summaryData);
  }, [id, token]);

  const loadCommitteeStatus = useCallback(async () => {
    const data = await request(`/events/${id}/my-committee-status/`, { token });
    setIsCommittee(data.is_committee);
  }, [id, token]);

  const loadAttendance = useCallback(async () => {
    const data = await request(`/attendance/review/${id}/`, { token }).catch(() => []);
    setAttendanceList(Array.isArray(data) ? data : []);
  }, [id, token]);

  const loadBroadcasts = useCallback(async () => {
    const data = await request("/broadcasts/", { token }).catch(() => []);
    setBroadcasts(
      (Array.isArray(data) ? data : []).filter((item) => Number(item.event) === Number(id))
    );
  }, [id, token]);

  const loadCommitteeReports = useCallback(async () => {
    const data = await request(`/committee-reports/?event_id=${id}`, { token }).catch(() => []);
    setCommitteeReports(Array.isArray(data) ? data : []);
  }, [id, token]);

  const loadExpenditures = useCallback(async () => {
    const data = await request(`/expenditures/?event_id=${id}`, { token }).catch(() => []);
    setExpenditures(Array.isArray(data) ? data : []);
  }, [id, token]);

  const submitExpenditure = async () => {
    if (!event) return;
    const ok = await runAction("expenditure", async () => {
      await request("/expenditures/", {
        method: "POST",
        token,
        body: {
          event: event.id,
          description: expenditureForm.description,
          quantity: Number(expenditureForm.quantity),
          price_per_unit: expenditureForm.price_per_unit,
        }
      });
      setExpenditureForm({ description: "", quantity: 1, price_per_unit: "" });
      await loadExpenditures();
    });
    if (ok) showInfo("Expenditure added.");
  };

  const loadAccidentReports = useCallback(async () => {
    const data = await request(`/accidents/?event_id=${id}`, { token }).catch(() => []);
    setAccidentReports(Array.isArray(data) ? data : []);
  }, [id, token]);

  const respondReport = async (reportId, adminResponse, isResolved) => {
    const ok = await runAction(`respond-${reportId}`, async () => {
      await request(`/committee-reports/${reportId}/respond/`, {
        method: "POST",
        token,
        body: { admin_response: adminResponse, is_resolved: isResolved }
      });
      await loadCommitteeReports();
    });
    if (ok) showInfo("Report response saved.");
  };

  const loadUsers = useCallback(async () => {
    const data = await request(`/users/${userRoleFilter ? `?role=${userRoleFilter}` : ""}`, { token }).catch(() => []);
    setUsers(Array.isArray(data) ? data : []);
  }, [token, userRoleFilter]);

  const loadLive = useCallback(async () => {
    const data = await request(`/analytics/live/?event_id=${id}`, { token });
    setLive(data);
  }, [id, token]);

  useEffect(() => {
    loadEvent().catch((err) => showError(err.message));
    loadCommitteeStatus().catch(() => null);
    loadLive().catch(() => null);
    liveIntervalRef.current = setInterval(() => {
      loadLive().catch(() => null);
    }, 5000);
    return () => clearInterval(liveIntervalRef.current);
  }, [loadEvent, loadCommitteeStatus, loadLive, showError]);

  useEffect(() => {
    if (!canViewCharts) return;
    loadCharts().catch((err) => showError(err.message));
  }, [canViewCharts, loadCharts, showError]);

  useEffect(() => {
    if (!isAdmin && !isCommittee) return;
    loadAttendance().catch(() => null);
  }, [isAdmin, isCommittee, loadAttendance]);

  useEffect(() => {
    if (!isAdmin) return;
    loadBroadcasts().catch(() => null);
    loadCommitteeReports().catch(() => null);
    loadAccidentReports().catch(() => null);
    loadExpenditures().catch(() => null);
  }, [isAdmin, loadBroadcasts, loadCommitteeReports, loadAccidentReports, loadExpenditures]);

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers().catch(() => null);
  }, [isAdmin, loadUsers]);

  const eventAction = async (action, body = {}) => {
    if (!event) return;
    const actionLabels = {
      prepare: "Initiated preparation",
      start: "Event started",
      end: "Event ended",
      "attendance-toggle": body.attendance_open === false ? "Attendance stopped" : "Attendance resumed",
    };
    const ok = await runAction(action, async () => {
      await request(`/events/${event.id}/${action}/`, { method: "POST", token, body });
      await loadEvent();
      if (canViewCharts) await loadCharts();
    });
    if (ok) showInfo(actionLabels[action] || "Action completed.");
  };

  const pickEvent = async () => {
    const ok = await runAction("pick", async () => {
      await request(`/events/${event.id}/pick/`, { method: "POST", token });
    });
    if (ok) showInfo("Event picked successfully.");
  };

  const submitAttendance = async () => {
    if (!event || !attendanceFile) return;
    const ok = await runAction("attendance", async () => {
      const form = new FormData();
      form.append("event", event.id);
      form.append("image_proof", attendanceFile);
      await request("/attendance/", { method: "POST", token, body: form, isForm: true });
    });
    if (ok) { showInfo("Attendance submitted."); setAttendanceFile(null); }
  };

  const joinCommittee = async () => {
    if (!event || !committeeCode) return;
    const ok = await runAction("join", async () => {
      await request(`/events/${event.id}/join-committee/`, {
        method: "POST",
        token,
        body: { code: committeeCode }
      });
      setCommitteeCode("");
      await loadCommitteeStatus();
    });
    if (ok) showInfo("Joined committee successfully.");
  };

  const submitCommitteeReport = async () => {
    if (!event) return;
    const ok = await runAction("report", async () => {
      await request("/committee-reports/create/", {
        method: "POST",
        token,
        body: { ...reportForm, event: event.id }
      });
      setReportForm({ title: "", content: "", report_type: "request" });
    });
    if (ok) showInfo("Committee report submitted.");
  };

  const submitAccident = async () => {
    if (!event) return;
    const ok = await runAction("accident", async () => {
      await request("/accidents/", {
        method: "POST",
        token,
        body: { ...accidentForm, event: event.id }
      });
      setAccidentForm({ accident_type: "other", description: "" });
    });
    if (ok) showInfo("Accident report sent.");
  };

  const submitRating = async () => {
    if (!event) return;
    const ok = await runAction("rating", async () => {
      await request("/ratings/", {
        method: "POST",
        token,
        body: { ...ratingForm, event: event.id, rating: Number(ratingForm.rating) }
      });
    });
    if (ok) showInfo("Rating submitted.");
  };

  const reviewAttendance = async (attendanceId, status) => {
    const ok = await runAction(`review-${attendanceId}`, async () => {
      await request(`/attendance/${attendanceId}/review/`, {
        method: "POST",
        token,
        body: { status }
      });
      await loadAttendance();
    });
    if (ok) showInfo(`Attendance ${status}.`);
  };

  const downloadPDF = async () => {
    if (!event) return;
    setActionLoading("pdf");
    showError("");
    showInfo("");
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/analytics/event/${event.id}/pdf/`, {
        headers: { Authorization: `Token ${token}` }
      });
      if (!res.ok) throw new Error("Failed to download PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `event_${event.id}_analytics.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showInfo("PDF downloaded.");
    } catch (err) {
      showError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const sendBroadcast = async () => {
    if (!event) return;
    const ok = await runAction("broadcast", async () => {
      await request("/broadcasts/", {
        method: "POST",
        token,
        body: {
          ...broadcastForm,
          event: event.id,
          target_committee: broadcastForm.target_committee || null
        }
      });
      setBroadcastForm({ title: "", message: "", target_committee: "" });
      await loadBroadcasts();
    });
    if (ok) showInfo("Broadcast sent.");
  };

  const btn = (actionName, label) => (
    <button disabled={actionLoading === actionName} onClick={label.onClick}>
      {actionLoading === actionName ? "Processing..." : label.text}
    </button>
  );

  if (!event) {
    return (
      <div className="app-layout">
        <p>Loading event...</p>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <header className="topbar">
        <div>
          <h2>Event: {event.name}</h2>
          <p>
            Signed in as <b>{user?.username}</b> ({user?.role})
          </p>
        </div>
        <button onClick={() => navigate("/")}>Back to Dashboard</button>
      </header>

      {error && <div className="error">{error}</div>}
      {info && <div className="success">{info}</div>}

      <div className="section">
        <div className="live-grid">
          <div className="live-card"><b>Status:</b> {event.status}</div>
          <div className="live-card"><b>Location:</b> {event.location || "N/A"}</div>
          <div className="live-card"><b>Attendance Open:</b> {event.attendance_open ? "Yes" : "No"}</div>
        </div>
        {event.description && <p>{event.description}</p>}
      </div>

      {canViewCharts && summary && (
        <div className="section">
          <h3>Summary Metrics</h3>
          <div className="live-grid">
            <div className="live-card">Population: {summary.attendance_population}</div>
            <div className="live-card">Approved: {summary.approved_attendance_population}</div>
            <div className="live-card">Committees: {summary.committee_population}</div>
            <div className="live-card">Accidents: {summary.accident_count}</div>
            <div className="live-card">Duration(hr): {summary.event?.duration_hours}</div>
            <div className="live-card">Expenditure: {summary.event_expenditure_total}</div>
          </div>
        </div>
      )}

      {canViewCharts && <ChartsPanel charts={charts} title="Event Data Visualization" />}

      {isAdmin && live && (
        <div className="section">
          <h3>Live Metrics</h3>
          {live.events?.map((item) => (
            <div key={item.event_id} className="live-card">
              <div>Status: {item.status}</div>
              <div>Attendance: {item.attendance_population}</div>
              <div>Accidents: {item.accident_count}</div>
              <div>Avg rating: {item.avg_experience_rating}</div>
            </div>
          ))}
        </div>
      )}

      <div className="section">
        <h3>Actions</h3>

        {!isAdmin && isStudent && (
          <div className="row" style={{ marginTop: 8 }}>
            <button disabled={actionLoading === "pick"} onClick={pickEvent}>
              {actionLoading === "pick" ? "Processing..." : "Pick This Event"}
            </button>
          </div>
        )}

        {!isAdmin && (
          <div className="row" style={{ marginTop: 8 }}>
            <input
              placeholder="Committee code"
              value={committeeCode}
              onChange={(e) => setCommitteeCode(e.target.value)}
            />
            <button disabled={actionLoading === "join"} onClick={joinCommittee}>
              {actionLoading === "join" ? "Processing..." : "Join Committee"}
            </button>
          </div>
        )}

        {!isAdmin && (
          <div className="row" style={{ marginTop: 8 }}>
            <input type="file" accept="image/*" onChange={(e) => setAttendanceFile(e.target.files?.[0] || null)} />
            <button disabled={actionLoading === "attendance" || !attendanceFile} onClick={submitAttendance}>
              {actionLoading === "attendance" ? "Processing..." : "Submit Attendance Image"}
            </button>
          </div>
        )}

        <div className="form-grid inline" style={{ marginTop: 8 }}>
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
          <button disabled={actionLoading === "accident"} onClick={submitAccident}>
            {actionLoading === "accident" ? "Processing..." : "Send Accident Report"}
          </button>
        </div>

        {!isAdmin && (
          <div className="form-grid inline" style={{ marginTop: 8 }}>
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
            <button disabled={actionLoading === "rating"} onClick={submitRating}>
              {actionLoading === "rating" ? "Processing..." : "Submit Rating"}
            </button>
          </div>
        )}

        {isCommittee && (
          <div className="form-grid" style={{ marginTop: 8 }}>
            <input
              placeholder="Committee report title"
              value={reportForm.title}
              onChange={(e) => setReportForm((v) => ({ ...v, title: e.target.value }))}
            />
            <textarea
              rows="2"
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
            <button disabled={actionLoading === "report"} onClick={submitCommitteeReport}>
              {actionLoading === "report" ? "Processing..." : "Send Committee Report"}
            </button>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="section">
          <h3>Admin Controls</h3>
          <div className="row">
            <button disabled={actionLoading === "prepare"} onClick={() => eventAction("prepare", {})}>
              {actionLoading === "prepare" ? "Processing..." : "Initiate Preparation"}
            </button>
            <button disabled={actionLoading === "start"} onClick={() => eventAction("start", {})}>
              {actionLoading === "start" ? "Processing..." : "Start Event"}
            </button>
            <button disabled={actionLoading === "end"} onClick={() => eventAction("end", {})}>
              {actionLoading === "end" ? "Processing..." : "End Event"}
            </button>
            <button disabled={actionLoading === "attendance-toggle-stop"} onClick={() => eventAction("attendance-toggle", { attendance_open: false })}>
              {actionLoading === "attendance-toggle-stop" ? "Processing..." : "Stop Attendance"}
            </button>
            <button disabled={actionLoading === "attendance-toggle-resume"} onClick={() => eventAction("attendance-toggle", { attendance_open: true })}>
              {actionLoading === "attendance-toggle-resume" ? "Processing..." : "Resume Attendance"}
            </button>
            <button disabled={actionLoading === "pdf"} onClick={downloadPDF}>
              {actionLoading === "pdf" ? "Processing..." : "Download Analytics (PDF)"}
            </button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              placeholder="Committee join code"
              value={committeeCode}
              onChange={(e) => setCommitteeCode(e.target.value)}
            />
            <button disabled={actionLoading === "generate"} onClick={() => eventAction("prepare", { code: committeeCode || undefined })}>
              {actionLoading === "generate" ? "Processing..." : "Generate/Set Code"}
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
                  <a href={row.image_proof} target="_blank" rel="noreferrer">Open Image</a>
                  <button disabled={actionLoading === `review-${row.id}`} onClick={() => reviewAttendance(row.id, "approved")}>
                    {actionLoading === `review-${row.id}` ? "..." : "Approve"}
                  </button>
                  <button disabled={actionLoading === `review-${row.id}`} onClick={() => reviewAttendance(row.id, "rejected")}>
                    {actionLoading === `review-${row.id}` ? "..." : "Reject"}
                  </button>
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
            <button disabled={actionLoading === "broadcast"} onClick={sendBroadcast}>
              {actionLoading === "broadcast" ? "Processing..." : "Send"}
            </button>
          </div>
          <div className="table-list">
            {broadcasts.map((b) => (
              <div className="table-item" key={b.id}>
                <b>{b.title}</b> - {b.message}
              </div>
            ))}
          </div>

          <h4>Accident Reports</h4>
          <div className="table-list">
            {accidentReports.length === 0 && <p className="muted">No accidents reported for this event.</p>}
            {accidentReports.map((a) => (
              <div key={a.id} className="table-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b>{a.accident_type}</b> <span>by {a.reporter?.username}</span>
                </div>
                <p style={{ margin: "4px 0" }}>{a.description}</p>
                <p style={{ margin: "4px 0", color: "var(--muted)", fontSize: "0.85em" }}>{a.accident_time}</p>
              </div>
            ))}
          </div>

          <h4>Expenditures {event.status === "preparation" ? "(Preparation Period)" : ""}</h4>
          {event.status === "preparation" && (
            <div className="form-grid inline" style={{ marginBottom: 8 }}>
              <input
                placeholder="Item name"
                value={expenditureForm.description}
                onChange={(e) => setExpenditureForm((v) => ({ ...v, description: e.target.value }))}
              />
              <input
                type="number" min="1" placeholder="Qty"
                value={expenditureForm.quantity}
                onChange={(e) => setExpenditureForm((v) => ({ ...v, quantity: e.target.value }))}
                style={{ width: 80 }}
              />
              <input
                type="number" step="0.01" min="0" placeholder="Price/unit"
                value={expenditureForm.price_per_unit}
                onChange={(e) => setExpenditureForm((v) => ({ ...v, price_per_unit: e.target.value }))}
                style={{ width: 120 }}
              />
              <span style={{ fontWeight: "bold" }}>
                Total: ${((Number(expenditureForm.quantity) || 0) * (Number(expenditureForm.price_per_unit) || 0)).toFixed(2)}
              </span>
              <button disabled={actionLoading === "expenditure" || !expenditureForm.description || !expenditureForm.price_per_unit} onClick={submitExpenditure}>
                {actionLoading === "expenditure" ? "Processing..." : "Add Expenditure"}
              </button>
            </div>
          )}
          <div className="table-list">
            {expenditures.length === 0 && <p className="muted">No expenditures recorded.</p>}
            {expenditures.map((e) => (
              <div key={e.id} className="table-item">
                <span><b>{e.description}</b> &times;{e.quantity} @ ${e.price_per_unit} = <b>${e.amount}</b></span>
                <span style={{ color: "var(--muted)", fontSize: "0.85em" }}>{e.spent_on}</span>
              </div>
            ))}
          </div>

          <h4>Committee Reports for This Event</h4>
          <div className="table-list">
            {committeeReports.length === 0 && <p className="muted">No reports for this event.</p>}
            {committeeReports.map((r) => (
              <div key={r.id} className="table-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b>{r.title}</b> <span>({r.report_type}) by {r.committee?.username}</span>
                </div>
                <p style={{ margin: "4px 0" }}>{r.content}</p>
                {r.admin_response && <p style={{ margin: "4px 0", color: "var(--muted)" }}>Response: {r.admin_response}</p>}
                {!r.admin_response && (
                  <div className="row">
                    <input
                      placeholder="Write response..."
                      id={`report-resp-${r.id}`}
                      style={{ flex: 1 }}
                    />
                    <button disabled={actionLoading === `respond-${r.id}`} onClick={() => {
                      const el = document.getElementById(`report-resp-${r.id}`);
                      respondReport(r.id, el.value, true);
                      el.value = "";
                    }}>
                      {actionLoading === `respond-${r.id}` ? "..." : "Respond & Resolve"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <h4>All Users</h4>
          <div className="row" style={{ marginBottom: 8 }}>
            <label>Filter by role:</label>
            <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)} style={{ width: "auto" }}>
              <option value="">All</option>
              <option value="student">Student</option>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="table-list">
            {users.map((u) => (
              <div key={u.id} className="table-item">
                <span><b>{u.username}</b> ({u.role}){u.email ? ` - ${u.email}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
