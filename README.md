# Dexilion Expo & Supabase Development Environment

This repository contains scripts to set up a consistent Docker-based development environment
with Expo and Supabase preloaded. The init scripts always update the utilities at start.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed and running
- (Optional) SSH keys you want to use with git (in your $HOME/.ssh directory)
- (Optional) A `.env.local` file with environment variables you want the CDE to have

## Notes

- The development environment mounts your local SSH keys to authenticate with GitHub inside the container
- The container includes all necessary dependencies for React Native and Expo development
- Port 8081 is mapped for the React Native/Expo development server

## Running the Environment

```
npx @dexilion/cde
```

## Troubleshooting

### SSH Key Issues

If you encounter SSH authentication issues inside the container:

1. Make sure your SSH keys are properly set up on your host machine
2. Check if your SSH key has the correct permissions:
   - On Windows: The scripts automatically fix permissions
   - On macOS/Linux: Ensure `chmod 600 ~/.ssh/id_rsa`

### Docker Socket Issues

If you encounter Docker socket access issues, make sure the /var/run/docker.sock
is properly mounted inside the container and the permissions are correct.

### Supabase Connection Issues

If you encounter issues with Supabase CLI commands inside the Docker container:

```bash
# Inside the Docker container, set up port forwarding to redirect connections 
# from localhost:54322 to the host machine
socat tcp-l:5432,fork,reuseaddr tcp:$REACT_NATIVE_PACKAGER_HOSTNAME:5432 &
socat tcp-l:54321,fork,reuseaddr tcp:$REACT_NATIVE_PACKAGER_HOSTNAME:54321 &
socat tcp-l:54322,fork,reuseaddr tcp:$REACT_NATIVE_PACKAGER_HOSTNAME:54322 &
socat tcp-l:54323,fork,reuseaddr tcp:$REACT_NATIVE_PACKAGER_HOSTNAME:54323 &
socat tcp-l:54324,fork,reuseaddr tcp:$REACT_NATIVE_PACKAGER_HOSTNAME:54324 &
```

## License

 The MIT License (MIT)

Copyright © 2025 Dexilion Kft.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
