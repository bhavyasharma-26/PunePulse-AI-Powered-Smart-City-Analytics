"use strict";

const API_BASE = "http://127.0.0.1:8000";

function aqiCategory(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return { label: "N/A", cls: "aqi-na" };
  if (v <= 50) return { label: "Good", cls: "aqi-good" };
  if (v <= 100) return { label: "Satisfactory", cls: "aqi-satisfactory" };
  if (v <= 200) return { label: "Moderate", cls: "aqi-moderate" };
  if (v <= 300) return { label: "Poor", cls: "aqi-poor" };
  if (v <= 400) return { label: "Very Poor", cls: "aqi-verypoor" };
  return { label: "Severe", cls: "aqi-severe" };
}

function aqiBadge(value, decimals = 1) {
  const c = aqiCategory(value);
  return `<span class="aqi-badge ${c.cls}">${number(value, decimals)} · ${c.label}</span>`;
}

const state = {
  overview: {},
  traffic: [],
  aqi: { stations: [] },
  aqiHistory: [],
  aqiRange: { start: "", end: "" },
  waste: {},
  ai: {},
  charts: {}
};

const $ = (id) => document.getElementById(id);

const PAGE_INFO = {
  overview: {
    title: "City Overview",
    subtitle: "A unified view of Pune's urban environment and infrastructure."
  },
  traffic: {
    title: "Traffic Analytics",
    subtitle: "Explore vehicle-count patterns across monitored junctions."
  },
  aqi: {
    title: "Air Quality",
    subtitle: "Compare historical AQI, predicted AQI and station readings."
  },
  waste: {
    title: "Waste Management",
    subtitle: "Review waste collection, equipment and segregation indicators."
  },
  ai: {
    title: "AI City Advisor",
    subtitle: "Machine-learning insights and evidence-based recommendations."
  }
};

function number(value, decimals = 0) {
  if (value === null || value === undefined || value === "") return "—";

  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  return n.toLocaleString("en-IN", {
    maximumFractionDigits: decimals
  });
}

function compact(value) {
  if (value === null || value === undefined || value === "") return "—";

  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(n);
}

function safeText(value) {
  return String(value ?? "—").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value ?? "—";
}

function historyPath() {
  const { start, end } = state.aqiRange;
  const params = new URLSearchParams({ limit: start || end ? "100000" : "2000" });

  if (start) params.set("start", start);
  if (end) params.set("end", end);

  return `/api/aqi/history?${params.toString()}`;
}

async function getJSON(path) {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }

  return response.json();
}

function findRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  for (const key of [
    "data", "records", "rows", "items",
    "history", "results", "observations"
  ]) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  return [];
}

function findNumber(row, keys) {
  if (!row || typeof row !== "object") return undefined;

  for (const key of keys) {
    const value = row[key];

    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }

  return undefined;
}

function getTimestamp(row) {
  const raw =
    row?.timestamp ??
    row?.datetime ??
    row?.recorded_at ??
    row?.date ??
    row?.day;

  if (!raw) return null;

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function getStationId(row) {
  return String(
    row?.station_id ??
    row?.station ??
    row?.station_name ??
    row?.monitoring_station ??
    row?.site_name ??
    ""
  );
}

function getReading(row) {
  return findNumber(row, [
    "reading",
    "latest_reading",
    "average_reading",
    "aqi",
    "AQI",
    "avg_aqi",
    "value"
  ]);
}

function getForecastRows() {
  const forecast = state.ai?.aqi_forecast;

  if (!forecast?.available || !Array.isArray(forecast.forecast)) {
    return [];
  }

  return forecast.forecast
    .map(item => ({
      date: String(item.date || "").slice(0, 10),
      value: findNumber(item, ["predicted_reading", "predicted_aqi"])
    }))
    .filter(item => item.date && item.value !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);

  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: "index"
    },
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          color: "#68766f",
          usePointStyle: true,
          pointStyle: "circle",
          boxWidth: 7,
          padding: 17,
          font: {
            family: "DM Sans",
            size: 10
          }
        }
      },
      tooltip: {
        backgroundColor: "#172a25",
        titleColor: "#ffffff",
        bodyColor: "#e5eee7",
        padding: 11
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: "#758078",
          maxTicksLimit: 9,
          maxRotation: 0,
          font: { family: "DM Sans", size: 10 }
        }
      },
      y: {
        beginAtZero: false,
        border: { display: false },
        grid: { color: "#e8eee8" },
        ticks: {
          color: "#758078",
          font: { family: "DM Sans", size: 10 }
        },
        title: {
          display: true,
          text: "AQI / reading",
          color: "#758078",
          font: { family: "DM Sans", size: 10 }
        }
      }
    }
  };
}

