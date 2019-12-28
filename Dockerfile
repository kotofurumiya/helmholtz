FROM node:8-stretch

COPY app.js package.json package-lock.json /helmholtz/

WORKDIR /helmholtz

RUN apt update && apt install -y ffmpeg && \
    npm install

ENTRYPOINT ["node", "app.js"]