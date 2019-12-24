FROM node:12-stretch

RUN apt update && apt install -y git ffmpeg && \
    git clone https://github.com/kotofurumiya/helmholtz.git && \
    cd helmholtz && \
    npm install

WORKDIR helmholtz

ENTRYPOINT ["node", "app.js"]