function makeChart(id, config) {
  const canvas = $(id);
  if (!canvas || typeof Chart === "undefined") return;

  const existing = state.charts[id];

  if (existing) {
    existing.destroy();
    delete state.charts[id];
  }

  const wrapper = canvas.parentElement;
  wrapper?.querySelector(".chart-empty-message")?.remove();
  canvas.style.display = "block";

  state.charts[id] = new Chart(canvas, config);
}

function showChartMessage(id, message) {
  const canvas = $(id);
  if (!canvas) return;

  if (state.charts[id]) {
    state.charts[id].destroy();
    delete state.charts[id];
  }

  canvas.style.display = "none";

  const wrapper = canvas.parentElement;
  let notice = wrapper.querySelector(".chart-empty-message");

  if (!notice) {
    notice = document.createElement("div");
    notice.className = "empty-state chart-empty-message";
    notice.style.minHeight = "150px";
    notice.style.display = "grid";
    notice.style.placeItems = "center";
    notice.style.textAlign = "center";
    notice.style.padding = "24px";
    wrapper.appendChild(notice);
  }

  notice.textContent = message;
}

function makeDoughnut(id, labels, values, colors) {
  makeChart(id, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: "#ffffff",
        borderWidth: 4,
        hoverOffset: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#68766f",
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 7,
            padding: 16,
            font: { family: "DM Sans", size: 10 }
          }
        },
        tooltip: chartDefaults().plugins.tooltip
      }
    }
  });
}

function showPage(page) {
  const selected = PAGE_INFO[page] ? page : "overview";

  document.querySelectorAll(".page-section").forEach(section => {
    section.classList.toggle(
      "hidden",
      section.id !== `page-${selected}`
    );
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.page === selected);
  });

  const info = PAGE_INFO[selected];

  $("pageTitle").innerHTML =
    `${safeText(info.title)}<span class="title-dot">.</span>`;

  setText("pageSubtitle", info.subtitle);
  setText("breadcrumbPage", info.title);

  $("sidebar").classList.remove("open");

  setTimeout(() => {
    Object.values(state.charts).forEach(chart => {
      if (chart) chart.resize();
    });
  }, 80);
}

function renderOverview() {
  const overview = state.overview;
  const traffic = state.traffic;
  const stations = state.aqi.stations || [];
  const waste = state.waste;

  setText("totalVehicles", compact(overview.traffic_vehicle_counts));
  setText("junctionCount", `${number(overview.traffic_junctions)} junctions`);
  setText("aqiReadings", compact(overview.aqi_readings));
  setText("stationCount", `${number(overview.aqi_station_files)} station files`);

  const wasteCount =
    (Number(overview.waste_equipment_records) || 0) +
    (Number(overview.waste_segregation_records) || 0) +
    (Number(overview.waste_vehicle_records) || 0);

  setText("wasteRecords", number(wasteCount));
  setText("junctionKpi", number(overview.traffic_junctions));

  makeChart("trafficOverviewChart", {
    type: "bar",
    data: {
      labels: traffic.map(row => row.junction),
      datasets: [
        {
          label: "Cars",
          data: traffic.map(row => Number(row.car) || 0),
          backgroundColor: "#78966d",
          borderRadius: 4
        },
        {
          label: "Motorbikes",
          data: traffic.map(row => Number(row.motorbike) || 0),
          backgroundColor: "#5eaa8b",
          borderRadius: 4
        }
      ]
    },
    options: chartDefaults()
  });

  const vehicleKeys = ["car", "motorbike", "bus", "truck"];

  const vehicleTotals = vehicleKeys.map(key =>
    traffic.reduce((sum, row) => sum + (Number(row[key]) || 0), 0)
  );

  makeDoughnut(
    "vehicleMixChart",
    ["Cars", "Motorbikes", "Buses", "Trucks"],
    vehicleTotals,
    ["#78966d", "#5eaa8b", "#6e9cb0", "#d58b61"]
  );

  $("aqiSnapshot").innerHTML = stations.length
    ? stations.map(station => `
        <div class="snapshot-row">
          <div>
            <div class="snapshot-name">${safeText(station.station_id)}</div>
            <div class="snapshot-sub">${number(station.readings)} readings</div>
          </div>
          <div class="snapshot-value">${aqiBadge(station.average_reading, 1)}</div>
        </div>
      `).join("")
    : `<div class="empty-state">No AQI station summaries returned.</div>`;

  const wasteItems = [
    ["Equipment records", waste.equipment_records],
    ["Segregation records", waste.segregation_records],
    ["Collection vehicle records", waste.vehicle_records],
    ["Reported street bins", waste.reported_street_bins]
  ].filter(([, value]) => value !== undefined && value !== null);

  $("wasteSnapshot").innerHTML = wasteItems.length
    ? wasteItems.map(([label, value]) => `
        <div class="metric-row">
          <span>${safeText(label)}</span>
          <strong>${number(value)}</strong>
        </div>
      `).join("")
    : `<div class="empty-state">No waste summary available.</div>`;
}

