#!/usr/bin/env bash
# Exit on error
set -o errexit

# Update pip
pip install --upgrade pip wheel setuptools

# Install specific versions from PyPI using binary-only approach
pip install --only-binary=:all: numpy>=1.24,<1.27

# Install opencv-python-headless last
pip install opencv-python-headless==4.5.3.56

# Install the rest
pip install -r requirements.txt