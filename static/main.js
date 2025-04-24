const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const toggleCameraButton = document.getElementById('toggleCamera');
const uploadButton = document.getElementById('submitUpload');
const uploadInput = document.getElementById('upload');
const uploadedImage = document.getElementById('uploadedImage');
const uploadCanvas = document.getElementById('uploadCanvas');
const uploadCtx = uploadCanvas.getContext('2d');

// Flag to track if camera is on
let isCameraOn = false;
let stream = null;
let captureInterval = null;

// Start or stop camera
toggleCameraButton.addEventListener('click', async () => {
  if (isCameraOn) {
    stopCamera();
  } else {
    startCamera();
  }
});

// Start webcam
async function startCamera() {
  try {
    // Stop any existing camera stream first
    if (stream) {
      stopCamera();
    }
    
    // Try to access the camera
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.style.display = 'block'; // Show video element
    canvas.style.display = 'none'; // Hide canvas initially
    toggleCameraButton.textContent = "Stop Camera";
    isCameraOn = true;

    // Clear any previous intervals
    if (captureInterval) {
      clearInterval(captureInterval);
    }

    // Capture frames and send them to Flask backend
    captureInterval = setInterval(() => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(sendToBackend, 'image/jpeg');
    }, 1500);
  } catch (error) {
    console.error('Error accessing camera: ', error);
    alert('Failed to access the camera. Please check your permissions.');
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
  isCameraOn = false;
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
    
    // Draw bounding boxes
    predictions.forEach(pred => {
      const [x, y, width, height] = pred.bbox;
      uploadCtx.strokeStyle = 'lime';
      uploadCtx.lineWidth = 2;
      uploadCtx.strokeRect(x, y, width, height);
      
      // Add label with confidence score
      uploadCtx.fillStyle = 'lime';
      uploadCtx.font = '16px sans-serif';
      uploadCtx.fillText(`${pred.label} (${(pred.confidence * 100).toFixed(1)}%)`, 
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
    const [x, y, width, height] = pred.bbox;
    ctx.strokeStyle = 'lime';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = 'lime';
    ctx.font = '16px sans-serif';
    ctx.fillText(`${pred.label} (${(pred.confidence * 100).toFixed(1)}%)`, 
      x, y > 20 ? y - 5 : y + 20);
  });
  
  // Hide video and show canvas with predictions
  video.style.display = 'none';
  canvas.style.display = 'block';
}

// Display just the prediction results as text
function displayPredictionResults(predictions) {
  const resultsDiv = document.createElement('div');
  resultsDiv.className = 'prediction-results';
  resultsDiv.innerHTML = '<h3>Detection Results:</h3>';
  
  const resultsList = document.createElement('ul');
  predictions.forEach(pred => {
    const listItem = document.createElement('li');
    listItem.textContent = `${pred.label}: ${(pred.confidence * 100).toFixed(1)}% confidence`;
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