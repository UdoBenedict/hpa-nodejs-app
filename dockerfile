FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /OneDrive/Documents/K8s/nodejs-app

# Copy package files and install dependencies first (caches this step)
COPY package.json .
RUN npm install

# Copy the rest of the application code
COPY server.js .

# Production Best Practice: Run as a non-root user
USER node

# Expose the port the app runs on
EXPOSE 3000

# Command to start the application
CMD ["npm", "start"]