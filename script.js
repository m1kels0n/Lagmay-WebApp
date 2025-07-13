// User credentials (not secure; for demo only)
const users = [
  { username: "admin", password: "adminpass", role: "admin" },
  { username: "user1", password: "password1", role: "user", group: 1 },
  { username: "user2", password: "password2", role: "user", group: 2 },
  { username: "user3", password: "password3", role: "user", group: 3 },
  { username: "user4", password: "password4", role: "user", group: 4 }
];

// API settings (replace with actual Arduino Cloud API details)
const API_BASE = "https://api2.arduino.cc/iot/v2";
const API_TOKEN = "your_api_token";
let currentUser = null;
let currentGroup = 1;
let isLoading = false;

// Gauge charts
let soilMoistureChart, temperatureChart, humidityChart;

function initCharts() {
  const ctxSoil = document.getElementById("soil-moisture-gauge").getContext("2d");
  const ctxTemp = document.getElementById("temperature-gauge").getContext("2d");
  const ctxHum = document.getElementById("humidity-gauge").getContext("2d");

  soilMoistureChart = new Chart(ctxSoil, {
    type: "gauge",
    data: {
      datasets: [{
        value: 0,
        data: [100],
        backgroundColor: ["#0288d1"],
        borderWidth: 0
      }]
    },
    options: {
      needle: { radiusPercentage: 2, widthPercentage: 3.2, lengthPercentage: 80 },
      valueLabel: { display: false },
      minValue: 0,
      maxValue: 100
    }
  });

  temperatureChart = new Chart(ctxTemp, {
    type: "gauge",
    data: {
      datasets: [{
        value: 25,
        data: [50],
        backgroundColor: ["#d32f2f"],
        borderWidth: 0
      }]
    },
    options: {
      needle: { radiusPercentage: 2, widthPercentage: 3.2, lengthPercentage: 80 },
      valueLabel: { display: false },
      minValue: 30,
      maxValue: 50
    }
  });

  humidityChart = new Chart(ctxHum, {
    type: "gauge",
    data: {
      datasets: [{
        value: 0,
        data: [100],
        backgroundColor: ["#26a69a"],
        borderWidth: 0
      }]
    },
    options: {
      needle: { radiusPercentage: 2, widthPercentage: 3.2, lengthPercentage: 80 },
      valueLabel: { display: false },
      minValue: 0,
      maxValue: 100
    }
  });
}

// Show feedback message
function showFeedback(message, type = 'success') {
  const feedback = document.getElementById('feedback');
  feedback.textContent = message;
  feedback.className = `alert alert-${type} d-block`;
  setTimeout(() => feedback.className = 'alert d-none', 3000);
}

// Login
document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  console.log("Login form submitted");
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  console.log("Username:", username, "Password:", password);
  const user = users.find(u => u.username === username && u.password === password);
  console.log("User found:", user);
  if (user) {
    console.log("User authenticated, showing dashboard");
    currentUser = user;
    document.getElementById("login-container").classList.add("d-none");
    document.getElementById("dashboard").classList.remove("d-none");
    if (user.role === "admin") {
      console.log("Admin user, showing tabs");
      document.getElementById("admin-tabs").classList.remove("d-none");
      document.getElementById("logs-tab").classList.remove("d-none");
      // Initialize tooltips
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));
    } else {
      currentGroup = user.group;
      document.getElementById("group-id").textContent = currentGroup;
      document.getElementById("admin-tabs").classList.add("d-none");
      console.log("Fetching sensor data for group:", currentGroup);
      initCharts();
      fetchSensorData();
    }
  } else {
    console.log("Login failed: Invalid credentials");
    alert("Invalid credentials");
  }
});

// Logout
document.getElementById("logout-btn").addEventListener("click", () => {
  console.log("Logout clicked");
  currentUser = null;
  document.getElementById("dashboard").classList.add("d-none");
  document.getElementById("login-container").classList.remove("d-none");
  if (soilMoistureChart) soilMoistureChart.destroy();
  if (temperatureChart) temperatureChart.destroy();
  if (humidityChart) humidityChart.destroy();
});

// Tab switching (admin only)
document.querySelectorAll(".nav-link").forEach(tab => {
  tab.addEventListener("click", (e) => {
    if (currentUser.role !== "admin") return;
    console.log("Tab clicked:", e.target.dataset.group);
    document.querySelectorAll(".nav-link").forEach(t => t.classList.remove("active"));
    e.target.classList.add("active");
    if (e.target.dataset.group === "logs") {
      document.getElementById("sensor-data").classList.add("d-none");
      document.getElementById("controls").classList.add("d-none");
      document.getElementById("logs").classList.remove("d-none");
      if (soilMoistureChart) soilMoistureChart.destroy();
      if (temperatureChart) temperatureChart.destroy();
      if (humidityChart) humidityChart.destroy();
      fetchLogs();
    } else {
      currentGroup = parseInt(e.target.dataset.group);
      document.getElementById("group-id").textContent = currentGroup;
      document.getElementById("sensor-data").classList.remove("d-none");
      document.getElementById("controls").classList.remove("d-none");
      document.getElementById("logs").classList.add("d-none");
      initCharts();
      fetchSensorData();
    }
  });
});

