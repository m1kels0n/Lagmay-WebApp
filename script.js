// Firebase configuration (replace with your Firebase project's config)
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC-jzkS6N6DwVW_8HlGmDLbgPP-HFZEzfs",
  authDomain: "lagmay-irrigation.firebaseapp.com",
  databaseURL: "https://lagmay-irrigation-default-rtdb.firebaseio.com",
  projectId: "lagmay-irrigation",
  storageBucket: "lagmay-irrigation.firebasestorage.app",
  messagingSenderId: "113788755522",
  appId: "1:113788755522:web:d2f71e315f416b3dbb17db",
  measurementId: "G-8V0VYYL087"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// API settings (replace with actual Arduino Cloud API details)
const API_BASE = "https://api2.arduino.cc/iot/v2";
const API_TOKEN = "your_api_token";
let currentUser = null;
let currentGroup = 1;
let isLoading = false;
let refreshInterval = 5000;
let pollIntervalId = null;
let plantNames = { "1": "", "2": "", "3": "", "4": "" };
let isAdmin = false;

// Gauge charts
let soilMoistureChart, temperatureChart, humidityChart;

// Load plant names from Firebase Realtime Database with real-time listener
function loadPlantNames() {
  console.log("Loading plant names...");
  db.ref("plantNames").on("value", snapshot => {
    plantNames = snapshot.val() || { "1": "", "2": "", "3": "", "4": "" };
    console.log("Loaded from Firebase:", plantNames);
    updatePlantNameUI();
  }, err => {
    console.error("Error loading plant names:", err);
    plantNames = { "1": "", "2": "", "3": "", "4": "" };
    updatePlantNameUI();
    showFeedback("Failed to load plant names", "danger");
    showErrorToast("Unable to load plant names. Please try again.");
  });
}

// Save plant names to Firebase Realtime Database
function savePlantNames() {
  console.log("Saving plant names:", plantNames);
  return db.ref("plantNames").set(plantNames)
    .then(() => {
      showFeedback("Plant names saved", "success");
    })
    .catch(err => {
      console.error("Error saving plant names:", err);
      showFeedback("Failed to save plant names", "danger");
      showErrorToast("Unable to save plant names. Please try again.");
    });
}

// Update plant name UI
function updatePlantNameUI() {
  document.getElementById("plant-name").textContent = plantNames[currentGroup] || `Group ${currentGroup}`;
  if (isAdmin) {
    for (let i = 1; i <= 4; i++) {
      document.getElementById(`plant-name-${i}`).textContent = plantNames[i] || `Group ${i}`;
      document.getElementById(`plant-name-${i}-input`).value = plantNames[i] || "";
    }
  }
}

