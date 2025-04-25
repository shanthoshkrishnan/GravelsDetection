const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const toggleCameraButton = document.getElementById('toggleCamera');
const uploadButton = document.getElementById('submitUpload');
const uploadInput = document.getElementById('upload');
const uploadedImage = document.getElementById('uploadedImage');
const uploadCanvas = document.getElementById('uploadCanvas');
const uploadCtx = uploadCanvas.getContext('2d');

const switchCameraButton = document.getElementById('switchCamera');
switchCameraButton.style.display = 'none'; // Hide initially until we check for camera support

// Flag to track if camera is on and current camera settings
let isCameraOn = false;
let stream = null;
let captureInterval = null;
let currentFacingMode = 'user'; // Default to front camera ('user' = front, 'environment' = back)
let availableCameras = [];
let currentCameraIndex = 0;

// Check for available cameras
async function getAvailableCameras() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    console.log("enumerateDevices() not supported.");
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(device => device.kind === 'videoinput');
    console.log('Available cameras:', cameras);
    return cameras;
  } catch (err) {
    console.error('Error enumerating devices:', err);
    return [];
  }
}

// Initialize camera options when page loads
window.addEventListener('DOMContentLoaded', async () => {
  availableCameras = await getAvailableCameras();
  // Only show switch button if we have more than one camera
  if (availableCameras.length > 1) {
    switchCameraButton.style.display = 'inline-block';
  }
});

// Start or stop camera
toggleCameraButton.addEventListener('click', async () => {
  if (isCameraOn) {
    stopCamera();
  } else {
    startCamera();
  }
});

// Switch camera
switchCameraButton.addEventListener('click', async () => {
  if (!isCameraOn) return;
  
  // For mobile: switch between front and back
  if (/Mobi|Android/i.test(navigator.userAgent)) {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    await startCamera(); // Restart camera with new facing mode
  } 
  // For desktop: switch between available cameras
  else {
    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    await startCamera(); // Restart camera with new device ID
  }
});

// Start webcam
async function startCamera() {
  try {
    // Stop any existing camera stream first
    if (stream) {
      stopCamera();
    }
    
    // Configure camera constraints based on device
    let constraints = { video: {} };
    
    // For mobile: use facingMode constraint
    if (/Mobi|Android/i.test(navigator.userAgent)) {
      constraints.video = { facingMode: currentFacingMode };
      console.log(`Using ${currentFacingMode === 'user' ? 'front' : 'back'} camera`);
    } 
    // For desktop: use deviceId if available
    else if (availableCameras.length > 0) {
      constraints.video = { deviceId: { exact: availableCameras[currentCameraIndex].deviceId } };
      console.log(`Using camera: ${availableCameras[currentCameraIndex].label || 'Camera ' + (currentCameraIndex + 1)}`);
    }
    
    // Try to access the camera
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    video.style.display = 'block'; // Show video element
    canvas.style.display = 'none'; // Hide canvas initially
    toggleCameraButton.textContent = "Stop Camera";
    switchCameraButton.style.display = availableCameras.length > 1 ? 'inline-block' : 'none'; // Show switch button when camera is on and multiple cameras available
    isCameraOn = true;

    // Clear any previous intervals
    if (captureInterval) {
      clearInterval(captureInterval);
    }

    // Capture frames and send them to Flask backend using Inference SDK
    captureInterval = setInterval(() => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(sendToBackend, 'image/jpeg', 0.8); // Slightly better quality (0.8)
      }
    }, 1000); // Capture every second for better performance
  } catch (error) {
    console.error('Error accessing camera: ', error);
    alert('Failed to access the camera. Please check your permissions or try another camera.');
  }
}

// Stop webcam
function stopCamera() {
  if (stream) {
    let tracks = stream.getTracks();
    tracks.forEach(track => track.stop());
    stream = null;
  }
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  video.style.display = 'none'; // Hide video element
  canvas.style.display = 'none'; // Hide canvas
  toggleCameraButton.textContent = "Start Camera";
  switchCameraButton.style.display = 'none'; // Hide switch button when camera is off
  isCameraOn = false;
  
  // Remove any displayed results
  const oldResults = document.querySelector('.prediction-results');
  if (oldResults) {
    oldResults.remove();
  }
}

