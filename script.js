import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase configuration
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
const db = getDatabase(app);
const auth = getAuth(app);

// API settings (replace with actual Arduino Cloud API token)
const API_BASE = "https://api2.arduino.cc/iot/v2";
const API_TOKEN = "your_api_token";
let currentUser = null;
let currentGroup = 1;
let isLoading = false;
let refreshInterval = 5000;
let pollIntervalId = null;
let plantNames = { "1": "", "2": "", "3": "", "4": "" };
let isAdmin = false;
let spinnerTimeout = null;

// Gauge charts
let soilMoistureChart, temperatureChart, humidityChart;

// Load plant names from Firebase Realtime Database with real-time listener
function loadPlantNames() {
  console.log("Loading plant names...");
  const plantNamesRef = ref(db, "plantNames");
  onValue(plantNamesRef, (snapshot) => {
    plantNames = snapshot.val() || { "1": "", "2": "", "3": "", "4": "" };
    console.log("Loaded from Firebase:", plantNames);
    updatePlantNameUI();
  }, (err) => {
    console.error("Error loading plant names:", err);
    plantNames = { "1": "", "2": "", "3": "", "4": "" };
    updatePlantNameUI();
    showFeedback("Failed to load plant names", "danger");
    showErrorToast("Unable to load plant names. Please try again.");
  });
}

// Save plant names to Firebase Realtime Database
function savePlantNames() {
  if (!isAdmin) {
    console.log("Save plant names skipped: Not admin");
    showFeedback("Access denied: Admin only", "danger");
    showErrorToast("Only admin can save plant names.");
    return Promise.reject(new Error("Access denied"));
  }
  for (let i = 1; i <= 4; i++) {
    const input = document.getElementById(`plant-name-${i}-input`);
    if (input) {
      const name = input.value.trim();
      if (name.length > 20) {
        showFeedback(`Plant name for Group ${i} is too long (max 20 characters)`, "danger");
        showErrorToast(`Plant name for Group ${i} exceeds 20 characters.`);
        return Promise.reject(new Error("Invalid plant name"));
      }
      plantNames[i] = name;
    }
  }
  console.log("Saving plant names:", plantNames);
  const plantNamesRef = ref(db, "plantNames");
  return set(plantNamesRef, plantNames)
    .then(() => {
      showFeedback("Plant names saved", "success");
      updatePlantNameUI();
    })
    .catch(err => {
      console.error("Error saving plant names:", err);
      showFeedback("Failed to save plant names", "danger");
      showErrorToast("Unable to save plant names. Please try again.");
      throw err;
    });
}

// Update plant name UI
function updatePlantNameUI() {
  const plantNameElement = document.getElementById("plant-name");
  if (plantNameElement) {
    plantNameElement.textContent = plantNames[currentGroup] || `Group ${currentGroup} Dashboard`;
  }
  if (isAdmin) {
    for (let i = 1; i <= 4; i++) {
      const navElement = document.querySelector(`.admin-nav a[data-group="${i}"]`);
      const inputElement = document.getElementById(`plant-name-${i}-input`);
      if (navElement) {
        navElement.textContent = `Group ${i}`;
      }
      if (inputElement) {
        inputElement.value = plantNames[i] || "";
      }
    }
  }
}

