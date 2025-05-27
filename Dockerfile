FROM ubuntu:24.04

RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections
RUN apt update && apt upgrade -y \
    && apt install -y --no-install-recommends \
                apt-transport-https \
                build-essential \
                ca-certificates \
                libssl-dev \
                git \
                curl \
                wget \
                docker.io \
                ssh \
                socat \
                golang-go \
                vim \
                nano \
                jq \
    && rm -rf /var/lib/apt/lists/*
COPY ./scripts/init.sh init.sh

RUN touch /.dockerenv \
    && NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    && echo >> /root/.bashrc \
    && echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> /root/.bashrc

RUN HOMEBREW_NO_ENV_HINTS=true /home/linuxbrew/.linuxbrew/bin/brew install node@22 supabase/tap/supabase \
    && HOMEBREW_NO_ENV_HINTS=true /home/linuxbrew/.linuxbrew/bin/brew cleanup \
    && echo >> /root/.bashrc \
    && echo 'export PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/opt/node@22/bin:$PATH"' >> /root/.bashrc

RUN echo >> /root/.bashrc \
    && echo "parse_git_branch() { " >> /root/.bashrc \
    && echo "  git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/(\\\1)/'" >> /root/.bashrc \
    && echo "}" >> /root/.bashrc \
    && echo >> /root/.bashrc \
    && echo "PS1='\${debian_chroot:+($debian_chroot)}\u@cde:\w \$(parse_git_branch)\$ '" >> /root/.bashrc \
    && echo "corepack enable" >> /root/.bashrc

RUN chmod +x init.sh
ENTRYPOINT ["/init.sh"]