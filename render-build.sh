#!/usr/bin/env bash
# Exit on error
set -o errexit

# Update pip, wheel, and setuptools
pip install --upgrade pip wheel setuptools

# Install specific numpy version (quoted properly)
pip install --only-binary=:all: "numpy>=1.24,<1.27"

# Install OpenCV
pip install opencv-python-headless==4.5.3.56

# Install remaining dependencies
pip install -r requirements.txt