function initCharts() {
  console.log("Initializing charts for group:", currentGroup);
  // Cleanup existing charts and resize listener
  if (soilMoistureChart) soilMoistureChart.destroy();
  if (temperatureChart) temperatureChart.destroy();
  if (humidityChart) humidityChart.destroy();
  window.removeEventListener('resize', resizeCharts);

  if (typeof Chart === 'undefined') {
    console.error("Chart.js is not loaded. Charts cannot be initialized.");
    showErrorToast("Failed to load charts. Please check your internet connection or reload the page.");
    return;
  }

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
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          ctx.save();
          const width = chart.width;
          const height = chart.height;
          const fontSize = Math.min(24, height / 5); // Cap at 24px for value
          const iconSize = Math.min(16, height / 7.5); // Cap at 16px for icon
          ctx.font = `${fontSize}px Poppins`;
          ctx.fillStyle = document.body.classList.contains("dark-mode") ? "#e0e0e0" : "#333";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const value = document.getElementById("soil-moisture").textContent || "0%";
          console.log("Drawing soil moisture value:", value); // Debug log
          ctx.fillText(value, width / 2, height / 2 - iconSize / 2); // Value above center
          ctx.font = `${iconSize}px FontAwesome`; // Set FontAwesome font for icon
          const iconCode = "\uf043"; // fa-tint (Soil Moisture)
          console.log("Drawing soil moisture icon with code:", iconCode); // Debug log
          ctx.fillText(iconCode, width / 2, height / 2 + fontSize / 2); // Icon below value
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
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          ctx.save();
          const width = chart.width;
          const height = chart.height;
          const fontSize = Math.min(24, height / 5); // Cap at 24px for value
          const iconSize = Math.min(16, height / 7.5); // Cap at 16px for icon
          ctx.font = `${fontSize}px Poppins`;
          ctx.fillStyle = document.body.classList.contains("dark-mode") ? "#e0e0e0" : "#333";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const value = document.getElementById("temperature").textContent || "0°C";
          console.log("Drawing temperature value:", value); // Debug log
          ctx.fillText(value, width / 2, height / 2 - iconSize / 2); // Value above center
          ctx.font = `${iconSize}px FontAwesome`; // Set FontAwesome font for icon
          const iconCode = "\uf2c7"; // fa-thermometer-half (Temperature)
          console.log("Drawing temperature icon with code:", iconCode); // Debug log
          ctx.fillText(iconCode, width / 2, height / 2 + fontSize / 2); // Icon below value
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
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          ctx.save();
          const width = chart.width;
          const height = chart.height;
          const fontSize = Math.min(24, height / 5); // Cap at 24px for value
          const iconSize = Math.min(16, height / 7.5); // Cap at 16px for icon
          ctx.font = `${fontSize}px Poppins`;
          ctx.fillStyle = document.body.classList.contains("dark-mode") ? "#e0e0e0" : "#333";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const value = document.getElementById("humidity").textContent || "0%";
          console.log("Drawing humidity value:", value); // Debug log
          ctx.fillText(value, width / 2, height / 2 - iconSize / 2); // Value above center
          ctx.font = `${iconSize}px FontAwesome`; // Set FontAwesome font for icon
          const iconCode = "\uf773"; // fa-water (Humidity)
          console.log("Drawing humidity icon with code:", iconCode); // Debug log
          ctx.fillText(iconCode, width / 2, height / 2 + fontSize / 2); // Icon below value
          ctx.restore();
        }
      },
      animation: { animateRotate: true, animateScale: true }
    }
  });

  window.addEventListener('resize', resizeCharts);
}

