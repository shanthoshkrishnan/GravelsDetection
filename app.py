from flask import Flask, request, jsonify, render_template, Response, send_file, make_response
from flask_cors import CORS
import cv2
import os
import numpy as np
import threading
import base64
import io
from PIL import Image
from inference import get_model
import json
import csv
from datetime import datetime
import tempfile

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Roboflow settings
ROBOFLOW_API_KEY = "uqtcwMn8hclMSRPn3Tlc"
MODEL_ID = "gravels/1"

# Load model once globally
model = get_model(MODEL_ID, api_key=ROBOFLOW_API_KEY)

# Global variables for the video stream
camera = None
output_frame = None
lock = threading.Lock()

# Add storage for detection results
detection_results = []
results_dir = "detection_results"
if not os.path.exists(results_dir):
    os.makedirs(results_dir)

def process_frame(frame):
    try:
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
        print(f"Error processing frame: {e}")
        import traceback
        traceback.print_exc()
        return frame, []

def generate_frames():
    global output_frame, lock, camera
    
    if camera is None:
        try:
            camera = cv2.VideoCapture(0)
        except Exception as e:
            print(f"Error initializing camera: {e}")
            return
    
    while True:
        if camera is None or not camera.isOpened():
            print("Camera is not available")
            break
            
        success, frame = camera.read()
        if not success:
            print("Failed to read frame")
            break
        
        processed_frame, _ = process_frame(frame)
        
        with lock:
            output_frame = processed_frame.copy()
        
        ret, buffer = cv2.imencode('.jpg', output_frame)
        frame_bytes = buffer.tobytes()
        
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/detect', methods=['POST'])
def detect():
    if 'image' not in request.files and 'image' not in request.form:
        return jsonify({"error": "No image provided"}), 400
    
    try:
        # Handle both file upload and base64 encoded image
        if 'image' in request.files:
            image_file = request.files['image']
            image_bytes = image_file.read()
        else:
            # Handle base64 encoded image from mobile devices
            base64_image = request.form['image']
            # Remove data URL prefix if present
            if 'base64,' in base64_image:
                base64_image = base64_image.split('base64,')[1]
            image_bytes = base64.b64decode(base64_image)
        
        print(f"Received image of size: {len(image_bytes)} bytes")
        
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
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
            print(f"Error handling EXIF orientation: {e}")
        
        processed_frame, predictions = process_frame(img)
        
        _, buffer = cv2.imencode('.jpg', processed_frame)
        base64_img = base64.b64encode(buffer).decode('utf-8')
        
        # Return processed image and predictions
        return jsonify({
            "image": base64_img,
            "predictions": predictions
        })
        
    except Exception as e:
        print(f"Error processing image: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# Updated download routes for mobile compatibility
@app.route('/download_csv')
def download_csv():
    try:
        if len(detection_results) == 0:
            return jsonify({"error": "No detection results available"}), 404
            
        # Create a temporary file
        temp_fd, temp_path = tempfile.mkstemp(suffix='.csv')
        
        with os.fdopen(temp_fd, 'w', newline='') as csvfile:
            fieldnames = ['timestamp', 'class', 'confidence', 'x', 'y', 'width', 'height']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            writer.writeheader()
            for result in detection_results:
                writer.writerow(result)
        
        filename = f"gravel_detection_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        
        # Create proper response with correct headers
        response = make_response(send_file(temp_path, as_attachment=True, download_name=filename))
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        response.headers["Content-Type"] = "text/csv"
        
        # Clean up temp file after request
        @response.call_on_close
        def cleanup():
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
        return response
    
    except Exception as e:
        print(f"Error generating CSV: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/download_json')
def download_json():
    try:
        if len(detection_results) == 0:
            return jsonify({"error": "No detection results available"}), 404
            
        # Create a temporary file
        temp_fd, temp_path = tempfile.mkstemp(suffix='.json')
        
        with os.fdopen(temp_fd, 'w') as jsonfile:
            json.dump(detection_results, jsonfile, indent=4)
        
        filename = f"gravel_detection_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        # Create proper response with correct headers
        response = make_response(send_file(temp_path, as_attachment=True, download_name=filename))
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        response.headers["Content-Type"] = "application/json"
        
        # Clean up temp file after request
        @response.call_on_close
        def cleanup():
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
        return response
    
    except Exception as e:
        print(f"Error generating JSON: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/get_results')
def get_results():
    """Return current detection results as JSON without downloading"""
    return jsonify(detection_results)

@app.route('/clear_results')
def clear_results():
    global detection_results
    detection_results = []
    return jsonify({"message": "Detection results cleared"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    # Set threaded=True for better mobile compatibility
    app.run(host='0.0.0.0', port=port, debug=True, threaded=True)