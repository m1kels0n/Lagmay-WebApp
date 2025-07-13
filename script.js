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
let refreshInterval = 5000;
let pollIntervalId = null;

// Gauge charts
let soilMoistureChart, temperatureChart, humidityChart;

function initCharts() {
  const ctxSoil = document.getElementById("soil-moisture-gauge").getContext("2d");
  const ctxTemp = document.getElementById("temperature-gauge").getContext("2d");
  const ctxHum = document.getElementById("humidity-gauge").getContext("2d");

  soilMoistureChart = new Chart(ctxSoil, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [0, 100],
        backgroundColor: ["#0288d1", "#e0e0e0"],
        borderWidth: 0,
        circumference: 270,
        rotation: 225
      }]
    },
    options: {
      cutout: "80%",
      responsive: true,
      plugins: { legend: { display: false } },
      animation: { animateRotate: true, animateScale: true }
    }
  });

  temperatureChart = new Chart(ctxTemp, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [0, 50],
        backgroundColor: ["#d32f2f", "#e0e0e0"],
        borderWidth: 0,
        circumference: 270,
        rotation: 225
      }]
    },
    options: {
      cutout: "80%",
      responsive: true,
      plugins: { legend: { display: false } },
      animation: { animateRotate: true, animateScale: true }
    }
  });

  humidityChart = new Chart(ctxHum, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [0, 100],
        backgroundColor: ["#26a69a", "#e0e0e0"],
        borderWidth: 0,
        circumference: 270,
        rotation: 225
      }]
    },
    options: {
      cutout: "80%",
      responsive: true,
      plugins: { legend: { display: false } },
      animation: { animateRotate: true, animateScale: true }
    }
  });
}

// Show feedback message
function showFeedback(message, type = 'success', retryCallback = null) {
  const feedback = document.getElementById('feedback');
  feedback.innerHTML = retryCallback 
    ? `${message} <button class="btn btn-sm btn-outline-light ms-2 retry-btn" aria-label="Retry action">Retry</button>` 
    : message;
  feedback.className = `alert alert-${type} d-block fade show`;
  gsap.from(feedback, { x: 20, opacity: 0, duration: 0.4 });
  if (retryCallback) {
    feedback.querySelector('.retry-btn').addEventListener('click', retryCallback);
  }
  setTimeout(() => {
    feedback.className = 'alert d-none';
  }, 5000);
}

// Toggle loading spinner
function toggleSpinner(show) {
  document.getElementById('loading-spinner').classList[show ? 'remove' : 'add']('d-none');
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
      console.log("Admin user, showing navbar");
      document.getElementById("admin-nav").classList.remove("d-none");
      document.getElementById("logs-nav").classList.remove("d-none");
      document.getElementById("settings-btn").classList.remove("d-none");
      document.querySelector(".nav-link[data-group='1']").classList.add("active");
    } else {
      currentGroup = user.group;
      document.getElementById("group-id").textContent = currentGroup;
      document.getElementById("admin-nav").classList.add("d-none");
      console.log("Fetching sensor data for group:", currentGroup);
      initCharts();
      fetchSensorData();
    }
    // Initialize tooltips
    bootstrap.Tooltip.getOrCreateInstance(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
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
  clearInterval(pollIntervalId);
});

// Navbar switching (admin only)
document.querySelectorAll(".nav-link").forEach(tab => {
  tab.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentUser.role !== "admin") return;
    console.log("Nav link clicked:", e.target.dataset.group);
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
  toggleSpinner(true);
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
    document.getElementById("pump-toggle").checked = data.pump_state || false;
    document.getElementById("pump-status").textContent = data.pump_state ? "ON" : "OFF";
    document.getElementById("pump-toggle").setAttribute("aria-label", `Toggle water pump, currently ${data.pump_state ? "ON" : "OFF"}`);
    document.getElementById("light-toggle").checked = data.light_state || false;
    document.getElementById("light-status").textContent = data.light_state ? "ON" : "OFF";
    document.getElementById("light-toggle").setAttribute("aria-label", `Toggle light, currently ${data.light_state ? "ON" : "OFF"}`);
    // Update gauges with animation
    gsap.to(soilMoistureChart.data.datasets[0], {
      data: [Math.min(data.soil_moisture || 0, 100), 100 - Math.min(data.soil_moisture || 0, 100)],
      duration: 0.5,
      onUpdate: () => soilMoistureChart.update(),
      onComplete: () => document.getElementById("soil-moisture-gauge").classList.add("pulse")
    });
    document.getElementById("soil-moisture-gauge").setAttribute("aria-label", `Soil Moisture Gauge, ${data.soil_moisture || 0}%`);
    gsap.to(temperatureChart.data.datasets[0], {
      data: [Math.min(data.temperature || 0, 50), 50 - Math.min(data.temperature || 0, 50)],
      duration: 0.5,
      onUpdate: () => temperatureChart.update(),
      onComplete: () => document.getElementById("temperature-gauge").classList.add("pulse")
    });
    document.getElementById("temperature-gauge").setAttribute("aria-label", `Temperature Gauge, ${data.temperature || 0}°C`);
    gsap.to(humidityChart.data.datasets[0], {
      data: [Math.min(data.humidity || 0, 100), 100 - Math.min(data.humidity || 0, 100)],
      duration: 0.5,
      onUpdate: () => humidityChart.update(),
      onComplete: () => document.getElementById("humidity-gauge").classList.add("pulse")
    });
    document.getElementById("humidity-gauge").setAttribute("aria-label", `Humidity Gauge, ${data.humidity || 0}%`);
    // Remove pulse after animation
    setTimeout(() => {
      document.getElementById("soil-moisture-gauge").classList.remove("pulse");
      document.getElementById("temperature-gauge").classList.remove("pulse");
      document.getElementById("humidity-gauge").classList.remove("pulse");
    }, 1000);
    // Update timestamp
    document.getElementById("last-updated").textContent = new Date().toLocaleString();
    showFeedback("Sensor data updated", "success");
    isLoading = false;
    toggleSpinner(false);
  })
  .catch(err => {
    console.error("Error fetching sensor data:", err);
    showFeedback("Failed to fetch sensor data", "danger", fetchSensorData);
    isLoading = false;
    toggleSpinner(false);
  });
}