// Fetch sensor data
function fetchSensorData() {
  if (!currentUser || (currentUser.role !== "admin" && currentUser.group !== currentGroup)) {
    console.log("Access denied: User not authorized for group", currentGroup);
    return;
  }
  if (isLoading) return;
  isLoading = true;
  showFeedback("Loading sensor data...", "info");
  console.log("Fetching sensor data for group:", currentGroup);
  fetch(`${API_BASE}/devices/group${currentGroup}/sensors`, {
    headers: { "Authorization": `Bearer ${API_TOKEN}` }
  })
  .then(res => res.json())
  .then(data => {
    console.log("Sensor data received:", data);
    // Update numerical values
    document.getElementById("soil-moisture").textContent = data.soil_moisture || 0;
    document.getElementById("temperature").textContent = data.temperature || 0;
    document.getElementById("humidity").textContent = data.humidity || 0;
    document.getElementById("pump-btn").textContent = `Pump: ${data.pump_state ? "ON" : "OFF"}`;
    document.getElementById("light-btn").textContent = `Light: ${data.light_state ? "ON" : "OFF"}`;
    // Update gauges
    soilMoistureChart.data.datasets[0].value = Math.min(data.soil_moisture || 0, 100);
    soilMoistureChart.update();
    document.getElementById("soil-moisture-gauge").setAttribute("aria-label", `Soil Moisture Gauge, ${data.soil_moisture || 0}%`);
    temperatureChart.data.datasets[0].value = Math.min(data.temperature || 0, 50);
    temperatureChart.update();
    document.getElementById("temperature-gauge").setAttribute("aria-label", `Temperature Gauge, ${data.temperature || 0}°C`);
    humidityChart.data.datasets[0].value = Math.min(data.humidity || 0, 100);
    humidityChart.update();
    document.getElementById("humidity-gauge").setAttribute("aria-label", `Humidity Gauge, ${data.humidity || 0}%`);
    // Update timestamp
    document.getElementById("last-updated").textContent = new Date().toLocaleString();
    showFeedback("Sensor data updated", "success");
    isLoading = false;
  })
  .catch(err => {
    console.error("Error fetching sensor data:", err);
    showFeedback("Failed to fetch sensor data", "danger");
    isLoading = false;
  });
}

// Control pump
document.getElementById("pump-btn").addEventListener("click", () => {
  if (!currentUser || (currentUser.role !== "admin" && currentUser.group !== currentGroup)) {
    console.log("Access denied: User not authorized for group", currentGroup);
    return;
  }
  if (isLoading) return;
  isLoading = true;
  const newState = document.getElementById("pump-btn").textContent.includes("OFF");
  console.log("Pump button clicked, new state:", newState);
  showFeedback(`Turning pump ${newState ? "ON" : "OFF"}...`, "info");
  fetch(`${API_BASE}/devices/group${currentGroup}/control`, {
    method: "POST",
    headers: { 
      "Authorization": `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ pump_state: newState })
  })
  .then(() => {
    fetchSensorData();
    showFeedback(`Pump turned ${newState ? "ON" : "OFF"}`, "success");
    isLoading = false;
  })
  .catch(err => {
    console.error("Error controlling pump:", err);
    showFeedback("Failed to control pump", "danger");
    isLoading = false;
  });
});

// Control light
document.getElementById("light-btn").addEventListener("click", () => {
  if (!currentUser || (currentUser.role !== "admin" && currentUser.group !== currentGroup)) {
    console.log("Access denied: User not authorized for group", currentGroup);
    return;
  }
  if (isLoading) return;
  isLoading = true;
  const newState = document.getElementById("light-btn").textContent.includes("OFF");
  console.log("Light button clicked, new state:", newState);
  showFeedback(`Turning light ${newState ? "ON" : "OFF"}...`, "info");
  fetch(`${API_BASE}/devices/group${currentGroup}/control`, {
    method: "POST",
    headers: { 
      "Authorization": `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ light_state: newState })
  })
  .then(() => {
    fetchSensorData();
    showFeedback(`Light turned ${newState ? "ON" : "OFF"}`, "success");
    isLoading = false;
  })
  .catch(err => {
    console.error("Error controlling light:", err);
    showFeedback("Failed to control light", "danger");
    isLoading = false;
  });
});

// Fetch logs (admin only)
function fetchLogs() {
  if (currentUser.role !== "admin") {
    console.log("Access denied: Logs are admin-only");
    return;
  }
  if (isLoading) return;
  isLoading = true;
  showFeedback("Loading logs...", "info");
  console.log("Fetching logs");
  fetch(`${API_BASE}/devices/logs`, {
    headers: { "Authorization": `Bearer ${API_TOKEN}` }
  })
  .then(res => res.json())
  .then(logs => {
    console.log("Logs received:", logs);
    const logList = document.getElementById("log-list");
    logList.innerHTML = "";
    logs.forEach(log => {
      const li = document.createElement("li");
      li.textContent = `${log.timestamp}: ${log.user} ${log.action} (Group ${log.group}, Soil: ${log.soil_moisture}%, Temp: ${log.temperature}°C, Hum: ${log.humidity}%)`;
      logList.appendChild(li);
    });
    showFeedback("Logs updated", "success");
    isLoading = false;
  })
  .catch(err => {
    console.error("Error fetching logs:", err);
    showFeedback("Failed to fetch logs", "danger");
    isLoading = false;
  });
}

// Manual refresh
document.getElementById("refresh-btn").addEventListener("click", () => {
  console.log("Refresh button clicked");
  fetchSensorData();
});

// Poll sensor data every 5 seconds
setInterval(fetchSensorData, 5000);