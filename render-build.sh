#!/usr/bin/env bash
set -o errexit

pip install --upgrade pip wheel setuptools

# Use a compatible, safe version with binary wheel
pip install numpy==1.25.2

pip install opencv-python-headless==4.5.3.56

pip install -r requirements.txt
