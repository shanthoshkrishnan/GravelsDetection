
# 🪨 Gravel Size Detection - Live Image & Video Classifier

> A real-time image classification system to detect gravel size from both live video feeds and file uploads, powered by MobileNetV2 and deployed on Render.

[🌐 Live App](https://gravelssizedetection.onrender.com/)

---

## 📸 Features

- 🔁 **Real-Time Detection from Live Camera Feeds**
  - Works on both **laptops** and **mobile phones**
  - Supports **camera switching** (front/rear)
  - In-browser predictions using webcam

- 📁 **File Upload Detection**
  - Upload any gravel image for instant predictions
  - Image is processed and shown with annotations

- 🧠 **Deep Learning Model**
  - Built on **MobileNetV2 (ImageNet pretrained)**
  - Trained on a custom gravel dataset with transfer learning

- 🖼️ **Visual Result Display**
  - Shows uploaded image with:
    - Predicted class label
    - Confidence score
  - Results displayed directly below upload form using HTML/CSS

- 📦 **Logging & Export**
  - Each prediction is logged with:
    - Timestamp
    - Image filename or feed source
    - Predicted class
    - Confidence
  - Logged in both:
    - ✅ `CSV`
    - ✅ `JSON`
  - Option to clear logs on-demand

- 🌍 **Deployed on Render**
  - Dockerized and auto-built from GitHub
  - Uses `Flask`, `OpenCV`, `TensorFlow`, and `JavaScript` for camera access

---

## 🏗️ Folder Structure

```
gravel-size-detection/
├── detection_results/       # CSV & JSON logs
├── static/                  # Static files (CSS, JS, uploaded images)
├── templates/               # HTML templates (index.html)
│
├── app.py                   # Main Flask app
├── dockerfile               # Docker config
├── render.yaml              # Render deployment config
├── render-build.sh          # 🛠️ Shell script for custom setup during Render build
├── requirements.txt         # Python dependencies
├── runtime.txt              # Python version for compatibility
├── README.md                # Project documentation
└── .dockerignore            # Ignore rules for Docker
```

---

## 🧠 Model Architecture

### Transfer Learning: **MobileNetV2 + Custom Classifier Head**

- **Base**: `MobileNetV2` (frozen, pretrained on ImageNet)
- **Custom Layers**:
  - `GlobalAveragePooling2D`
  - `Dense(128, relu)`
  - `Dropout(0.2)`
  - `Dense(num_classes, softmax)`
- **Loss Function**: `categorical_crossentropy`
- **Optimizer**: `adam`
- **Training Tool**: `ImageDataGenerator` (with augmentation)
- **Saved Model**: `gravel_classifier_model.h5`

---

## 🧪 Logging Format

### ✅ JSON (`detection_results/latest_detection.json`)
```json
{
  "timestamp": "2025-07-13T10:45:32",
  "filename": "uploaded_img1.jpg",
  "predicted_class": "Medium Gravel",
  "confidence": 92.14
}
```

### ✅ CSV (`detection_results/logs.csv`)
```csv
timestamp,filename,predicted_class,confidence
2025-07-13 10:45:32,uploaded_img1.jpg,Medium Gravel,92.14
```

---

## 💡 Technologies Used

| Tech           | Purpose                          |
|----------------|----------------------------------|
| **Flask**      | Web server + API backend         |
| **TensorFlow** | Deep learning + model inference  |
| **OpenCV**     | Live webcam handling             |
| **JavaScript** | Camera switching + frontend UX   |
| **HTML/CSS**   | Frontend + annotations display   |
| **Docker**     | Deployment container             |
| **Render**     | Hosting + Build + Live Deploy    |

---

## 📦 How to Run Locally

```bash
git clone https://github.com/yourname/gravel-size-detection.git
cd gravel-size-detection

pip install -r requirements.txt
python app.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## 🚀 Deployment Notes

- ✅ **Hosted on [Render](https://render.com)**
- Uses:
  - `render.yaml` — defines service type, build/start commands
  - `render-build.sh` — custom build steps (e.g., mkdir, model download)
- Optional:
  - `Dockerfile` — for full control (alternative to render.yaml)
- 📁 **Model Handling**
  - Place `gravel_classifier_model.h5` in root **or**
  - Auto-download via `render-build.sh`
- 📊 **Logs**
  - Saved to `detection_results/logs.csv` & `latest_detection.json`

---

## 🙋 Contact & Credits

Developed by **Shanthosh Krishnan**  
For queries or repo access, contact via [Email](mailto:shanthosh.krishnan@outlook.com).

