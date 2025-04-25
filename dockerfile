FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libatlas-base-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Modify requirements.txt to exclude numpy
RUN grep -v "numpy" requirements.txt > requirements_no_numpy.txt

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir numpy==1.22.4 --only-binary=:all: && \
    pip install --no-cache-dir -r requirements_no_numpy.txt

# Copy application code
COPY . .

# Command to run the application
CMD ["python", "app.py"]