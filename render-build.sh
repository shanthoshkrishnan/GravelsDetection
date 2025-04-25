#!/usr/bin/env bash
# Exit on error
set -o errexit

# Update pip
pip install --upgrade pip wheel setuptools

# Install pre-compiled numpy wheel directly
pip install https://files.pythonhosted.org/packages/5a/50/19332b6d3f2033a16553f921fff692bb700ff8028c42865c935e1d56c7b2/numpy-1.22.4-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl

# Install the rest
pip install -r requirements.txt