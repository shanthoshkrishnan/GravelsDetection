from flask import Flask, request, jsonify, render_template, Response, send_file, make_response
from flask_cors import CORS
import cv2
import os
import numpy as np
import threading
import base64
import io
import time
import logging
from PIL import Image
from inference import get_model
import json
import csv
from datetime import datetime
import tempfile

# Set up logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Allow all origins, methods and headers for better mobile compatibility
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "HEAD", "OPTIONS"], "allow_headers": "*"}})

# Roboflow settings
ROBOFLOW_API_KEY = "uqtcwMn8hclMSRPn3Tlc"
MODEL_ID = "gravels/1"

# Load model once globally
try:
    model = get_model(MODEL_ID, api_key=ROBOFLOW_API_KEY)
    logger.info("Model loaded successfully")
except Exception as e:
    logger.error(f"Error loading model: {e}")
    model = None

# Global variables for the video stream
camera = None
camera_active = False
output_frame = None
lock = threading.Lock()

# Add storage for detection results
detection_results = []
results_dir = "detection_results"
if not os.path.exists(results_dir):
    os.makedirs(results_dir)

def process_frame(frame):
    try:
        if model is None:
            logger.warning("Model not loaded, skipping inference")
            return frame, []
            
        # Convert to bytes format that Roboflow expects
        success, buffer = cv2.imencode('.jpg', frame)
        img_bytes = buffer.tobytes()
        
        # Run inference
        result = model.infer(image=img_bytes, confidence=0.4, iou_threshold=0.3)
        
        # Handle the response which is a list containing ObjectDetectionInferenceResponse
        predictions_list = []
        
        if isinstance(result, list) and len(result) > 0:
            # Get the first item which is the ObjectDetectionInferenceResponse
            response_obj = result[0]
            
            # Access the predictions from the response object
            if hasattr(response_obj, 'predictions'):
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                
                for pred in response_obj.predictions:
                    # Extract prediction details
                    x = float(pred.x)
                    y = float(pred.y)
                    width = float(pred.width)
                    height = float(pred.height)
                    conf = float(pred.confidence)
                    class_name = pred.class_name
                    
                    # Draw bounding box on the frame
                    x1 = int(x - width/2)
                    y1 = int(y - height/2)
                    x2 = int(x + width/2)
                    y2 = int(y + height/2)
                    
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    label = f"{class_name} {conf:.2f}"
                    cv2.putText(frame, label, (x1, y1 - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                    
                    # Add to predictions list for JSON response
                    prediction_data = {
                        "timestamp": timestamp,
                        "x": x,
                        "y": y,
                        "width": width,
                        "height": height,
                        "confidence": conf,
                        "class": class_name
                    }
                    
                    predictions_list.append(prediction_data)
                    
                    # Store the prediction in our history
                    detection_results.append(prediction_data)
        
        return frame, predictions_list
        
    except Exception as e:
        logger.error(f"Error processing frame: {e}")
        import traceback
        traceback.print_exc()
        return frame, []

def generate_frames():
    global output_frame, lock, camera, camera_active
    
    try:
        if camera is None:
            camera = cv2.VideoCapture(0)
            if not camera.isOpened():
                logger.warning("Failed to open camera. Trying with alternative index.")
                camera = cv2.VideoCapture(1)  # Try another camera index
                
            # Set lower resolution for better performance
            camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            
        camera_active = True
    except Exception as e:
        logger.error(f"Error initializing camera: {e}")
        camera_active = False
        yield (b'--frame\r\n'
               b'Content-Type: text/plain\r\n\r\n'
               b'Camera initialization failed\r\n')
        return
    
    while camera_active:
        try:
            if camera is None or not camera.isOpened():
                logger.warning("Camera is not available")
                time.sleep(1)  # Wait before trying again
                continue
                
            success, frame = camera.read()
            if not success:
                logger.warning("Failed to read frame")
                time.sleep(0.1)  # Short delay before next attempt
                continue
            
            processed_frame, _ = process_frame(frame)
            
            with lock:
                output_frame = processed_frame.copy()
            
            ret, buffer = cv2.imencode('.jpg', output_frame)
            frame_bytes = buffer.tobytes()
            
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                   
        except Exception as e:
            logger.error(f"Error in generate_frames: {e}")
            time.sleep(0.5)  # Add delay to avoid tight loop on error

# Basic routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/toggle_camera', methods=['POST', 'OPTIONS'])
def toggle_camera():
    global camera, camera_active
    
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', '*')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
        
    try:
        if camera_active:
            camera_active = False
            if camera is not None:
                camera.release()
                camera = None
            logger.info("Camera stopped")
            return jsonify({"status": "Camera stopped"})
        else:
            # Camera will be initialized in generate_frames
            camera_active = True
            logger.info("Camera started")
            return jsonify({"status": "Camera started"})
    except Exception as e:
        logger.error(f"Error toggling camera: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/detect', methods=['POST', 'OPTIONS'])
def detect():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', '*')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
        
    if 'image' not in request.files and 'image' not in request.form:
        logger.warning("No image provided in request")
        return jsonify({"error": "No image provided"}), 400
    
    try:
        # Handle both file upload and base64 encoded image
        if 'image' in request.files:
            image_file = request.files['image']
            image_bytes = image_file.read()
            logger.info(f"Received image file of size: {len(image_bytes)} bytes")
        else:
            # Handle base64 encoded image from mobile devices
            base64_image = request.form['image']
            # Remove data URL prefix if present
            if 'base64,' in base64_image:
                base64_image = base64_image.split('base64,')[1]
            image_bytes = base64.b64decode(base64_image)
            logger.info(f"Received base64 image of size: {len(image_bytes)} bytes")
        
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            logger.warning("Could not decode image")
            return jsonify({"error": "Could not decode image"}), 400
            
        # Handle image orientation for mobile devices
        # Try to open with PIL to check for EXIF orientation
        try:
            pil_img = Image.open(io.BytesIO(image_bytes))
            if hasattr(pil_img, '_getexif') and pil_img._getexif() is not None:
                exif = dict(pil_img._getexif().items())
                orientation = exif.get(274, 1)  # 274 is the EXIF orientation tag
                
                # Rotate according to EXIF orientation
                if orientation == 3:
                    img = cv2.rotate(img, cv2.ROTATE_180)
                elif orientation == 6:
                    img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
                elif orientation == 8:
                    img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
        except Exception as e:
            logger.warning(f"Error handling EXIF orientation: {e}")
        
        processed_frame, predictions = process_frame(img)
        
        _, buffer = cv2.imencode('.jpg', processed_frame)
        base64_img = base64.b64encode(buffer).decode('utf-8')
        
        # Return processed image and predictions
        return jsonify({
            "image": base64_img,
            "predictions": predictions
        })
        
    except Exception as e:
        logger.error(f"Error processing image: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# Download routes with improved handling for mobile devices
@app.route('/download_csv', methods=['GET', 'HEAD', 'OPTIONS'])
def download_csv():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', '*')
        response.headers.add('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        return response
        
    # Log request details
    logger.info(f"Download CSV request: {request.method} {request.path}")
    logger.info(f"Headers: {request.headers}")
    
    # Handle HEAD request for mobile browsers that check before downloading
    if request.method == 'HEAD':
        response = make_response('')
        response.headers["Content-Type"] = "text/csv"
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
    
    try:
        if len(detection_results) == 0:
            logger.warning("No detection results available for CSV download")
            return jsonify({"error": "No detection results available"}), 404
            
        # Directly create the CSV content in memory
        csv_data = io.StringIO()
        fieldnames = ['timestamp', 'class', 'confidence', 'x', 'y', 'width', 'height']
        writer = csv.DictWriter(csv_data, fieldnames=fieldnames)
        
        writer.writeheader()
        for result in detection_results:
            writer.writerow(result)
            
        csv_content = csv_data.getvalue()
        csv_data.close()
        
        # Log the CSV content length
        logger.info(f"Generated CSV content length: {len(csv_content)}")
        
        # Create response with CSV data
        filename = f"gravel_detection_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        response = make_response(csv_content)
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        response.headers["Content-Type"] = "text/csv"
        response.headers["Content-Length"] = str(len(csv_content))
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["Access-Control-Allow-Origin"] = "*"
        
        logger.info(f"Sending CSV response with headers: {response.headers}")
        return response
    
    except Exception as e:
        logger.error(f"Error generating CSV: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/download_json', methods=['GET', 'HEAD', 'OPTIONS'])
def download_json():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', '*')
        response.headers.add('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        return response
        
    # Log request details
    logger.info(f"Download JSON request: {request.method} {request.path}")
    
    # Handle HEAD request for mobile browsers that check before downloading
    if request.method == 'HEAD':
        response = make_response('')
        response.headers["Content-Type"] = "application/json"
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
    
    try:
        if len(detection_results) == 0:
            logger.warning("No detection results available for JSON download")
            return jsonify({"error": "No detection results available"}), 404
            
        # Directly create JSON in memory
        json_content = json.dumps(detection_results, indent=4)
        
        # Create response with JSON data
        filename = f"gravel_detection_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        response = make_response(json_content)
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        response.headers["Content-Type"] = "application/json"
        response.headers["Content-Length"] = str(len(json_content))
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["Access-Control-Allow-Origin"] = "*"
        
        return response
    
    except Exception as e:
        logger.error(f"Error generating JSON: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# API route for getting results without downloading
@app.route('/api/results', methods=['GET', 'OPTIONS'])
def api_results():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', '*')
        response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
        return response
        
    # Return the results as JSON
    response = jsonify(detection_results)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

@app.route('/get_results')
def get_results():
    """Return current detection results as JSON without downloading"""
    return jsonify(detection_results)

@app.route('/clear_results', methods=['GET', 'POST', 'OPTIONS'])
def clear_results():
    global detection_results
    
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', '*')
        response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        return response
        
    detection_results = []
    logger.info("Detection results cleared")
    return jsonify({"message": "Detection results cleared"})

# Health check endpoint
@app.route('/health')
def health_check():
    status = {
        "status": "ok",
        "camera_active": camera_active,
        "model_loaded": model is not None,
        "results_count": len(detection_results),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    return jsonify(status)

# Error handlers
@app.errorhandler(404)
def not_found(error):
    logger.warning(f"404 error: {request.path}")
    return jsonify({"error": "Not found", "path": request.path}), 404

@app.errorhandler(500)
def server_error(error):
    logger.error(f"500 error: {error}")
    return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    # Set threaded=True for better mobile compatibility
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
