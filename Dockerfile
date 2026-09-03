# Dockerfile — containerizes the microservice for portable deployment
# on any IaaS VM or PaaS container runtime (e.g. AWS ECS/Fargate,
# Azure Container Apps, Google Cloud Run).
FROM node:22-slim

WORKDIR /usr/src/app
COPY package.json ./
COPY src ./src

ENV PORT=3000
ENV JWT_SECRET=change-me-in-production
EXPOSE 3000

# No npm install needed — the service uses only Node's built-in modules.
CMD ["node", "src/server.js"]
