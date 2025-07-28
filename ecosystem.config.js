module.exports = {
  apps: [{
    name: 'server',
    script: './server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      PORT: 5000,
      NODE_ENV: 'production',
    }
  }]
};
