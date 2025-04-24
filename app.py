from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import requests
import io
from PIL import Image
import os

app = Flask(__name__)
CORS(app)

# Roboflow settings
ROBOFLOW_API_KEY = "uqtcwMn8hclMSRPn3Tlc"
ROBOFLOW_MODEL = "gravels/1"
ROBOFLOW_VERSION = "Roboflow 3.0 Object Detection (Fast)"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/detect', methods=['POST'])
def detect():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    
    image_file = request.files['image']
    try:
        image_bytes = image_file.read()
        
        # Log the size of the image to ensure it's received correctly
        print(f"Received image of size: {len(image_bytes)} bytes")
        
        # Send image to Roboflow - updated URL format
        response = requests.post(
            f"https://api.roboflow.com/dataset/{ROBOFLOW_MODEL}/detect/{ROBOFLOW_VERSION}",
            params={"api_key": ROBOFLOW_API_KEY},
            files={"file": (image_file.filename, io.BytesIO(image_bytes), 'image/jpeg')}
        )
        
        if response.status_code == 200:
            predictions = response.json().get("predictions", [])
            return jsonify({"predictions": predictions})
        else:
            # Log the response for debugging
            print(f"Roboflow response status code: {response.status_code}")
            print(f"Roboflow response content: {response.text}")
            return jsonify({"error": f"Failed to contact Roboflow: {response.text}"}), response.status_code
    
    except Exception as e:
        # Log any exceptions that occur during image processing or request to Roboflow
        print(f"Error processing image or contacting Roboflow: {e}")
        return jsonify({"error": f"Server error during image processing: {str(e)}"}), 500
    

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