// Upload and send image to Flask backend
uploadButton.addEventListener('click', () => {
  const file = uploadInput.files[0];
  if (file) {
    // Show loading indicator
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'prediction-results';
    resultsDiv.innerHTML = '<p>Processing image...</p>';
    
    // Remove any previous results
    const oldResults = document.querySelector('.prediction-results');
    if (oldResults) {
      oldResults.remove();
    }
    
    document.getElementById('cameraContainer').appendChild(resultsDiv);
    
    const formData = new FormData();
    formData.append('image', file);

    fetch('/detect', {
      method: 'POST',
      body: formData,
    })
    .then(response => response.json())
    .then(data => {
      // Remove the loading message
      resultsDiv.remove();
      
      if (data.predictions && data.predictions.length > 0) {
        // Show the uploaded image with bounding boxes
        showImageWithBoundingBoxes(file, data.predictions);
      } else {
        // Show "no gravels detected" message
        const noGravelsDiv = document.createElement('div');
        noGravelsDiv.className = 'prediction-results';
        noGravelsDiv.innerHTML = '<p>No gravels detected in this image.</p>';
        document.getElementById('cameraContainer').appendChild(noGravelsDiv);
      }
    })
    .catch(error => {
      console.error('Error:', error);
      // Show error message
      const errorDiv = document.createElement('div');
      errorDiv.className = 'prediction-results';
      errorDiv.innerHTML = '<p>Error processing image. Please try again.</p>';
      document.getElementById('cameraContainer').appendChild(errorDiv);
    });
  } else {
    alert('Please select an image file first');
  }
});

// Function to display the uploaded image with bounding boxes
function showImageWithBoundingBoxes(file, predictions) {
  // Create a URL for the uploaded image
  const imageUrl = URL.createObjectURL(file);
  
  // First load the image to get its dimensions
  const img = new Image();
  img.src = imageUrl;
  
  img.onload = () => {
    // Set canvas dimensions to match the image
    uploadCanvas.width = img.naturalWidth;
    uploadCanvas.height = img.naturalHeight;
    uploadCanvas.style.display = 'block';
    
    // Draw the image onto the canvas
    uploadCtx.drawImage(img, 0, 0);
    
    // Draw bounding boxes - updated to handle different response formats
    predictions.forEach(pred => {
      // Extract bounding box coordinates based on response format
      let x, y, width, height;
      
      // Handle different prediction formats
      if (pred.bbox) {
        // Format: [x, y, width, height]
        [x, y, width, height] = pred.bbox;
      } else if (pred.x !== undefined && pred.width !== undefined) {
        // Format: {x, y, width, height} with x,y at center
        x = pred.x - (pred.width / 2);
        y = pred.y - (pred.height / 2);
        width = pred.width;
        height = pred.height;
      } else {
        console.error('Unknown prediction format:', pred);
        return;
      }
      
      uploadCtx.strokeStyle = 'lime';
      uploadCtx.lineWidth = 2;
      uploadCtx.strokeRect(x, y, width, height);
      
      // Add label with confidence score
      const label = pred.label || pred.class || 'Object';
      const confidence = pred.confidence || pred.score || 0;
      
      uploadCtx.fillStyle = 'lime';
      uploadCtx.font = '16px sans-serif';
      uploadCtx.fillText(`${label} (${(confidence * 100).toFixed(1)}%)`, 
        x, y > 20 ? y - 5 : y + 20);
    });
    
    // Also display text results
    displayPredictionResults(predictions);
    
    // Free memory
    URL.revokeObjectURL(imageUrl);
  };
}

// Send captured frame to Flask backend for predictions
function sendToBackend(blob) {
  // Only send data if camera is on
  if (!isCameraOn) {
    return;
  }
  
  const formData = new FormData();
  formData.append('image', blob, 'frame.jpg');

  fetch('/detect', {
    method: 'POST',
    body: formData,
  })
  .then(response => response.json())
  .then(data => {
    if (data.predictions && data.predictions.length > 0) {
      console.log(data.predictions);
      drawPredictions(data.predictions);
    } else {
      // If no predictions, just show the video
      canvas.style.display = 'none';
      video.style.display = 'block';
      
      // If there were previous results displayed, remove them
      const oldResults = document.querySelector('.prediction-results');
      if (oldResults) {
        oldResults.remove();
      }
    }
  })
  .catch(error => console.error('Error:', error));
}