function resizeCharts() {
  [soilMoistureChart, temperatureChart, humidityChart].forEach(chart => {
    if (chart) chart.resize();
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
    const existingBtn = feedback.querySelector('.retry-btn');
    if (existingBtn) existingBtn.removeEventListener('click', existingBtn._retryCallback);
    feedback.querySelector('.retry-btn').addEventListener('click', retryCallback);
    feedback.querySelector('.retry-btn')._retryCallback = retryCallback;
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
    const existingBtn = toastBody.querySelector('.retry-toast-btn');
    if (existingBtn) existingBtn.removeEventListener('click', existingBtn._retryCallback);
    const retryBtn = toastBody.querySelector('.retry-toast-btn');
    retryBtn.addEventListener('click', () => {
      retryCallback();
      toast.hide();
    });
    retryBtn._retryCallback = retryCallback;
  }
  toast.show();
}

// Show error message inline
function showErrorMessage(message, retryCallback = null) {
  const errorMessage = document.getElementById('error-message');
  errorMessage.innerHTML = retryCallback 
    ? `${message} <button class="btn btn-sm btn-outline-danger ms-2 retry-error-btn" aria-label="Retry action">Retry</button>` 
    : message;
  errorMessage.classList.remove('d-none');
  toggleSpinner(false); // Ensure spinner is hidden
  if (retryCallback) {
    const existingBtn = errorMessage.querySelector('.retry-error-btn');
    if (existingBtn) existingBtn.removeEventListener('click', existingBtn._retryCallback);
    const retryBtn = errorMessage.querySelector('.retry-error-btn');
    retryBtn.addEventListener('click', () => {
      retryCallback();
      errorMessage.classList.add('d-none');
    });
    retryBtn._retryCallback = retryCallback;
  }
  setTimeout(() => {
    errorMessage.classList.add('d-none');
  }, 7000);
}

// Toggle loading spinner
function toggleSpinner(show) {
  const spinner = document.getElementById('loading-spinner');
  if (show) {
    spinner.classList.remove('d-none');
    if (spinnerTimeout) clearTimeout(spinnerTimeout);
    spinnerTimeout = setTimeout(() => {
      spinner.classList.add('d-none');
      console.log("Spinner timeout triggered");
    }, 5000);
  } else {
    spinner.classList.add('d-none');
    if (spinnerTimeout) clearTimeout(spinnerTimeout);
  }
}

// Handle authentication state
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Auth state: User logged in:", user.email);
    currentUser = { email: user.email, uid: user.uid };
    isAdmin = user.email === "admin@plantwatering.com";
    document.getElementById("login-container").classList.add("d-none");
    document.getElementById("dashboard").classList.remove("d-none");
    if (isAdmin) {
      console.log("Admin user, showing navbar and settings");
      document.querySelectorAll(".admin-nav").forEach(el => el.classList.remove("d-none"));
      document.getElementById("logs-nav").classList.remove("d-none");
      document.getElementById("plant-name-settings").classList.remove("d-none");
      document.querySelector(".admin-only").classList.remove("d-none");
      document.querySelector(".nav-link[data-group='1']").classList.add("active");
      currentGroup = 1;
    } else {
      const username = user.email.split('@')[0];
      currentGroup = parseInt(username.replace("user", ""));
      document.querySelectorAll(".admin-nav").forEach(el => el.classList.add("d-none"));
      document.getElementById("logs-nav").classList.add("d-none");
      document.getElementById("plant-name-settings").classList.add("d-none");
      document.querySelector(".admin-only").classList.add("d-none");
      console.log("Initializing dashboard for user, group:", currentGroup);
    }
    showFeedback("Fetching data...", "info");
    initCharts();
    loadPlantNames();
    fetchSensorData();
    clearInterval(pollIntervalId);
    pollIntervalId = setInterval(fetchSensorData, refreshInterval);
    console.log("Polling interval set:", refreshInterval);
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
      bootstrap.Tooltip.getOrCreateInstance(el);
    });
  } else {
    console.log("Auth state: No user logged in");
    currentUser = null;
    isAdmin = false;
    document.getElementById("dashboard").classList.add("d-none");
    document.getElementById("login-container").classList.remove("d-none");
    if (soilMoistureChart) soilMoistureChart.destroy();
    if (temperatureChart) temperatureChart.destroy();
    if (humidityChart) humidityChart.destroy();
    clearInterval(pollIntervalId);
  }
});

// Login with Firebase Authentication
document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  console.log("Login form submitted");
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const email = `${username}@plantwatering.com`;
  console.log("Attempting login:", email);
  signInWithEmailAndPassword(auth, email, password)
    .then(userCredential => {
      console.log("User authenticated:", userCredential.user.email);
    })
    .catch(err => {
      console.error("Login failed:", err);
      showFeedback("Invalid credentials", "danger");
      showErrorToast("Invalid username or password");
      showErrorMessage("Invalid username or password");
    });
});

