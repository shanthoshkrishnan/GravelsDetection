#!/usr/bin/env bash
set -o errexit

# Upgrade pip and build tools
pip install --upgrade pip setuptools wheel

# Step 1: Pre-download compatible numpy binary (avoid build from source)
pip download numpy==1.25.2 --only-binary=:all: --platform manylinux2014_x86_64 --python-version 3.11 --implementation cp --abi cp311 --no-deps -d ./wheels

# Step 2: Install from the downloaded wheel
pip install ./wheels/numpy*.whl

# Step 3: Install OpenCV
pip install opencv-python-headless==4.5.3.56

# Step 4: Install the rest of the project dependencies
pip install -r requirements.txt
