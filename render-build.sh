#!/usr/bin/env bash
# Exit on error
set -e

# Ensure pip, setuptools, and wheel are up-to-date
pip install --upgrade pip setuptools wheel

# Install the Python dependencies
pip install -r requirements.txt