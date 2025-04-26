document.addEventListener('DOMContentLoaded', function() {
  // Camera elements
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

  console.log("DOM loaded, initializing camera controls");
  console.log("Toggle camera button:", toggleCameraButton);
  console.log("Switch camera button:", switchCameraButton);

  // Flag to track if camera is on and current camera settings
  let isCameraOn = false;
  let stream = null;
  let captureInterval = null;
  let currentFacingMode = 'user'; // Default to front camera ('user' = front, 'environment' = back)
  let availableCameras = [];
  let currentCameraIndex = 0;

  // Initially disable the switch camera button
  if (switchCameraButton) {
    switchCameraButton.disabled = true;
    console.log("Switch camera button disabled initially");
  } else {
    console.error("Switch camera button not found in DOM!");
  }

  // Check for available cameras
  async function getAvailableCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.log("enumerateDevices() not supported.");
      return [];
    }

    try {
      // Need to request camera permission first
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (e) {
        console.warn("Could not get initial camera permission:", e);
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      
      console.log('Available cameras:', cameras);
      
      // Stop the temporary stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      return cameras;
    } catch (err) {
      console.error('Error enumerating devices:', err);
      return [];
    }
  }

  // Initialize camera options when page loads
  window.addEventListener('DOMContentLoaded', async () => {
    availableCameras = await getAvailableCameras();
    console.log(`Found ${availableCameras.length} cameras`);
    
    // Update switch button status based on available cameras
    if (switchCameraButton) {
      if (availableCameras.length > 1) {
        switchCameraButton.disabled = !isCameraOn;
        console.log("Multiple cameras found, button will be enabled when camera starts");
      } else {
        switchCameraButton.disabled = true;
        console.log("Only one camera found, button remains disabled");
      }
    }
  });

  // Start or stop camera
  if (toggleCameraButton) {
    toggleCameraButton.addEventListener('click', async () => {
      console.log("Toggle camera clicked, current state:", isCameraOn);
      if (isCameraOn) {
        stopCamera();
      } else {
        startCamera();
      }
    });
  }

  // Switch camera
  if (switchCameraButton) {
    switchCameraButton.addEventListener('click', async () => {
      console.log("Switch camera clicked");
      if (!isCameraOn) {
        console.log("Camera is not on, can't switch");
        return;
      }
      
      // For mobile: switch between front and back
      if (/Mobi|Android/i.test(navigator.userAgent)) {
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        console.log(`Switching to ${currentFacingMode === 'user' ? 'front' : 'back'} camera`);
        await startCamera(); // Restart camera with new facing mode
      } 
      // For desktop: switch between available cameras
      else if (availableCameras.length > 1) {
        currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
        console.log(`Switching to camera index ${currentCameraIndex}`);
        await startCamera(); // Restart camera with new device ID
      } else {
        console.log("No additional cameras available to switch to");
      }
    });
  }

  // Start webcam
  async function startCamera() {
    console.log("Starting camera...");
    try {
      // Stop any existing camera stream first
      if (stream) {
        stopCamera();
      }
      
      // Configure camera constraints based on device
      let constraints = { video: {} };
      
      // For mobile: use facingMode constraint with lower resolution
      if (/Mobi|Android/i.test(navigator.userAgent)) {
        // Lower resolution on mobile to improve performance
        constraints.video = { 
          facingMode: currentFacingMode,
          width: { ideal: 720 },  // Reduced from 1280
          height: { ideal: 480 }  // Reduced from 720
        };
        console.log(`Using ${currentFacingMode === 'user' ? 'front' : 'back'} camera with reduced dimensions`);
      } 
      // For desktop: use deviceId if available
      else if (availableCameras.length > 0) {
        constraints.video = { deviceId: { exact: availableCameras[currentCameraIndex].deviceId } };
        console.log(`Using camera: ${availableCameras[currentCameraIndex].label || 'Camera ' + (currentCameraIndex + 1)}`);
      }
      
      // Try to access the camera
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      
      // Wait for video metadata to load to get correct dimensions
      video.onloadedmetadata = function() {
        console.log(`Video dimensions: ${video.videoWidth}x${video.videoHeight}`);
        // Set initial canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      };
      
      video.style.display = 'block'; // Show video element
      canvas.style.display = 'none'; // Hide canvas initially
      toggleCameraButton.textContent = "Stop Camera";
      
      // Enable switch camera button if multiple cameras are available
      if (switchCameraButton) {
        switchCameraButton.disabled = availableCameras.length <= 1;
        console.log("Switch camera button " + (availableCameras.length > 1 ? "enabled" : "remains disabled"));
      }
      
      isCameraOn = true;

      // Clear any previous intervals
      if (captureInterval) {
        clearInterval(captureInterval);
      }

      // Capture frames and send them to backend
      captureInterval = setInterval(() => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          // Ensure canvas dimensions match video dimensions (important for mobile)
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            console.log(`Updated canvas dimensions: ${canvas.width}x${canvas.height}`);
          }
          
          // Draw the current video frame to the canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Create blob from canvas and send to backend with reduced quality for mobile
          const isMobile = /Mobi|Android/i.test(navigator.userAgent);
          const quality = isMobile ? 0.7 : 0.8; // Lower quality for mobile
          
          canvas.toBlob((blob) => {
            if (blob && blob.size > 0) {
              console.log(`Created image blob of size: ${blob.size} bytes`);
              sendToBackend(blob);
            } else {
              console.error("Failed to create valid blob from canvas");
            }
          }, 'image/jpeg', quality);
        } else {
          console.log("Video not ready for capture");
        }
      }, 1000); // Capture every second
      
      console.log("Camera started successfully");
    } catch (error) {
      console.error('Error accessing camera: ', error);
      alert('Failed to access the camera. Please check your permissions or try another camera.');
    }
  }

  // Stop webcam
  function stopCamera() {
    console.log("Stopping camera...");
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
    if (toggleCameraButton) {
      toggleCameraButton.textContent = "Start Camera";
    }
    if (switchCameraButton) {
      switchCameraButton.disabled = true; // Disable switch button when camera is off
    }
    isCameraOn = false;
    
    // Remove any displayed results
    const oldResults = document.querySelector('.prediction-results');
    if (oldResults) {
      oldResults.remove();
    }
    console.log("Camera stopped");
  }

  // Upload and send image to Flask backend
  if (uploadButton) {
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
        
        // Check if we need to resize the image before uploading (for mobile)
        const isMobile = /Mobi|Android/i.test(navigator.userAgent);
        
        if (isMobile && file.size > 1000000) { // If over 1MB on mobile
          console.log("Large file detected, resizing before upload");
          // Create a FileReader to read the file
          const reader = new FileReader();
          reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
              // Create a canvas to resize the image
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              // Calculate new dimensions (max 800px in any dimension)
              const maxDim = 800;
              if (width > height) {
                if (width > maxDim) {
                  height = Math.round(height * maxDim / width);
                  width = maxDim;
                }
              } else {
                if (height > maxDim) {
                  width = Math.round(width * maxDim / height);
                  height = maxDim;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              
              // Draw resized image
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              
              // Convert to blob and upload
              canvas.toBlob((blob) => {
                console.log(`Resized image from ${file.size} to ${blob.size} bytes`);
                uploadImage(blob);
              }, 'image/jpeg', 0.75);
            };
            img.src = e.target.result;
          };
          reader.readAsDataURL(file);
        } else {
          // Upload original file if not on mobile or file is small enough
          uploadImage(file);
        }
      } else {
        alert('Please select an image file first');
      }
    });
  }
  
  // Function to upload image and process response
  function uploadImage(imageBlob) {
    const formData = new FormData();
    formData.append('image', imageBlob);
    
    fetch('/detect', {
      method: 'POST',
      body: formData,
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Server error: ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      // Remove the loading message
      const loadingDiv = document.querySelector('.prediction-results');
      if (loadingDiv) {
        loadingDiv.remove();
      }
      
      if (data.predictions && data.predictions.length > 0) {
        // Show the uploaded image with bounding boxes
        showImageWithBoundingBoxes(imageBlob, data.predictions);
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
  }

  // Function to display the uploaded image with bounding boxes
  function showImageWithBoundingBoxes(file, predictions) {
    // Create a URL for the uploaded image
    const imageUrl = URL.createObjectURL(file);
    
    // First load the image to get its dimensions
    const img = new Image();
    img.src = imageUrl;
    
    img.onload = () => {
      console.log(`Uploaded image dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
      
      // Set canvas dimensions to match the image
      uploadCanvas.width = img.naturalWidth;
      uploadCanvas.height = img.naturalHeight;
      uploadCanvas.style.display = 'block';
      
      // Draw the image onto the canvas
      uploadCtx.drawImage(img, 0, 0);
      
      console.log("Raw predictions for uploaded image:", JSON.stringify(predictions));
      
      // Draw bounding boxes - updated to handle different response formats
      predictions.forEach(pred => {
        console.log("Processing prediction:", pred);
        
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
        
        console.log(`Drawing box at: ${x},${y} with size ${width}x${height}`);
        
        uploadCtx.strokeStyle = '#00FF00'; // Bright lime green
        uploadCtx.lineWidth = Math.max(2, uploadCanvas.width / 200); // Thicker lines on higher resolution
        uploadCtx.strokeRect(x, y, width, height);
        
        // Add label with confidence score
        const label = pred.label || pred.class || 'Object';
        const confidence = pred.confidence || pred.score || 0;
        
        uploadCtx.fillStyle = '#00FF00'; // Bright lime green
        const fontSize = Math.max(16, uploadCanvas.width / 40); // Responsive font size
        uploadCtx.font = `${fontSize}px sans-serif`;
        uploadCtx.fillText(`${label} (${(confidence * 100).toFixed(1)}%)`, 
          x, y > fontSize ? y - 5 : y + fontSize + 5);
      });
      
      // Also display text results
      displayPredictionResults(predictions);
      
      // Free memory
      URL.revokeObjectURL(imageUrl);
    };
  }

  // Send captured frame to Flask backend for predictions with image optimization
  function sendToBackend(blob) {
    // Only send data if camera is on
    if (!isCameraOn) {
      return;
    }
    
    console.log("Sending image to backend for detection");
    
    // Check if we need to resize for mobile
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    
    if (isMobile && blob.size > 500000) { // If larger than 500KB on mobile
      console.log("Large image on mobile, resizing before sending");
      
      // Create an image from blob
      const img = new Image();
      const url = URL.createObjectURL(blob);
      
      img.onload = function() {
        // Create a canvas for resizing
        const resizeCanvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Calculate new dimensions (max 640px in any dimension for mobile)
        const maxDim = 640;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round(height * maxDim / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round(width * maxDim / height);
            height = maxDim;
          }
        }
        
        resizeCanvas.width = width;
        resizeCanvas.height = height;
        
        // Draw resized image
        const resizeCtx = resizeCanvas.getContext('2d');
        resizeCtx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob with lower quality
        resizeCanvas.toBlob((resizedBlob) => {
          console.log(`Resized from ${blob.size} to ${resizedBlob.size} bytes`);
          
          const formData = new FormData();
          formData.append('image', resizedBlob, 'frame.jpg');
          
          sendFormData(formData);
          
          // Clean up
          URL.revokeObjectURL(url);
        }, 'image/jpeg', 0.7); // 70% quality for mobile
      };
      
      img.src = url;
    } else {
      // Send original if not mobile or small enough
      const formData = new FormData();
      formData.append('image', blob, 'frame.jpg');
      sendFormData(formData);
    }
  }
  
  // Function to handle sending form data and processing response
  function sendFormData(formData) {
    fetch('/detect', {
      method: 'POST',
      body: formData,
    })
    .then(response => {
      console.log("Response received from server:", response.status);
      if (!response.ok) {
        throw new Error('Server error: ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      console.log("Full response data:", JSON.stringify(data));
      
      if (data.predictions && data.predictions.length > 0) {
        console.log("Predictions received:", data.predictions.length);
        console.log("Raw prediction data:", JSON.stringify(data.predictions));
        drawPredictions(data.predictions);
      } else {
        console.log("No predictions found in response");
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
    .catch(error => {
      console.error('Error sending to backend:', error);
      
      // Show error notification
      const errorDiv = document.createElement('div');
      errorDiv.className = 'prediction-results error';
      errorDiv.innerHTML = '<p>Error connecting to server. Please try again.</p>';
      
      // Remove any previous results
      const oldResults = document.querySelector('.prediction-results');
      if (oldResults) {
        oldResults.remove();
      }
      
      document.getElementById('cameraContainer').appendChild(errorDiv);
      
      // Switch back to video display
      canvas.style.display = 'none';
      video.style.display = 'block';
    });
  }

  // Draw predictions on camera canvas - UPDATED for better mobile visibility
  function drawPredictions(predictions) {
    // Clear previous canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);  
    // Redraw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Get actual canvas display dimensions (important for mobile scaling)
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    const scaleX = canvas.width / displayWidth;
    const scaleY = canvas.height / displayHeight;
    
    console.log(`Canvas dimensions: ${canvas.width}x${canvas.height}, Display: ${displayWidth}x${displayHeight}`);
    
    predictions.forEach(pred => {
      console.log("Drawing prediction:", pred);
      let x, y, width, height;
      
      // Handle different prediction formats
      if (pred.bbox) {
        [x, y, width, height] = pred.bbox;
      } else if (pred.x !== undefined && pred.width !== undefined) {
        // Get coordinates properly scaled to the canvas size
        x = (pred.x - (pred.width / 2));
        y = (pred.y - (pred.height / 2));
        width = pred.width;
        height = pred.height;
        
        console.log(`Drawing box at: ${x},${y} with size ${width}x${height}`);
      } else {
        console.error('Unknown prediction format:', pred);
        return;
      }
      
      // Draw with more visible colors on mobile
      ctx.strokeStyle = '#00FF00'; // Bright green
      ctx.lineWidth = Math.max(3, canvas.width / 150); // Thicker lines for better visibility
      ctx.strokeRect(x, y, width, height);
      
      // Label with better visibility
      const label = pred.label || pred.class || 'Object';
      const confidence = pred.confidence || pred.score || 0;
      
      // Add background to text for better visibility
      const fontSize = Math.max(16, canvas.width / 40); // Responsive font size
      ctx.font = `${fontSize}px sans-serif`;
      const labelText = `${label} ${(confidence * 100).toFixed(1)}%`;
      const textWidth = ctx.measureText(labelText).width;
      
      // Draw text background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(x, y > fontSize ? y - fontSize - 5 : y + 5, textWidth + 6, fontSize + 4);
      
      // Draw text
      ctx.fillStyle = '#FFFFFF'; // White text
      ctx.fillText(labelText, x + 3, y > fontSize ? y - 5 : y + fontSize + 5);
    });
    
    // Show canvas with predictions
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
    
    // Add download options after showing results
    if (predictions && predictions.length > 0) {
      addDownloadOptions();
    }
  }

  // Function to clear results from server
  window.clearResults = function() {
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

  // UPDATED download options function that works on mobile
  function addDownloadOptions() {
    // Check if download section already exists
    const existingDownloadSection = document.querySelector('.download-options');
    if (existingDownloadSection) {
      return; // Don't create duplicates
    }
    
    // Create download options container
    const downloadDiv = document.createElement('div');
    downloadDiv.className = 'download-options';
    
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    
    // For both mobile and desktop: Use programmatic download approach
    const csvButton = document.createElement('button');
    csvButton.textContent = 'Download Results (CSV)';
    csvButton.className = 'download-button';
    csvButton.onclick = function() {
      // Show loading status
      this.textContent = 'Downloading...';
      this.disabled = true;
      
      // Use fetch API to download file
      fetch('/download_csv')
        .then(response => {
          if (!response.ok) {
            throw new Error('Download failed with status: ' + response.status);
          }
          return response.blob();
        })
        .then(blob => {
          // Create a download link and trigger it
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `gravel_detection_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
          document.body.appendChild(a);
          a.click();
          
          // Clean up
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          // Reset button
          csvButton.textContent = 'Download Results (CSV)';
          csvButton.disabled = false;
        })
        .catch(error => {
          console.error('Download error:', error);
          alert('Download failed. Please try again.');
          csvButton.textContent = 'Download Results (CSV)';
          csvButton.disabled = false;
        });
    };
    
    const jsonButton = document.createElement('button');
    jsonButton.textContent = 'Download Results (JSON)';
    jsonButton.className = 'download-button';
    jsonButton.onclick = function() {
      // Show loading status
      this.textContent = 'Downloading...';
      this.disabled = true;
      
      // Use fetch API to download file
      fetch('/download_json')
        .then(response => {
          if (!response.ok) {
            throw new Error('Download failed with status: ' + response.status);
          }
          return response.blob();
        })
        .then(blob => {
          // Create a download link and trigger it
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `gravel_detection_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
          document.body.appendChild(a);
          a.click();
          
          // Clean up
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          // Reset button
          jsonButton.textContent = 'Download Results (JSON)';
          jsonButton.disabled = false;
        })
        .catch(error => {
          console.error('Download error:', error);
          alert('Download failed. Please try again.');
          jsonButton.textContent = 'Download Results (JSON)';
          jsonButton.disabled = false;
        });
    };
    
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear Results';
    clearButton.className = 'clear-button';
    clearButton.onclick = function() {
      this.textContent = 'Clearing...';
      this.disabled = true;
      
      fetch('/clear_results')
        .then(response => {
          if (!response.ok) {
            throw new Error('Server error: ' + response.status);
          }
          return response.json();
        })
        .then(data => {
          alert(data.message);
          clearButton.textContent = 'Clear Results';
          clearButton.disabled = false;
        })
        .catch(error => {
          console.error('Error:', error);
          alert('Error clearing results. Please try again.');
          clearButton.textContent = 'Clear Results';
          clearButton.disabled = false;
        });
    };
    
    // Add buttons to container with some spacing
    downloadDiv.appendChild(csvButton);
    downloadDiv.appendChild(document.createTextNode(' '));
    downloadDiv.appendChild(jsonButton);
    downloadDiv.appendChild(document.createTextNode(' '));
    downloadDiv.appendChild(clearButton);
    
    // Add the download options to the page
    document.getElementById('cameraContainer').appendChild(downloadDiv);
  }
});