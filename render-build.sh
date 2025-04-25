#!/bin/bash
# Ensure pip, setuptools, and wheel are up-to-date
pip install --upgrade pip setuptools wheel

# Install the necessary system libraries before pip install
apt-get update && apt-get install -y libatlas-base-dev

# Install the Python dependencies
pip install -r requirements.txt
