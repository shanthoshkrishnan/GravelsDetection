#!/usr/bin/env bash
# Exit on error
set -e

# Ensure pip, setuptools, and wheel are up-to-date
pip install --upgrade pip setuptools wheel

# Install NumPy first using binary package
pip install numpy==1.24.3 --only-binary=numpy

# Install the rest of the Python dependencies
pip install -r requirements.txt