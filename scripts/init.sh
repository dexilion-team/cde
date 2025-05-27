#!/usr/bin/env sh
set -eu pipefail

if [ ! -d ~/.ssh ]; then
  echo "No SSH directory is mounted from the host, not loading SSH keys..."
else
  # Make sure SSH key has proper permissions
  chmod 600 ~/.ssh/* 2> /dev/null || true
  chmod 700 ~/.ssh 2> /dev/null || true
  ssh-add ~/.ssh/* 2> /dev/null || true
fi

# Check if the Docker socket is mounted
if [ ! -e "/var/run/docker.sock" ]; then
  echo "You need to bind mount your Docker socket to /var/run/docker.sock. For example: docker run -it --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock"
  exit 1
fi

export PATH="/home/linuxbrew/.linuxbrew/bin:$PATH"
HOMEBREW_NO_ENV_HINTS=true brew update || true
HOMEBREW_NO_ENV_HINTS=true brew upgrade || true

socat tcp-l:5432,fork,reuseaddr tcp:$REACT_NATIVE_PACKAGER_HOSTNAME:5432 &
socat tcp-l:54321,fork,reuseaddr tcp:$REACT_NATIVE_PACKAGER_HOSTNAME:54321 &
socat tcp-l:54322,fork,reuseaddr tcp:$REACT_NATIVE_PACKAGER_HOSTNAME:54322 &
socat tcp-l:54323,fork,reuseaddr tcp:$REACT_NATIVE_PACKAGER_HOSTNAME:54323 &
socat tcp-l:54324,fork,reuseaddr tcp:$REACT_NATIVE_PACKAGER_HOSTNAME:54324 &

cd ~

/bin/bash
