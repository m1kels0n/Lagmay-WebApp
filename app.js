// app.js
const CLIENT_ID = 'ZkYJs3v6DgkDkNU1U9XPdeA9FobufYY1';
const CLIENT_SECRET = 'ZAXEVQABucItefupW8Yi7FsKvTXm5tw2XSKxTjTng06S3NHsE12i92JzNHUnfDi9';
const THING_ID = 'a0d5db2f-b511-4253-9213-43fb13939649'; // Find in Arduino IoT Cloud Thing URL

// Elements
const temperatureEl = document.getElementById('temperature');
const humidityEl = document.getElementById('humidity');
const soilMoistureEl = document.getElementById('soilMoisture');
const plantNameEl = document.getElementById('plantName');
const lightToggle = document.getElementById('lightToggle');
const pumpToggle = document.getElementById('pumpToggle');

// Get token
async function getToken() {
  const response = await fetch('https://api2.arduino.cc/iot/v1/clients/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&audience=https://api2.arduino.cc/iot`
  });
  
  const data = await response.json();
  return data.access_token;
}

// Get properties
async function getProperties(token) {
  const response = await fetch(`https://api2.arduino.cc/iot/v2/things/${THING_ID}/properties`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
}

// Update property
async function updateProperty(token, propertyId, value) {
  await fetch(`https://api2.arduino.cc/iot/v2/things/${THING_ID}/properties/${propertyId}/publish`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ value })
  });
}

// Initialize app
async function init() {
  try {
    const token = await getToken();
    const properties = await getProperties(token);
    
    // Map property IDs
    const propMap = {};
    properties.forEach(prop => {
      propMap[prop.name] = {
        id: prop.id,
        value: prop.last_value
      };
    });
    
    // Update UI with current values
    temperatureEl.textContent = `${propMap.temp.value.toFixed(1)}°C`;
    humidityEl.textContent = `${propMap.humid.value.toFixed(1)}%`;
    soilMoistureEl.textContent = `${propMap.soil_moisture.value.toFixed(1)}%`;
    plantNameEl.textContent = propMap.plantName.value || 'My Plant';
    
    // Set toggle states
    lightToggle.checked = propMap.light.value;
    pumpToggle.checked = propMap.pump.value;
    
    // Add event listeners
    lightToggle.addEventListener('change', async () => {
      await updateProperty(token, propMap.light.id, lightToggle.checked);
    });
    
    pumpToggle.addEventListener('change', async () => {
      await updateProperty(token, propMap.pump.id, pumpToggle.checked);
    });
    
    // Poll for updates every 5 seconds
    setInterval(async () => {
      const newProps = await getProperties(token);
      newProps.forEach(prop => {
        if (prop.name === 'temp') {
          temperatureEl.textContent = `${prop.last_value.toFixed(1)}°C`;
        } else if (prop.name === 'humid') {
          humidityEl.textContent = `${prop.last_value.toFixed(1)}%`;
        } else if (prop.name === 'soil_moisture') {
          soilMoistureEl.textContent = `${prop.last_value.toFixed(1)}%`;
        }
      });
    }, 5000);
    
  } catch (error) {
    console.error('Error:', error);
    alert('Failed to connect to Arduino IoT Cloud');
  }
}

// Start the app when page loads
document.addEventListener('DOMContentLoaded', init);