#!/usr/bin/env bash
set -o errexit

# Upgrade pip and build tools
pip install --upgrade pip setuptools wheel

# Install numpy manually
pip install numpy==1.25.2 --no-cache-dir

# Install other dependencies
pip install -r requirements.txt