function initCharts() {
  console.log("Initializing charts for group:", currentGroup);
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
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          ctx.save();
          ctx.font = "1.5rem Poppins";
          ctx.fillStyle = document.body.classList.contains("dark-mode") ? "#e0e0e0" : "#333";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${chart.data.datasets[0].data[0]}%`, chart.width / 2, chart.height / 2);
          ctx.restore();
        }
      },
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
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          ctx.save();
          ctx.font = "1.5rem Poppins";
          ctx.fillStyle = document.body.classList.contains("dark-mode") ? "#e0e0e0" : "#333";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${chart.data.datasets[0].data[0]}°C`, chart.width / 2, chart.height / 2);
          ctx.restore();
        }
      },
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
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          ctx.save();
          ctx.font = "1.5rem Poppins";
          ctx.fillStyle = document.body.classList.contains("dark-mode") ? "#e0e0e0" : "#333";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${chart.data.datasets[0].data[0]}%`, chart.width / 2, chart.height / 2);
          ctx.restore();
        }
      },
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
  gsap.from(feedback, { scale: 0.8, opacity: 0, duration: 0.5, ease: "bounce.out" });
  if (retryCallback) {
    feedback.querySelector('.retry-btn').addEventListener('click', retryCallback);
  }
  setTimeout(() => {
    feedback.className = 'alert d-none';
  }, 5000);
}

// Show error toast
function showErrorToast(message, retryCallback = null) {
  const toastElement = document.getElementById('error-toast');
  const toastBody = toastElement.querySelector('.toast-body');
  toastBody.innerHTML = retryCallback 
    ? `${message} <button class="btn btn-sm btn-outline-light ms-2 retry-toast-btn" aria-label="Retry action">Retry</button>` 
    : message;
  const toast = bootstrap.Toast.getOrCreateInstance(toastElement, { delay: 7000 });
  if (retryCallback) {
    const retryBtn = toastBody.querySelector('.retry-toast-btn');
    retryBtn.addEventListener('click', () => {
      retryCallback();
      toast.hide();
    });
  }
  toast.show();
}

// Toggle loading spinner
function toggleSpinner(show) {
  document.getElementById('loading-spinner').classList[show ? 'remove' : 'add']('d-none');
}

// Login with Firebase Authentication
document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  console.log("Login form submitted");
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const email = `${username}@plantwatering.com`;
  console.log("Attempting login:", email);
  firebase.auth().signInWithEmailAndPassword(email, password)
    .then(userCredential => {
      console.log("User authenticated:", userCredential.user.email);
      currentUser = { email: userCredential.user.email, uid: userCredential.user.uid };
      isAdmin = email === "admin@plantwatering.com";
      document.getElementById("login-container").classList.add("d-none");
      document.getElementById("dashboard").classList.remove("d-none");
      if (isAdmin) {
        console.log("Admin user, showing navbar and plant name settings");
        document.getElementById("admin-nav").classList.remove("d-none");
        document.getElementById("logs-nav").classList.remove("d-none");
        document.getElementById("settings-btn").classList.remove("d-none");
        document.getElementById("plant-name-settings").classList.remove("d-none");
        document.querySelector(".nav-link[data-group='1']").classList.add("active");
        currentGroup = 1;
      } else {
        currentGroup = parseInt(username.replace("user", ""));
        document.getElementById("admin-nav").classList.add("d-none");
        document.getElementById("plant-name-settings").classList.add("d-none");
        console.log("Initializing dashboard for user, group:", currentGroup);
      }
      showFeedback("Fetching data...", "info");
      initCharts();
      loadPlantNames().then(() => {
        fetchSensorData();
        clearInterval(pollIntervalId);
        pollIntervalId = setInterval(fetchSensorData, refreshInterval);
        console.log("Polling interval set:", refreshInterval);
      });
      // Initialize tooltips
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
        bootstrap.Tooltip.getOrCreateInstance(el);
      });
    })
    .catch(err => {
      console.error("Login failed:", err);
      showFeedback("Invalid credentials", "danger");
      showErrorToast("Invalid username or password");
    });
});

// Logout
document.getElementById("logout-btn").addEventListener("click", () => {
  console.log("Logout clicked");
  firebase.auth().signOut().then(() => {
    currentUser = null;
    isAdmin = false;
    document.getElementById("dashboard").classList.add("d-none");
    document.getElementById("login-container").classList.remove("d-none");
    if (soilMoistureChart) soilMoistureChart.destroy();
    if (temperatureChart) temperatureChart.destroy();
    if (humidityChart) humidityChart.destroy();
    clearInterval(pollIntervalId);
    showFeedback("Logged out successfully", "success");
  }).catch(err => {
    console.error("Logout failed:", err);
    showFeedback("Failed to log out", "danger");
  });
});

// Navbar switching (admin only)
document.querySelectorAll(".nav-link").forEach(tab => {
  tab.addEventListener("click", (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    console.log("Nav link clicked:", e.target.dataset.group);
    document.querySelectorAll(".nav-link").forEach(t => t.classList.remove("active"));
    e.target.classList.add("active");
    gsap.from(e.target, { scale: 0.9, duration: 0.3, ease: "bounce.out" });
    if (e.target.dataset.group === "logs") {
      document.getElementById("sensor-data").classList.add("d-none");
      document.getElementById("controls").classList.add("d-none");
      document.getElementById("logs").classList.remove("d-none");
      if (soilMoistureChart) soilMoistureChart.destroy();
      if (temperatureChart) temperatureChart.destroy();
      if (humidityChart) humidityChart.destroy();
      clearInterval(pollIntervalId);
      fetchLogs();
    } else {
      currentGroup = parseInt(e.target.dataset.group);
      document.getElementById("plant-name").textContent = plantNames[currentGroup] || `Group ${currentGroup}`;
      document.getElementById("sensor-data").classList.remove("d-none");
      document.getElementById("controls").classList.remove("d-none");
      document.getElementById("logs").classList.add("d-none");
      initCharts();
      fetchSensorData();
      clearInterval(pollIntervalId);
      pollIntervalId = setInterval(fetchSensorData, refreshInterval);
      console.log("Polling interval set for admin group switch:", refreshInterval);
    }
  });
});

// Fetch sensor data
function fetchSensorData() {
  if (!currentUser || (!isAdmin && currentUser.email !== `user${currentGroup}@plantwatering.com`)) {
    console.log("Access denied: User not authorized for group", currentGroup);
    return;
  }
  if (isLoading) {
    console.log("Fetch skipped: Already loading");
    return;
  }
  isLoading = true;
  toggleSpinner(true);
  showFeedback("Loading sensor data...", "info");
  console.log("Fetching sensor data for group:", currentGroup);
  fetch(`${API_BASE}/devices/group${currentGroup}/sensors`, {
    headers: { "Authorization": `Bearer ${API_TOKEN}` }
  })
  .then(res => {
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
  })
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
    showErrorToast("Unable to connect to Arduino Cloud. Please check your network or API token.", fetchSensorData);
    isLoading = false;
    toggleSpinner(false);
  });
}

// Control pump
document.getElementById("pump-toggle").addEventListener("change", (e) => {
  if (!currentUser || (!isAdmin && currentUser.email !== `user${currentGroup}@plantwatering.com`)) {
    console.log("Access denied: User not authorized for group", currentGroup);
    e.target.checked = !e.target.checked; // Revert toggle
    return;
  }
  if (isLoading) {
    console.log("Toggle skipped: Already loading");
    e.target.checked = !e.target.checked; // Revert toggle
    return;
  }
  isLoading = true;
  toggleSpinner(true);
  const newState = e.target.checked;
  console.log("Pump toggle changed, new state:", newState);
  showFeedback(`Turning pump ${newState ? "ON" : "OFF"}...`, "info");
  gsap.to(e.target.nextElementSibling, { x: -2, duration: 0.05, repeat: 3, yoyo: true });
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
    showErrorToast("Failed to control pump. Please try again.", () => document.getElementById("pump-toggle").dispatchEvent(new Event("change")));
    e.target.checked = !e.target.checked; // Revert toggle
    isLoading = false;
    toggleSpinner(false);
  });
});

// Control light
document.getElementById("light-toggle").addEventListener("change", (e) => {
  if (!currentUser || (!isAdmin && currentUser.email !== `user${currentGroup}@plantwatering.com`)) {
    console.log("Access denied: User not authorized for group", currentGroup);
    e.target.checked = !e.target.checked; // Revert toggle
    return;
  }
  if (isLoading) {
    console.log("Toggle skipped: Already loading");
    e.target.checked = !e.target.checked; // Revert toggle
    return;
  }
  isLoading = true;
  toggleSpinner(true);
  const newState = e.target.checked;
  console.log("Light toggle changed, new state:", newState);
  showFeedback(`Turning light ${newState ? "ON" : "OFF"}...`, "info");
  gsap.to(e.target.nextElementSibling, { x: -2, duration: 0.05, repeat: 3, yoyo: true });
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
    showErrorToast("Failed to control light. Please try again.", () => document.getElementById("light-toggle").dispatchEvent(new Event("change")));
    e.target.checked = !e.target.checked; // Revert toggle
    isLoading = false;
    toggleSpinner(false);
  });
});

// Fetch logs (admin only)
function fetchLogs(filter = '') {
  if (!isAdmin) {
    console.log("Access denied: Logs are admin-only");
    return;
  }
  if (isLoading) {
    console.log("Fetch logs skipped: Already loading");
    return;
  }
  isLoading = true;
  toggleSpinner(true);
  showFeedback("Loading logs...", "info");
  console.log("Fetching logs with filter:", filter);
  fetch(`${API_BASE}/devices/logs`, {
    headers: { "Authorization": `Bearer ${API_TOKEN}` }
  })
  .then(res => {
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
  })
  .then(logs => {
    console.log("Logs received:", logs);
    const logList = document.getElementById("log-list");
    logList.innerHTML = "";
    const filteredLogs = logs.filter(log => 
      log.action.toLowerCase().includes(filter.toLowerCase()) || 
      log.group.toString().includes(filter) ||
      (plantNames[log.group] && plantNames[log.group].toLowerCase().includes(filter.toLowerCase()))
    );
    filteredLogs.forEach(log => {
      const li = document.createElement("li");
      const plantName = plantNames[log.group] || `Group ${log.group}`;
      li.textContent = `${log.timestamp}: ${log.user} ${log.action} (${plantName}, Soil: ${log.soil_moisture}%, Temp: ${log.temperature}°C, Hum: ${log.humidity}%)`;
      logList.appendChild(li);
    });
    showFeedback("Logs updated", "success");
    isLoading = false;
    toggleSpinner(false);
  })
  .catch(err => {
    console.error("Error fetching logs:", err);
    showFeedback("Failed to fetch logs", "danger", () => fetchLogs(filter));
    showErrorToast("Failed to fetch logs. Please try again.", () => fetchLogs(filter));
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
  // Update chart labels
  [soilMoistureChart, temperatureChart, humidityChart].forEach(chart => {
    if (chart) chart.update();
  });
});

// Save settings
document.getElementById("save-settings").addEventListener("click", () => {
  refreshInterval = parseInt(document.getElementById("refresh-interval").value);
  clearInterval(pollIntervalId);
  pollIntervalId = setInterval(fetchSensorData, refreshInterval);
  console.log("Settings saved, refresh interval:", refreshInterval);
  if (isAdmin) {
    for (let i = 1; i <= 4; i++) {
      plantNames[i] = document.getElementById(`plant-name-${i}-input`).value.trim();
    }
    savePlantNames().then(() => updatePlantNameUI());
  }
  showFeedback("Settings saved", "success");
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
  // Load plant names only after login
});