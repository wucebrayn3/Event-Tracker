import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip
} from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement
);

function toDataset(label, labels, values, color) {
  return {
    labels,
    datasets: [
      {
        label,
        data: values,
        backgroundColor: color,
        borderColor: color,
        borderWidth: 2,
        fill: false
      }
    ]
  };
}

export default function ChartsPanel({ charts, title = "Analytics" }) {
  if (!charts) return null;
  return (
    <div className="section">
      <h3>{title}</h3>
      <div className="chart-grid">
        <div className="chart-card">
          <Bar
            data={toDataset("Population", charts.bar?.labels || [], charts.bar?.values || [], "rgba(12,110,253,0.7)")}
          />
        </div>
        <div className="chart-card">
          <Pie
            data={toDataset(
              "Distribution",
              charts.pie?.labels || [],
              charts.pie?.values || [],
              ["#0077b6", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"]
            )}
          />
        </div>
        <div className="chart-card">
          <Line
            data={toDataset(
              "Trend",
              charts.line?.accidents?.labels || charts.line?.labels || [],
              charts.line?.accidents?.values || charts.line?.values || [],
              "rgba(220,53,69,0.8)"
            )}
          />
        </div>
      </div>
    </div>
  );
}