// Logout
document.getElementById("logout-btn").addEventListener("click", () => {
  console.log("Logout clicked");
  signOut(auth).then(() => {
    showFeedback("Logged out successfully", "success");
  }).catch(err => {
    console.error("Logout failed:", err);
    showFeedback("Failed to log out", "danger");
    showErrorMessage("Failed to log out");
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
      document.getElementById("plant-name").textContent = plantNames[currentGroup] || `Group ${currentGroup} Dashboard`;
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

// Fetch sensor data with retry
async function fetchSensorData(attempt = 1, maxAttempts = 3) {
  if (!currentUser || (!isAdmin && currentUser.email !== `user${currentGroup}@plantwatering.com`)) {
    console.log("Access denied: User not authorized for group", currentGroup);
    showErrorMessage("Access denied: User not authorized for group " + currentGroup);
    isLoading = false; // Reset on access denial
    return;
  }
  if (isLoading) {
    console.log("Fetch skipped: Already loading");
    return;
  }
  isLoading = true;
  toggleSpinner(true);
  showFeedback("Loading sensor data...", "info");
  console.log(`Fetching sensor data for group ${currentGroup}, attempt ${attempt}/${maxAttempts}`);
  try {
    const res = await fetch(`${API_BASE}/devices/group${currentGroup}/sensors`, {
      headers: { "Authorization": `Bearer ${API_TOKEN}` }
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP error! status: ${res.status}, message: ${errorText}`);
    }
    const data = await res.json();
    console.log("Sensor data received:", data);
    document.getElementById("soil-moisture").textContent = data.soil_moisture || 0;
    document.getElementById("temperature").textContent = data.temperature || 0;
    document.getElementById("humidity").textContent = data.humidity || 0;
    const pumpBtn = document.getElementById("pump-btn");
    const lightBtn = document.getElementById("light-btn");
    const isPumpActive = data.pump_state || false;
    const isLightActive = data.light_state || false;
    pumpBtn.classList.toggle("active", isPumpActive);
    pumpBtn.setAttribute("data-active", isPumpActive);
    pumpBtn.setAttribute("aria-label", `Toggle water pump, currently ${isPumpActive ? "ON" : "OFF"}`);
    document.getElementById("pump-status").textContent = isPumpActive ? "Pump: ON" : "Pump: OFF";
    lightBtn.classList.toggle("active", isLightActive);
    lightBtn.setAttribute("data-active", isLightActive);
    lightBtn.setAttribute("aria-label", `Toggle light, currently ${isLightActive ? "ON" : "OFF"}`);
    document.getElementById("light-status").textContent = isLightActive ? "Light: ON" : "Light: OFF";
    gsap.to(soilMoistureChart.data.datasets[0], {
      data: [Math.min(data.soil_moisture || 0, 100), 100 - Math.min(data.soil_moisture || 0, 100)],
      duration: 0.5,
      onUpdate: () => soilMoistureChart.update()
    });
    gsap.to(temperatureChart.data.datasets[0], {
      data: [Math.min(data.temperature || 0, 50), 50 - Math.min(data.temperature || 0, 50)],
      duration: 0.5,
      onUpdate: () => temperatureChart.update()
    });
    gsap.to(humidityChart.data.datasets[0], {
      data: [Math.min(data.humidity || 0, 100), 100 - Math.min(data.humidity || 0, 100)],
      duration: 0.5,
      onUpdate: () => humidityChart.update()
    });
    document.getElementById("last-updated").textContent = new Date().toLocaleString();
    showFeedback("Sensor data updated", "success");
    isLoading = false;
    toggleSpinner(false);
  } catch (err) {
    console.error(`Error fetching sensor data (attempt ${attempt}):`, err);
    let errorMessage = "Unable to connect to Arduino Cloud. Please check your network or API token.";
    if (err.message.includes("401")) {
      errorMessage = "Invalid Arduino Cloud API token. Please update the token in script.js.";
      showErrorToast(errorMessage, fetchSensorData);
    } else if (err.message.includes("404")) {
      errorMessage = `Device group ${currentGroup} not found. Check Arduino Cloud configuration.`;
      showErrorToast(errorMessage, fetchSensorData);
    } else if (err.message.includes("net::ERR_FAILED")) {
      errorMessage = "Network error connecting to Arduino Cloud. Check your connection or server status.";
      showErrorToast(errorMessage, fetchSensorData);
    }
    if (attempt < maxAttempts) {
      console.log(`Retrying fetchSensorData, attempt ${attempt + 1}`);
      setTimeout(() => fetchSensorData(attempt + 1, maxAttempts), 2000);
    } else {
      showFeedback("Failed to fetch sensor data", "danger", fetchSensorData);
      showErrorMessage(errorMessage, fetchSensorData);
      isLoading = false;
      toggleSpinner(false);
    }
  }
}

// Control pump with retry
async function controlPump(newState, attempt = 1, maxAttempts = 3) {
  if (!currentUser || (!isAdmin && currentUser.email !== `user${currentGroup}@plantwatering.com`)) {
    console.log("Access denied: User not authorized for group", currentGroup);
    showErrorMessage("Access denied: User not authorized for group " + currentGroup);
    isLoading = false; // Reset on access denial
    return;
  }
  if (isLoading) {
    console.log("Toggle skipped: Already loading");
    return;
  }
  isLoading = true;
  toggleSpinner(true);
  const pumpBtn = document.getElementById("pump-btn");
  console.log(`Pump button clicked, new state: ${newState}, attempt ${attempt}/${maxAttempts}`);
  showFeedback(`Turning pump ${newState ? "ON" : "OFF"}...`, "info");
  gsap.to(pumpBtn, { x: -2, duration: 0.05, repeat: 3, yoyo: true });
  try {
    const res = await fetch(`${API_BASE}/devices/group${currentGroup}/control`, {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ pump_state: newState })
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP error! status: ${res.status}, message: ${errorText}`);
    }
    await fetchSensorData();
    showFeedback(`Pump turned ${newState ? "ON" : "OFF"}`, "success");
    isLoading = false;
    toggleSpinner(false);
  } catch (err) {
    console.error(`Error controlling pump (attempt ${attempt}):`, err);
    let errorMessage = "Failed to control pump. Please try again.";
    if (err.message.includes("401")) {
      errorMessage = "Invalid Arduino Cloud API token. Please update the token in script.js.";
      showErrorToast(errorMessage, () => document.getElementById("pump-btn").click());
    } else if (err.message.includes("net::ERR_FAILED")) {
      errorMessage = "Network error controlling pump. Check your connection or server status.";
      showErrorToast(errorMessage, () => document.getElementById("pump-btn").click());
    }
    if (attempt < maxAttempts) {
      console.log(`Retrying controlPump, attempt ${attempt + 1}`);
      setTimeout(() => controlPump(newState, attempt + 1, maxAttempts), 2000);
    } else {
      showFeedback("Failed to control pump", "danger", () => document.getElementById("pump-btn").click());
      showErrorMessage(errorMessage, () => document.getElementById("pump-btn").click());
      isLoading = false;
      toggleSpinner(false);
    }
  }
}

// Control light with retry
async function controlLight(newState, attempt = 1, maxAttempts = 3) {
  if (!currentUser || (!isAdmin && currentUser.email !== `user${currentGroup}@plantwatering.com`)) {
    console.log("Access denied: User not authorized for group", currentGroup);
    showErrorMessage("Access denied: User not authorized for group " + currentGroup);
    isLoading = false; // Reset on access denial
    return;
  }
  if (isLoading) {
    console.log("Toggle skipped: Already loading");
    return;
  }
  isLoading = true;
  toggleSpinner(true);
  const lightBtn = document.getElementById("light-btn");
  console.log(`Light button clicked, new state: ${newState}, attempt ${attempt}/${maxAttempts}`);
  showFeedback('Turning light ${newState ? "ON" : "OFF"}...', "info");
  gsap.to(lightBtn, { x: -2, duration: 0.05, repeat: 3, yoyo: true });
  try {
    const res = await fetch(`${API_BASE}/devices/group${currentGroup}/control`, {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ light_state: newState })
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP error! status: ${res.status}, message: ${errorText}`);
    }
    await fetchSensorData();
    showFeedback(`Light turned ${newState ? "ON" : "OFF"}`, "success");
    isLoading = false;
    toggleSpinner(false);
  } catch (err) {
    console.error(`Error controlling light (attempt ${attempt}):`, err);
    let errorMessage = "Failed to control light. Please try again.";
    if (err.message.includes("401")) {
      errorMessage = "Invalid Arduino Cloud API token. Please update the token in script.js.";
      showErrorToast(errorMessage, () => document.getElementById("light-btn").click());
    } else if (err.message.includes("net::ERR_FAILED")) {
      errorMessage = "Network error controlling light. Check your connection or server status.";
      showErrorToast(errorMessage, () => document.getElementById("light-btn").click());
    }
    if (attempt < maxAttempts) {
      console.log(`Retrying controlLight, attempt ${attempt + 1}`);
      setTimeout(() => controlLight(newState, attempt + 1, maxAttempts), 2000);
    } else {
      showFeedback("Failed to control light", "danger", () => document.getElementById("light-btn").click());
      showErrorMessage(errorMessage, () => document.getElementById("light-btn").click());
      isLoading = false;
      toggleSpinner(false);
    }
  }
}

// Fetch logs (admin only)
async function fetchLogs(filter = '') {
  if (!isAdmin) {
    console.log("Access denied: Logs are admin-only");
    showFeedback("Access denied: Logs are admin-only", "danger");
    showErrorMessage("Access denied: Logs are admin-only");
    isLoading = false; // Reset on access denial
    return;
  }
  if (isLoading) {
    console.log("Fetch logs skipped: Already loading");
    return;
  }
  isLoading = true;
  toggleSpinner(true);
  showFeedback("Loading logs...", "info");
  console.log("Fetching logs for group:", currentGroup, "with filter:", filter);
  try {
    const res = await fetch(`${API_BASE}/devices/logs`, {
      headers: { "Authorization": `Bearer ${API_TOKEN}` }
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP error! status: ${res.status}, message: ${errorText}`);
    }
    const logs = await res.json();
    console.log("Logs received:", logs);
    const logList = document.getElementById("log-list");
    logList.innerHTML = "";
    const groupFilter = document.getElementById("log-group-filter")?.value || currentGroup.toString();
    const filteredLogs = logs.filter(log => {
      const matchesGroup = groupFilter === "all" || log.group.toString() === groupFilter;
      const matchesFilter = 
        log.action.toLowerCase().includes(filter.toLowerCase()) || 
        log.group.toString().includes(filter) ||
        (plantNames[log.group] && plantNames[log.group].toLowerCase().includes(filter.toLowerCase()));
      return matchesGroup && matchesFilter;
    });
    filteredLogs.forEach(log => {
      const li = document.createElement("li");
      const plantName = plantNames[log.group] || `Group ${log.group}`;
      li.textContent = `${log.timestamp}: ${log.user} ${log.action} (${plantName}, Soil: ${log.soil_moisture}%, Temp: ${log.temperature}°C, Hum: ${log.humidity}%)`;
      logList.appendChild(li);
    });
    showFeedback("Logs updated", "success");
    isLoading = false;
    toggleSpinner(false);
  } catch (err) {
    console.error("Error fetching logs:", err);
    let errorMessage = "Failed to fetch logs. Please try again.";
    if (err.message.includes("401")) {
      errorMessage = "Invalid Arduino Cloud API token. Please update the token in script.js.";
      showErrorToast(errorMessage, () => fetchLogs(filter));
    } else if (err.message.includes("net::ERR_FAILED")) {
      errorMessage = "Network error fetching logs. Check your connection or server status.";
      showErrorToast(errorMessage, () => fetchLogs(filter));
    }
    showFeedback("Failed to fetch logs", "danger", () => fetchLogs(filter));
    showErrorMessage(errorMessage, () => fetchLogs(filter));
    isLoading = false;
    toggleSpinner(false);
  }
}

// Log filters
document.getElementById("log-filter").addEventListener("input", (e) => {
  fetchLogs(e.target.value);
});

document.getElementById("log-group-filter")?.addEventListener("change", (e) => {
  fetchLogs(document.getElementById("log-filter").value);
});

// Dark mode toggle
document.getElementById("dark-mode-toggle").addEventListener("change", (e) => {
  document.body.classList.toggle("dark-mode", e.target.checked);
  localStorage.setItem("darkMode", e.target.checked);
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
    savePlantNames().then(() => {
      const modal = bootstrap.Modal.getInstance(document.getElementById("settingsModal"));
      if (modal) {
        modal.hide(); // Ensure modal hides properly
        document.activeElement.blur(); // Remove focus from any active element
      }
    }).catch(() => {});
  } else {
    showFeedback("Settings saved", "success");
    const modal = bootstrap.Modal.getInstance(document.getElementById("settingsModal"));
    if (modal) {
      modal.hide(); // Ensure modal hides properly
      document.activeElement.blur(); // Remove focus from any active element
    }
  }
});

// Manual refresh
document.getElementById("refresh-btn").addEventListener("click", () => {
  console.log("Refresh button clicked");
  fetchSensorData();
});

// Control pump
document.getElementById("pump-btn").addEventListener("click", () => {
  const pumpBtn = document.getElementById("pump-btn");
  const newState = pumpBtn.getAttribute("data-active") !== "true";
  controlPump(newState);
});

// Control light
document.getElementById("light-btn").addEventListener("click", () => {
  const lightBtn = document.getElementById("light-btn");
  const newState = lightBtn.getAttribute("data-active") !== "true";
  controlLight(newState);
});

// Initialize settings
document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("darkMode") === "true") {
    document.getElementById("dark-mode-toggle").checked = true;
    document.body.classList.add("dark-mode");
  }
  document.getElementById("refresh-interval").value = refreshInterval;

  // Add event listener for modal close to clear focus
  const settingsModal = document.getElementById("settingsModal");
  settingsModal.addEventListener("hidden.bs.modal", () => {
    console.log("Modal hidden, clearing focus");
    document.activeElement.blur(); // Remove focus from any element
  });
});