// Draw predictions on camera canvas
function drawPredictions(predictions) {
  // Clear previous canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);  
  // Redraw video frame
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);  
  
  predictions.forEach(pred => {
    // Extract bounding box coordinates based on response format
    let x, y, width, height;
    
    // Handle different prediction formats
    if (pred.bbox) {
      // Format: [x, y, width, height]
      [x, y, width, height] = pred.bbox;
    } else if (pred.x !== undefined && pred.width !== undefined) {
      // Format: {x, y, width, height} with x,y at center
      x = pred.x - (pred.width / 2);
      y = pred.y - (pred.height / 2);
      width = pred.width;
      height = pred.height;
    } else {
      console.error('Unknown prediction format:', pred);
      return;
    }
    
    // Get label and confidence
    const label = pred.label || pred.class || 'Object';
    const confidence = pred.confidence || pred.score || 0;
    
    ctx.strokeStyle = 'lime';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = 'lime';
    ctx.font = '16px sans-serif';
    ctx.fillText(`${label} (${(confidence * 100).toFixed(1)}%)`, 
      x, y > 20 ? y - 5 : y + 20);
  });
  
  // Hide video and show canvas with predictions
  video.style.display = 'none';
  canvas.style.display = 'block';
  
  // Display text results
  displayPredictionResults(predictions);
}

// Display just the prediction results as text
function displayPredictionResults(predictions) {
  const resultsDiv = document.createElement('div');
  resultsDiv.className = 'prediction-results';
  resultsDiv.innerHTML = '<h3>Detection Results:</h3>';
  
  const resultsList = document.createElement('ul');
  predictions.forEach(pred => {
    // Get label and confidence
    const label = pred.label || pred.class || 'Object';
    const confidence = pred.confidence || pred.score || 0;
    
    const listItem = document.createElement('li');
    listItem.textContent = `${label}: ${(confidence * 100).toFixed(1)}% confidence`;
    resultsList.appendChild(listItem);
  });
  
  resultsDiv.appendChild(resultsList);
  
  // Remove any previous results
  const oldResults = document.querySelector('.prediction-results');
  if (oldResults) {
    oldResults.remove();
  }
  
  // Add the results to the container
  document.getElementById('cameraContainer').appendChild(resultsDiv);
}

// Add this function at the end of your JavaScript file

// Function to clear results from server
function clearResults() {
  fetch('/clear_results')
    .then(response => response.json())
    .then(data => {
      alert(data.message);
    })
    .catch(error => {
      console.error('Error:', error);
      alert('Error clearing results');
    });
}

// Add a small functions to show download buttons after detections
function addDownloadOptions() {
  // Check if download section already exists
  const existingDownloadSection = document.querySelector('.download-options');
  if (existingDownloadSection) {
    return; // Don't create duplicates
  }
  
  // Create download options container
  const downloadDiv = document.createElement('div');
  downloadDiv.className = 'download-options';
  
  // Create download buttons
  const csvButton = document.createElement('button');
  csvButton.textContent = 'Download Results (CSV)';
  csvButton.onclick = () => window.location.href = '/download_csv';
  
  const jsonButton = document.createElement('button');
  jsonButton.textContent = 'Download Results (JSON)';
  jsonButton.onclick = () => window.location.href = '/download_json';
  
  const clearButton = document.createElement('button');
  clearButton.textContent = 'Clear Results';
  clearButton.onclick = clearResults;
  
  // Add buttons to container
  downloadDiv.appendChild(csvButton);
  downloadDiv.appendChild(jsonButton);
  downloadDiv.appendChild(clearButton);
  
  // Add the container to the page
  document.getElementById('cameraContainer').appendChild(downloadDiv);
}

// Modify the displayPredictionResults function to add download options
const originalDisplayPredictionResults = displayPredictionResults;
displayPredictionResults = function(predictions) {
  // Call the original function
  originalDisplayPredictionResults(predictions);
  
  // Add download options after showing results
  if (predictions && predictions.length > 0) {
    addDownloadOptions();
  }
};