// Control pump
document.getElementById("pump-toggle").addEventListener("change", (e) => {
  if (!currentUser || (currentUser.role !== "admin" && currentUser.group !== currentGroup)) {
    console.log("Access denied: User not authorized for group", currentGroup);
    e.target.checked = !e.target.checked; // Revert toggle
    return;
  }
  if (isLoading) {
    e.target.checked = !e.target.checked; // Revert toggle
    return;
  }
  isLoading = true;
  toggleSpinner(true);
  const newState = e.target.checked;
  console.log("Pump toggle changed, new state:", newState);
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
    toggleSpinner(false);
  })
  .catch(err => {
    console.error("Error controlling pump:", err);
    showFeedback("Failed to control pump", "danger", () => document.getElementById("pump-toggle").dispatchEvent(new Event("change")));
    e.target.checked = !e.target.checked; // Revert toggle
    isLoading = false;
    toggleSpinner(false);
  });
});

// Control light
document.getElementById("light-toggle").addEventListener("change", (e) => {
  if (!currentUser || (currentUser.role !== "admin" && currentUser.group !== currentGroup)) {
    console.log("Access denied: User not authorized for group", currentGroup);
    e.target.checked = !e.target.checked; // Revert toggle
    return;
  }
  if (isLoading) {
    e.target.checked = !e.target.checked; // Revert toggle
    return;
  }
  isLoading = true;
  toggleSpinner(true);
  const newState = e.target.checked;
  console.log("Light toggle changed, new state:", newState);
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
    toggleSpinner(false);
  })
  .catch(err => {
    console.error("Error controlling light:", err);
    showFeedback("Failed to control light", "danger", () => document.getElementById("light-toggle").dispatchEvent(new Event("change")));
    e.target.checked = !e.target.checked; // Revert toggle
    isLoading = false;
    toggleSpinner(false);
  });
});

// Fetch logs (admin only)
function fetchLogs(filter = '') {
  if (currentUser.role !== "admin") {
    console.log("Access denied: Logs are admin-only");
    return;
  }
  if (isLoading) return;
  isLoading = true;
  toggleSpinner(true);
  showFeedback("Loading logs...", "info");
  console.log("Fetching logs with filter:", filter);
  fetch(`${API_BASE}/devices/logs`, {
    headers: { "Authorization": `Bearer ${API_TOKEN}` }
  })
  .then(res => res.json())
  .then(logs => {
    console.log("Logs received:", logs);
    const logList = document.getElementById("log-list");
    logList.innerHTML = "";
    const filteredLogs = logs.filter(log => 
      log.action.toLowerCase().includes(filter.toLowerCase()) || 
      log.group.toString().includes(filter)
    );
    filteredLogs.forEach(log => {
      const li = document.createElement("li");
      li.textContent = `${log.timestamp}: ${log.user} ${log.action} (Group ${log.group}, Soil: ${log.soil_moisture}%, Temp: ${log.temperature}°C, Hum: ${log.humidity}%)`;
      logList.appendChild(li);
    });
    showFeedback("Logs updated", "success");
    isLoading = false;
    toggleSpinner(false);
  })
  .catch(err => {
    console.error("Error fetching logs:", err);
    showFeedback("Failed to fetch logs", "danger", () => fetchLogs(filter));
    isLoading = false;
    toggleSpinner(false);
  });
}

// Log filter
document.getElementById("log-filter").addEventListener("input", (e) => {
  fetchLogs(e.target.value);
});

// Dark mode toggle
document.getElementById("dark-mode-toggle").addEventListener("change", (e) => {
  document.body.classList.toggle("dark-mode", e.target.checked);
  localStorage.setItem("darkMode", e.target.checked);
});

// Refresh interval
document.getElementById("refresh-interval").addEventListener("change", (e) => {
  refreshInterval = parseInt(e.target.value);
  clearInterval(pollIntervalId);
  pollIntervalId = setInterval(fetchSensorData, refreshInterval);
  console.log("Refresh interval set to:", refreshInterval);
});

// Manual refresh
document.getElementById("refresh-btn").addEventListener("click", () => {
  console.log("Refresh button clicked");
  fetchSensorData();
});

// Initialize settings
document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("darkMode") === "true") {
    document.getElementById("dark-mode-toggle").checked = true;
    document.body.classList.add("dark-mode");
  }
  document.getElementById("refresh-interval").value = refreshInterval;
  pollIntervalId = setInterval(fetchSensorData, refreshInterval);
});