function renderTraffic() {
  const traffic = state.traffic;

  setText("trafficJunctionsDetail", number(traffic.length));

  setText(
    "carCounts",
    compact(traffic.reduce((sum, row) => sum + (Number(row.car) || 0), 0))
  );

  setText(
    "bikeCounts",
    compact(traffic.reduce((sum, row) => sum + (Number(row.motorbike) || 0), 0))
  );

  makeChart("trafficDetailChart", {
    type: "bar",
    data: {
      labels: traffic.map(row => row.junction),
      datasets: [
        { label: "Cars", data: traffic.map(row => Number(row.car) || 0), backgroundColor: "#78966d" },
        { label: "Motorbikes", data: traffic.map(row => Number(row.motorbike) || 0), backgroundColor: "#5eaa8b" },
        { label: "Buses", data: traffic.map(row => Number(row.bus) || 0), backgroundColor: "#6e9cb0" },
        { label: "Trucks", data: traffic.map(row => Number(row.truck) || 0), backgroundColor: "#d58b61" }
      ]
    },
    options: chartDefaults()
  });

  $("trafficTable").innerHTML = traffic.length
    ? traffic.map(row => `
        <tr>
          <td>${safeText(row.junction)}</td>
          <td>${number(row.car)}</td>
          <td>${number(row.motorbike)}</td>
          <td>${number(row.bus)}</td>
          <td>${number(row.truck)}</td>
          <td>${number(row.total_vehicles)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="6">No traffic data returned.</td></tr>`;
}

function renderModelAccuracy() {
  const box = $("modelAccuracy");
  if (!box) return;

  const forecast = state.ai?.aqi_forecast;

  if (!forecast?.available || forecast.validation_mae == null) {
    box.innerHTML = `<div class="empty-state">Model accuracy is not available.</div>`;
    return;
  }

  const mae = forecast.validation_mae;
  const baseline = forecast.baseline_mae;

  let verdict = "";

  if (baseline) {
    const diff = ((baseline - mae) / baseline) * 100;

    verdict = diff >= 0
      ? `The model is ${number(diff, 1)}% more accurate than simply repeating yesterday's reading.`
      : `The model is ${number(Math.abs(diff), 1)}% less accurate than simply repeating yesterday's reading, so it does not yet beat this baseline.`;
  }

  box.innerHTML = `
    <div class="aqi-stat">
      <span>Average error (MAE)</span>
      <strong>±${number(mae, 2)}</strong>
    </div>
    <div class="aqi-stat">
      <span>RMSE</span>
      <strong>${number(forecast.validation_rmse, 2)}</strong>
    </div>
    <div class="aqi-stat">
      <span>Baseline: yesterday's value</span>
      <strong>±${number(baseline, 2)}</strong>
    </div>
    <div class="aqi-stat">
      <span>Days tested</span>
      <strong>${number(forecast.test_days)}</strong>
    </div>
    <div class="accuracy-verdict">
      Tested on the most recent ${number(forecast.test_days)} days, which the model was not trained on. Errors are in AQI points. ${verdict}
    </div>
  `;
}

function renderAQI() {
  const stations = state.aqi.stations || [];
  const history = state.aqiHistory;

  const average = stations.length
    ? stations.reduce(
        (sum, station) => sum + (Number(station.average_reading) || 0),
        0
      ) / stations.length
    : null;

  setText("aqiPointsDetail", number(history.length));
  setText("aqiStationsDetail", number(stations.length));
  setText("aqiAverageDetail", average === null ? "—" : number(average, 2));

  const select = $("stationSelect");
  const oldValue = select.value;

  select.innerHTML =
    `<option value="">All stations</option>` +
    stations.map(station => `
      <option value="${safeText(station.station_id)}">
        ${safeText(station.station_id)}
      </option>
    `).join("");

  if (stations.some(station => station.station_id === oldValue)) {
    select.value = oldValue;
  }

  $("aqiTable").innerHTML = stations.length
    ? stations.map(station => `
        <tr>
          <td>${safeText(station.station_id)}</td>
          <td>${number(station.readings)}</td>
          <td>${aqiBadge(station.average_reading, 2)}</td>
          <td>${aqiBadge(station.latest_reading, 2)}</td>
          <td>${safeText(station.latest_timestamp)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="5">No AQI station summaries returned.</td></tr>`;

  drawHistoricalPredictionChart();
  drawStationComparisonChart();
  renderModelAccuracy();
}

function drawHistoricalPredictionChart() {
  const history = state.aqiHistory;
  const forecast = getForecastRows();

  const daily = new Map();

  history.forEach(row => {
    const time = getTimestamp(row);
    const value = getReading(row);

    if (time === null || value === undefined) return;

    const date = new Date(time).toISOString().slice(0, 10);

    if (!daily.has(date)) daily.set(date, []);
    daily.get(date).push(value);
  });

  const historical = [...daily.entries()]
    .map(([date, values]) => ({
      date,
      value: values.reduce((sum, item) => sum + item, 0) / values.length
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!historical.length) {
    showChartMessage(
      "aqiComparisonChart",
      "Historical readings are unavailable. Check /api/aqi/history."
    );

    setText("aqiComparisonNote", "No valid historical observations were returned.");
    return;
  }

  if (!forecast.length) {
    showChartMessage(
      "aqiComparisonChart",
      "The historical readings are available, but the prediction model has not returned a forecast. Check /api/ai/insights and its aqi_forecast field."
    );

    setText(
      "aqiComparisonNote",
      state.ai?.aqi_forecast?.reason ||
      "A forecast cannot be compared until the backend returns predicted readings."
    );
    return;
  }

  const lastHistoricalDate = historical[historical.length - 1].date;
  const firstForecastDate = forecast[0].date;

  const rangeEnd = state.aqiRange.end;
  const dayBeforeForecast = new Date(
    Date.parse(`${firstForecastDate}T00:00:00Z`) - 86400000
  ).toISOString().slice(0, 10);
  const includeForecast = !rangeEnd || rangeEnd >= dayBeforeForecast;

  const validForecast = includeForecast
    ? forecast.filter(item => item.date > lastHistoricalDate)
    : [];

  if (includeForecast && !validForecast.length) {
    showChartMessage(
      "aqiComparisonChart",
      "The forecast dates overlap the historical data. Check the timestamps returned by the forecast API."
    );
    setText("aqiComparisonNote", "Forecast dates do not follow the historical series.");
    return;
  }

  const labels = [
    ...historical.map(item => item.date),
    ...validForecast.map(item => item.date)
  ];

  const historicalValues = [
    ...historical.map(item => Number(item.value.toFixed(2))),
    ...validForecast.map(() => null)
  ];

  const predictedValues = [
    ...historical.map(() => null)
  ];

  if (validForecast.length) {
    predictedValues[predictedValues.length - 1] =
      Number(historical[historical.length - 1].value.toFixed(2));

    validForecast.forEach(item => {
      predictedValues.push(item.value);
    });
  }

  makeChart("aqiComparisonChart", {
    type: "line",
    data: {
      labels: labels.map(formatDate),
      datasets: [
        {
          label: "Historical AQI",
          data: historicalValues,
          borderColor: "#286b53",
          backgroundColor: "#286b5312",
          borderWidth: 2.5,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: "#286b53",
          tension: 0.22,
          fill: false,
          spanGaps: false
        },
        {
          label: "Predicted AQI",
          data: predictedValues,
          borderColor: "#c8754f",
          backgroundColor: "#c8754f12",
          borderWidth: 2.5,
          borderDash: [7, 5],
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: "#c8754f",
          tension: 0.22,
          fill: false,
          spanGaps: false
        }
      ]
    },
    options: {
      ...chartDefaults(),
      plugins: {
        ...chartDefaults().plugins,
        tooltip: {
          ...chartDefaults().plugins.tooltip,
          callbacks: {
            label(context) {
              if (context.raw === null || context.raw === undefined) {
                return `${context.dataset.label}: no reading`;
              }
              return `${context.dataset.label}: ${number(context.raw, 2)}`;
            }
          }
        }
      },
      scales: {
        ...chartDefaults().scales,
        x: {
          ...chartDefaults().scales.x,
          ticks: {
            ...chartDefaults().scales.x.ticks,
            maxTicksLimit: 10
          }
        }
      }
    }
  });

  setText(
    "aqiComparisonNote",
    `${formatDate(historical[0].date)} to ${formatDate(lastHistoricalDate)}: ${historical.length} historical daily means` +
    (validForecast.length
      ? ` compared with ${validForecast.length} forecast days (${formatDate(validForecast[0].date)} to ${formatDate(validForecast[validForecast.length - 1].date)}) from the ${state.ai?.aqi_forecast?.model || "backend model"}. The forecast continues from the end of the dataset, not from today.`
      : `. The forecast is hidden because the selected range ends before the dataset does.`)
  );
}

function drawStationComparisonChart() {
  const history = state.aqiHistory;
  const selectedStation = $("stationSelect")?.value || "";

  if (!history.length) {
    showChartMessage(
      "stationComparisonChart",
      "No historical station readings are available."
    );

    setText("stationComparisonNote", "Check /api/aqi/history.");
    return;
  }

  const stationDaily = new Map();

  history.forEach(row => {
    const station = getStationId(row);
    const time = getTimestamp(row);
    const value = getReading(row);

    if (!station || time === null || value === undefined) return;
    if (selectedStation && station !== selectedStation) return;

    const date = new Date(time).toISOString().slice(0, 10);
    const key = `${station}__${date}`;

    if (!stationDaily.has(key)) {
      stationDaily.set(key, {
        station,
        date,
        values: []
      });
    }

    stationDaily.get(key).values.push(value);
  });

  const stations = [...new Set(
    [...stationDaily.values()].map(item => item.station)
  )].sort();

  if (!stations.length) {
    showChartMessage(
      "stationComparisonChart",
      "No valid station names, timestamps and readings were found in the history response."
    );

    setText(
      "stationComparisonNote",
      "The API must return station, timestamp and reading for each observation."
    );
    return;
  }

  const dates = [...new Set(
    [...stationDaily.values()].map(item => item.date)
  )].sort().slice(-21);

  const stationMaps = new Map();

  stationDaily.forEach(item => {
    if (!dates.includes(item.date)) return;

    if (!stationMaps.has(item.station)) {
      stationMaps.set(item.station, new Map());
    }

    const mean = item.values.reduce((sum, value) => sum + value, 0)
      / item.values.length;

    stationMaps.get(item.station).set(item.date, Number(mean.toFixed(2)));
  });

  const colors = [
    "#286b53",
    "#c8754f",
    "#477c98",
    "#9278b5",
    "#b39b43",
    "#c15e69",
    "#5eaa8b",
    "#64718c"
  ];

  const datasets = stations.map((station, index) => ({
    label: station,
    data: dates.map(date => stationMaps.get(station)?.get(date) ?? null),
    borderColor: colors[index % colors.length],
    backgroundColor: colors[index % colors.length] + "18",
    borderWidth: 2,
    pointRadius: 2,
    pointHoverRadius: 5,
    tension: 0.22,
    fill: false,
    spanGaps: false
  }));

  makeChart("stationComparisonChart", {
    type: "line",
    data: {
      labels: dates.map(formatDate),
      datasets
    },
    options: {
      ...chartDefaults(),
      plugins: {
        ...chartDefaults().plugins,
        legend: {
          ...chartDefaults().plugins.legend,
          display: true
        }
      },
      scales: {
        ...chartDefaults().scales,
        x: {
          ...chartDefaults().scales.x,
          ticks: {
            ...chartDefaults().scales.x.ticks,
            maxTicksLimit: 10
          }
        }
      }
    }
  });

  setText(
    "stationComparisonNote",
    selectedStation
      ? `Showing daily mean readings for ${selectedStation}. Select "All stations" to compare station datasets.`
      : `Comparing ${stations.length} station dataset(s) across ${dates.length} dates. Missing dates are left blank rather than filled with invented values.`
  );
}

function renderWaste() {
  const waste = state.waste;

  setText("equipmentCount", number(waste.equipment_records));

  setText(
    "wasteTonnes",
    waste.reported_waste_tonnes_per_day == null
      ? "—"
      : number(waste.reported_waste_tonnes_per_day, 2)
  );

  setText(
    "streetBins",
    waste.reported_street_bins == null
      ? "—"
      : compact(waste.reported_street_bins)
  );

  makeDoughnut(
    "wasteRecordsChart",
    ["Equipment", "Segregation", "Collection vehicles"],
    [
      Number(waste.equipment_records) || 0,
      Number(waste.segregation_records) || 0,
      Number(waste.vehicle_records) || 0
    ],
    ["#6e9cb0", "#5eaa8b", "#78966d"]
  );

  const metrics = [
    ["Equipment records", waste.equipment_records],
    ["Segregation records", waste.segregation_records],
    ["Collection vehicle records", waste.vehicle_records],
    ["Reported waste (tonnes/day)", waste.reported_waste_tonnes_per_day],
    ["Reported households", waste.reported_households],
    ["Reported segregation (%)", waste.reported_segregation_percent],
    ["Reported street bins", waste.reported_street_bins]
  ].filter(([, value]) => value !== undefined && value !== null);

  $("wasteMetrics").innerHTML = metrics.length
    ? metrics.map(([label, value]) => `
        <div class="metric-row">
          <span>${safeText(label)}</span>
          <strong>${number(value, 2)}</strong>
        </div>
      `).join("")
    : `<div class="empty-state">No waste indicators returned.</div>`;
}

function renderAI() {
  const data = state.ai || {};
  const traffic = data.traffic_ranking || [];

  $("aiTrafficList").innerHTML = traffic.length
    ? traffic.map((row, index) => `
        <div class="ai-traffic-row">
          <div class="ai-rank">${String(index + 1).padStart(2, "0")}</div>
          <div class="ai-traffic-main">
            <strong>${safeText(row.junction)}</strong>
            <span>${number(row.total_vehicles)} accumulated vehicle counts</span>
            <div class="load-track">
              <i style="width:${Math.max(3, Math.min(100, Number(row.relative_load_percent) || 0))}%"></i>
            </div>
          </div>
          <div class="load-value">${number(row.relative_load_percent, 1)}%</div>
        </div>
      `).join("")
    : `<div class="empty-state">No traffic data available for analysis.</div>`;

  const aqi = data.aqi || {};
  const forecast = data.aqi_forecast || {};

  $("aiAQISummary").innerHTML = `
    <div class="metric-row">
      <span>Latest pooled daily mean</span>
      <strong>${aqi.latest_daily_mean == null ? "—" : number(aqi.latest_daily_mean, 2)}</strong>
    </div>
    <div class="metric-row">
      <span>Recent trend</span>
      <strong>${safeText(aqi.trend || "Unavailable")}</strong>
    </div>
    <div class="metric-row">
      <span>Forecast model</span>
      <strong>${safeText(forecast.model || "Unavailable")}</strong>
    </div>
  `;

  setText(
    "aiForecastNote",
    forecast.available
      ? `${forecast.model}. Validation MAE: ${forecast.validation_mae == null ? "not available" : number(forecast.validation_mae, 2)}. Experimental forecast based on historical data.`
      : forecast.reason || "Not enough historical data to generate a forecast."
  );

  if (forecast.available && Array.isArray(forecast.forecast) && forecast.forecast.length) {
    makeChart("aiForecastChart", {
      type: "line",
      data: {
        labels: forecast.forecast.map(item => formatDate(item.date)),
        datasets: [{
          label: "Predicted reading",
          data: forecast.forecast.map(item => item.predicted_reading),
          borderColor: "#286b53",
          backgroundColor: "#286b5318",
          fill: true,
          tension: 0.25,
          pointRadius: 3
        }]
      },
      options: chartDefaults()
    });
  } else {
    showChartMessage("aiForecastChart", "The model has not returned forecast values.");
  }

  const recommendations = data.recommendations || [];

  $("aiRecommendations").innerHTML = recommendations.length
    ? recommendations.map((item, index) => `
        <article class="recommendation-card">
          <span class="priority">${safeText(item.priority || "Medium")} priority</span>
          <h4>${safeText(item.title)}</h4>
          <p>${safeText(item.detail)}</p>
          <p><strong>Evidence:</strong> ${safeText(item.basis)}</p>
        </article>
      `).join("")
    : `<div class="empty-state">No recommendations available.</div>`;

  $("aiMethods").textContent = (data.methods || []).join(" ");
}

async function askAdvisor(question) {
  const answer = $("advisorAnswer");

  answer.textContent = "Checking the project data...";

  try {
    const result = await getJSON(
      `/api/ai/ask?question=${encodeURIComponent(question)}`
    );

    answer.textContent = result.answer || "No answer was returned.";
  } catch (error) {
    console.error("AI advisor error:", error);
    answer.textContent = "Unable to reach the AI endpoint. Check the FastAPI backend.";
  }
}

async function loadDashboard() {
  const refreshButton = $("refreshBtn");

  refreshButton.disabled = true;
  $("errorBanner").classList.add("hidden");
  setText("updatedAt", "Loading datasets...");

  const requests = [
    ["overview", "/api/overview"],
    ["traffic", "/api/traffic"],
    ["aqi", "/api/aqi"],
    ["history", historyPath()],
    ["waste", "/api/waste"],
    ["ai", "/api/ai/insights"]
  ];

  const results = await Promise.allSettled(
    requests.map(async ([key, path]) => [key, await getJSON(path)])
  );

  const errors = [];

  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const key = requests[index][0];

    if (result.status === "fulfilled") {
      const [, value] = result.value;

      if (key === "overview") state.overview = value || {};
      if (key === "traffic") state.traffic = Array.isArray(value) ? value : [];
      if (key === "aqi") state.aqi = value || { stations: [] };
      if (key === "history") state.aqiHistory = Array.isArray(value) ? value : [];
      if (key === "waste") state.waste = value || {};
      if (key === "ai") state.ai = value || {};
    } else {
      errors.push(`${key}: ${result.reason?.message || "request failed"}`);
      console.error(`PunePulse ${key} request failed:`, result.reason);
    }
  }

  try {
    renderOverview();
    renderTraffic();
    renderWaste();
    renderAI();
    renderAQI();

    const connected = errors.length === 0;

    setText(
      "sidebarStatus",
      connected ? "Connected successfully" : "Partially connected"
    );

    const statusDot = document.querySelector(".live-pill .status-dot");
    if (statusDot) {
      statusDot.style.background = connected ? "#56a77b" : "#c8754f";
    }

    $("errorBanner").classList.toggle("hidden", connected);

    if (!connected) {
      $("errorBanner").innerHTML =
        `<strong>Some data could not be loaded.</strong> Check that FastAPI is running and review the browser console.`;
    }

    setText(
      "updatedAt",
      `Updated ${new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit"
      })}`
    );
  } catch (error) {
    console.error("Dashboard rendering error:", error);
    setText("updatedAt", "Rendering error");
    $("errorBanner").classList.remove("hidden");
  } finally {
    refreshButton.disabled = false;
  }
}

document.querySelectorAll("[data-page]").forEach(element => {
  element.addEventListener("click", event => {
    event.preventDefault();
    showPage(element.dataset.page);
  });
});

$("refreshBtn").addEventListener("click", loadDashboard);

$("mobileMenu").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
});

$("stationSelect").addEventListener("change", drawStationComparisonChart);

async function applyAQIRange(start, end) {
  state.aqiRange = { start, end };

  try {
    const rows = await getJSON(historyPath());
    state.aqiHistory = Array.isArray(rows) ? rows : [];
    renderAQI();
  } catch (error) {
    console.error("AQI range error:", error);
    setText("aqiComparisonNote", "Could not load that date range. Check the FastAPI backend.");
  }
}

$("aqiApply").addEventListener("click", () => {
  const start = $("aqiStart").value;
  const end = $("aqiEnd").value;

  if (start && end && start > end) {
    setText("aqiComparisonNote", "The start date must be before the end date.");
    return;
  }

  applyAQIRange(start, end);
});

$("aqiReset").addEventListener("click", () => {
  $("aqiStart").value = "";
  $("aqiEnd").value = "";
  applyAQIRange("", "");
});

$("advisorForm").addEventListener("submit", event => {
  event.preventDefault();

  const question = $("advisorQuestion").value.trim();
  if (question) askAdvisor(question);
});

document.querySelectorAll("[data-prompt]").forEach(button => {
  button.addEventListener("click", () => {
    const question = button.dataset.prompt;
    $("advisorQuestion").value = question;
    askAdvisor(question);
  });
});

document.addEventListener("DOMContentLoaded", loadDashboard);

state.trafficAnomalies = null;

function formatMinutes(minutes) {
  const total = Number(minutes) || 0;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function loadTrafficAnomalies() {
  try {
    state.trafficAnomalies = await getJSON("/api/traffic/ai-anomalies");
  } catch (error) {
    console.error("Traffic anomaly request failed:", error);
    state.trafficAnomalies = null;
  }

  renderTrafficAnomalies();
}

function renderTrafficAnomalies() {
  const data = state.trafficAnomalies;
  const select = $("anomalyJunction");
  const list = $("trafficAnomalyList");

  if (!select || !list) return;

  if (!data || !data.available || !data.junctions.length) {
    showChartMessage(
      "trafficAnomalyChart",
      data?.reason || "Anomaly detection is unavailable. Check /api/traffic/ai-anomalies."
    );
    setText("trafficAnomalyNote", "");
    list.innerHTML = "";
    return;
  }

  const previous = select.value;

  select.innerHTML = data.junctions.map(item => `
    <option value="${safeText(item.junction)}">${safeText(item.junction)}</option>
  `).join("");

  if (data.junctions.some(item => item.junction === previous)) {
    select.value = previous;
  }

  drawTrafficAnomalyChart();

  list.innerHTML = data.anomalies.length
    ? data.anomalies.map(item => `
        <div class="snapshot-row">
          <div>
            <div class="snapshot-name">${safeText(item.junction)} · ${safeText(item.time)}</div>
            <div class="snapshot-sub">${safeText(item.reason)} · recording ${safeText(item.session)}</div>
          </div>
          <div class="snapshot-value">${number(item.total)} vehicles</div>
        </div>
      `).join("")
    : `<div class="empty-state">No anomalies were detected.</div>`;
}

function drawTrafficAnomalyChart() {
  const data = state.trafficAnomalies;
  if (!data || !data.available) return;

  const junction =
    data.junctions.find(item => item.junction === $("anomalyJunction").value) ||
    data.junctions[0];

  const toPoint = point => ({
    x: point.minute,
    y: point.total,
    time: point.time,
    session: point.session
  });

  const normal = junction.points.filter(point => !point.anomaly).map(toPoint);
  const unusual = junction.points.filter(point => point.anomaly).map(toPoint);
  const base = chartDefaults();

  makeChart("trafficAnomalyChart", {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Normal intervals",
          data: normal,
          backgroundColor: "#78966d99",
          pointRadius: 3,
          pointHoverRadius: 5
        },
        {
          label: "Anomalies",
          data: unusual,
          backgroundColor: "#c0392b",
          pointRadius: 6,
          pointHoverRadius: 8
        }
      ]
    },
    options: {
      ...base,
      interaction: { intersect: true, mode: "nearest" },
      plugins: {
        ...base.plugins,
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            label(context) {
              const point = context.raw;
              return `${point.time} · ${point.session} · ${number(point.y)} vehicles`;
            }
          }
        }
      },
      scales: {
        x: {
          ...base.scales.x,
          type: "linear",
          ticks: {
            ...base.scales.x.ticks,
            stepSize: 30,
            callback: value => formatMinutes(value)
          },
          title: {
            display: true,
            text: "Time of day",
            color: "#758078",
            font: { family: "DM Sans", size: 10 }
          }
        },
        y: {
          ...base.scales.y,
          beginAtZero: true,
          title: {
            ...base.scales.y.title,
            text: "Vehicles per 5 minutes"
          }
        }
      }
    }
  });

  setText(
    "trafficAnomalyNote",
    `${junction.points.length} five-minute intervals at ${junction.junction}, ${unusual.length} flagged as unusual by the ${data.model} (about ${Math.round(data.contamination * 100)}% expected). Each point is one interval from a recording session.`
  );
}

$("anomalyJunction").addEventListener("change", drawTrafficAnomalyChart);
$("refreshBtn").addEventListener("click", loadTrafficAnomalies);
document.addEventListener("DOMContentLoaded", loadTrafficAnomalies);