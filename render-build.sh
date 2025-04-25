#!/usr/bin/env bash
set -o errexit

# Upgrade core tools
pip install --upgrade pip wheel setuptools

# Install a known good binary wheel
pip install numpy==1.25.2 --prefer-binary

# Install OpenCV
pip install opencv-python-headless==4.5.3.56

# Install your project dependencies
pip install -r requirements.txt
