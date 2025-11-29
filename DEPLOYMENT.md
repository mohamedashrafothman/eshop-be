# Deployment Guide

This guide provides instructions for deploying the E-Shop Backend API to various environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Deployment Options](#deployment-options)
  - [Docker Deployment](#docker-deployment)
  - [Traditional Server Deployment](#traditional-server-deployment)
  - [Cloud Platform Deployment](#cloud-platform-deployment)
- [Production Checklist](#production-checklist)
- [Monitoring and Maintenance](#monitoring-and-maintenance)

## Prerequisites

Before deploying, ensure you have:

- Node.js >= 16.0.0
- MongoDB >= 4.0 (or MongoDB Atlas account)
- Domain name (for production)
- SSL certificate (for HTTPS)
- Email service credentials (SMTP)
- OAuth credentials (Google, Facebook - if using social login)

## Environment Setup

### 1. Production Environment Variables

Create a `.env` file with production values:

```env
# Application
APP_NAME="E-Shop"
APP_PORT=8080
APP_HOST=0.0.0.0
APP_PROTOCOL=https
APP_URL=https://api.yourdomain.com

# Frontend
APP_FRONT_END_URL=https://yourdomain.com

# Database (Use MongoDB Atlas or your production MongoDB)
DB_URL=mongodb+srv://username:password@cluster.mongodb.net/eshop?retryWrites=true&w=majority

# CORS
CORS_ALLOWED_ORIGINS=https://yourdomain.com

# Session (Generate strong random strings)
SESSION_SECRET=your-super-secret-session-key-here
SESSION_TIMEOUT_IN_HOURS=24

# JWT (Generate strong random strings)
JWT_ACCESS_TOKEN_SECRET=your-super-secret-jwt-access-key-here
JWT_ACCESS_TOKEN_EXPIRES_IN_MINUTES=30
JWT_REFRESH_TOKEN_SECRET=your-super-secret-jwt-refresh-key-here
JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS=7

# Password
PASSWORD_HASH_ROUNDS=12

# Email (Use production SMTP service)
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=your-sendgrid-api-key
EMAIL_SENDER=noreply@yourdomain.com

# Rate Limiting
RATE_LIMITER_TIME_LIMIT_IN_MINUTES=5
RATE_LIMITER_MAX_REQUESTS=100

# File Upload
UPLOAD_STORAGE=./public/storage
ATTACHMENT_MAX_SIZE_IN_MB=5

# OAuth (Optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FACEBOOK_CLIENT_ID=your-facebook-client-id
FACEBOOK_CLIENT_SECRET=your-facebook-client-secret

# Google reCAPTCHA (Optional)
RECAPTCHA_KEY=your-recaptcha-site-key
RECAPTCHA_SECRET=your-recaptcha-secret-key
```

### 2. Generate Secure Secrets

Generate strong random secrets for production:

```bash
# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate JWT_ACCESS_TOKEN_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate JWT_REFRESH_TOKEN_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Deployment Options

### Docker Deployment

#### Option 1: Docker Compose (Recommended for VPS)

1. **Clone the repository on your server:**

```bash
git clone https://github.com/mohamedashrafothman/eshop-be.git
cd eshop-be
```

2. **Create production `.env` file:**

```bash
cp .env.example .env
# Edit .env with production values
nano .env
```

3. **Build and start containers:**

```bash
docker-compose up -d
```

4. **Check logs:**

```bash
docker-compose logs -f api
```

5. **Stop containers:**

```bash
docker-compose down
```

#### Option 2: Docker Hub

1. **Build and push to Docker Hub:**

```bash
docker build -t yourusername/eshop-be:latest .
docker push yourusername/eshop-be:latest
```

2. **Pull and run on production server:**

```bash
docker pull yourusername/eshop-be:latest
docker run -d \
  --name eshop-api \
  -p 8080:8080 \
  --env-file .env \
  yourusername/eshop-be:latest
```

### Traditional Server Deployment

#### Ubuntu/Debian Server

1. **Install Node.js:**

```bash
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. **Install MongoDB (or use MongoDB Atlas):**

```bash
# Follow MongoDB installation guide for your OS
# Or use MongoDB Atlas cloud database
```

3. **Clone and setup:**

```bash
git clone https://github.com/mohamedashrafothman/eshop-be.git
cd eshop-be
npm install
cp .env.example .env
# Edit .env with production values
nano .env
```

4. **Build the application:**

```bash
npm run build
```

5. **Install PM2 for process management:**

```bash
sudo npm install -g pm2
```

6. **Start the application:**

```bash
pm2 start build/bin/www.js --name eshop-api
pm2 save
pm2 startup
```

7. **Setup Nginx as reverse proxy:**

```bash
sudo apt-get install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/eshop-api
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

8. **Enable the site:**

```bash
sudo ln -s /etc/nginx/sites-available/eshop-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

9. **Setup SSL with Let's Encrypt:**

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

### Cloud Platform Deployment

#### Heroku

1. **Install Heroku CLI:**

```bash
npm install -g heroku
```

2. **Login and create app:**

```bash
heroku login
heroku create eshop-api
```

3. **Add MongoDB addon:**

```bash
heroku addons:create mongolab:sandbox
```

4. **Set environment variables:**

```bash
heroku config:set SESSION_SECRET=your-secret
heroku config:set JWT_ACCESS_TOKEN_SECRET=your-secret
# Set all other environment variables
```

5. **Deploy:**

```bash
git push heroku main
```

#### AWS Elastic Beanstalk

1. **Install EB CLI:**

```bash
pip install awsebcli
```

2. **Initialize EB:**

```bash
eb init -p node.js eshop-api
```

3. **Create environment:**

```bash
eb create eshop-api-env
```

4. **Set environment variables:**

```bash
eb setenv SESSION_SECRET=your-secret JWT_ACCESS_TOKEN_SECRET=your-secret
```

5. **Deploy:**

```bash
eb deploy
```

#### DigitalOcean App Platform

1. **Connect your GitHub repository**
2. **Configure build settings:**
   - Build Command: `npm run build`
   - Run Command: `npm start`
3. **Set environment variables in the dashboard**
4. **Deploy**

## Production Checklist

Before going live, verify:

### Security

- [ ] All secrets are strong and unique
- [ ] HTTPS is enabled
- [ ] CORS is configured for your domain only
- [ ] Rate limiting is enabled
- [ ] Database has authentication enabled
- [ ] Environment variables are not committed to git
- [ ] Error messages don't expose sensitive information

### Performance

- [ ] Database indexes are created
- [ ] Compression is enabled
- [ ] Static files are served efficiently
- [ ] Caching headers are configured
- [ ] Connection pooling is optimized

### Monitoring

- [ ] Logging is configured
- [ ] Error tracking is setup (e.g., Sentry)
- [ ] Uptime monitoring is enabled
- [ ] Performance monitoring is active
- [ ] Backup strategy is in place

### Functionality

- [ ] All API endpoints are tested
- [ ] Email sending works
- [ ] File uploads work
- [ ] Payment integration is tested
- [ ] Social login works (if enabled)

## Monitoring and Maintenance

### Log Management

**Using PM2:**

```bash
pm2 logs eshop-api
pm2 logs eshop-api --lines 100
```

**Using Docker:**

```bash
docker-compose logs -f api
docker-compose logs --tail=100 api
```

### Database Backups

**MongoDB backup:**

```bash
# Backup
mongodump --uri="mongodb://localhost:27017/eshop" --out=/backup/$(date +%Y%m%d)

# Restore
mongorestore --uri="mongodb://localhost:27017/eshop" /backup/20240101
```

**Automated backups with cron:**

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * mongodump --uri="mongodb://localhost:27017/eshop" --out=/backup/$(date +\%Y\%m\%d)
```

### Updates and Maintenance

**Update dependencies:**

```bash
npm update
npm audit fix
```

**Update application:**

```bash
git pull origin main
npm install
npm run build
pm2 restart eshop-api
```

### Health Checks

The API includes a health check endpoint:

```
GET /health
```

Use this for monitoring and load balancer health checks.

### Scaling

**Horizontal Scaling with PM2:**

```bash
pm2 start build/bin/www.js -i max --name eshop-api
```

**Using Docker Swarm:**

```bash
docker swarm init
docker stack deploy -c docker-compose.yml eshop
docker service scale eshop_api=3
```

## Troubleshooting

### Common Issues

**Port already in use:**

```bash
# Find process using port 8080
lsof -i :8080
# Kill the process
kill -9 <PID>
```

**MongoDB connection issues:**

- Check MongoDB is running
- Verify connection string in `.env`
- Check firewall rules
- Verify network connectivity

**Permission issues:**

```bash
# Fix file permissions
sudo chown -R $USER:$USER /path/to/eshop-be
```

## Support

For deployment issues:

- Check the logs first
- Review the [README.md](README.md)
- Open an issue on GitHub
- Contact: <mohamedashrafothman@gmail.com>

## Additional Resources

- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
