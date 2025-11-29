# E-Shop Backend API

A comprehensive, production-ready e-commerce backend API built with Node.js, Express.js, TypeScript, and MongoDB. This project provides a complete solution for managing an online store with advanced features including authentication, product management, shopping cart, orders, payments, and more.

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Running the Application](#-running-the-application)
- [Docker Support](#-docker-support)
- [API Documentation](#-api-documentation)
- [Project Structure](#-project-structure)
- [Available Scripts](#-available-scripts)
- [Security Features](#-security-features)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

### Core E-Commerce Features

- **Product Management**: Complete CRUD operations for products with categories, brands, and reviews
- **Shopping Cart**: Add, update, remove items with real-time price calculations
- **Order Management**: Order creation, tracking, and status updates
- **Wishlist**: Save favorite products for later
- **Reviews & Ratings**: Customer reviews and product ratings system
- **Coupons & Discounts**: Promotional codes and discount management
- **Inventory Management**: Stock tracking and availability

### User Management

- **Authentication**: JWT-based authentication with access and refresh tokens
- **Social Login**: Integration with Google and Facebook OAuth
- **User Profiles**: Complete user profile management
- **Address Management**: Multiple shipping/billing addresses per user
- **Password Recovery**: Secure password reset via email

### Location & Shipping

- **Geographic Data**: Countries, states, cities, and zones management
- **Shipping Methods**: Multiple shipping options with cost calculation
- **Tax Management**: Tax rules based on location

### Payment & Checkout

- **Payment Methods**: Support for multiple payment gateways
- **Order Processing**: Complete checkout flow with payment integration
- **Invoice Generation**: Automated invoice creation

### Security & Performance

- **Rate Limiting**: Protection against brute force and DDoS attacks
- **CSRF Protection**: Cross-Site Request Forgery prevention
- **XSS Protection**: Cross-Site Scripting attack prevention
- **MongoDB Injection Protection**: Sanitization of user inputs
- **Helmet.js**: Security headers configuration
- **Data Validation**: Comprehensive input validation using express-validator
- **Session Management**: Secure session handling with MongoDB store

### Developer Experience

- **TypeScript**: Full TypeScript support with strict type checking
- **API Documentation**: Auto-generated Swagger/OpenAPI documentation
- **Internationalization**: Multi-language support with i18n
- **Logging**: Request logging with Morgan
- **Error Handling**: Centralized error handling middleware
- **Code Quality**: ESLint, Prettier, and Husky pre-commit hooks
- **Versioning**: Automated versioning with standard-version

## 🛠 Tech Stack

### Core Technologies

- **Runtime**: Node.js (>= 16.0.0)
- **Framework**: Express.js 4.x
- **Language**: TypeScript 5.x
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Passport.js (Local, JWT, Google, Facebook)

### Key Dependencies

- **Security**: helmet, xss-clean, express-mongo-sanitize, hpp, csurf
- **Validation**: express-validator
- **File Upload**: multer with image processing (jimp)
- **Email**: nodemailer with HTML templates (pug)
- **Session**: express-session with connect-mongo
- **Rate Limiting**: express-rate-limit with MongoDB store
- **Documentation**: swagger-jsdoc, swagger-ui-express
- **Utilities**: lodash, moment, nanoid, bcryptjs

### Development Tools

- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier
- **Git Hooks**: Husky with lint-staged
- **Commit Linting**: commitlint with conventional commits
- **Hot Reload**: nodemon
- **Containerization**: Docker & Docker Compose

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: >= 16.0.0
- **npm**: >= 8.0.0
- **MongoDB**: >= 4.0 (or use Docker)
- **Git**: Latest version

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/mohamedashrafothman/eshop-be.git
cd eshop-be
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration (see [Configuration](#-configuration) section).

## ⚙️ Configuration

The application uses environment variables for configuration. Here are the key settings:

### Application Settings

```env
APP_NAME="E-Shop"
APP_PORT=8080
APP_HOST=127.0.0.1
APP_PROTOCOL=http
```

### Database Configuration

```env
DB_HOST=localhost
DB_PORT=27017
DB_DATABASE=eshop
```

### Authentication & Security

```env
SESSION_SECRET=your-session-secret-here
JWT_ACCESS_TOKEN_SECRET=your-jwt-access-secret-here
JWT_REFRESH_TOKEN_SECRET=your-jwt-refresh-secret-here
PASSWORD_HASH_ROUNDS=12
```

### Social Authentication (Optional)

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FACEBOOK_CLIENT_ID=your-facebook-client-id
FACEBOOK_CLIENT_SECRET=your-facebook-client-secret
```

### Email Configuration

```env
EMAIL_HOST=smtp.mailtrap.io
EMAIL_PORT=465
EMAIL_USER=your-email-user
EMAIL_PASS=your-email-password
EMAIL_SENDER=eshop@domain.com
```

### Rate Limiting

```env
RATE_LIMITER_TIME_LIMIT_IN_MINUTES=5
RATE_LIMITER_MAX_REQUESTS=20
```

### File Upload

```env
UPLOAD_STORAGE=./public/storage
ATTACHMENT_MAX_SIZE_IN_MB=5
```

> **Note**: See `.env.example` for a complete list of configuration options.

## 🏃 Running the Application

### Development Mode

Start the application with hot-reload:

```bash
npm run dev
```

The API will be available at `http://localhost:8080`

### Production Mode

Build and start the application:

```bash
npm run build
npm start
```

### Other Commands

```bash
# Lint code
npm run lint

# Format code
npm run prettify

# Clean build directory
npm run clean
```

## 🐳 Docker Support

The project includes full Docker support for easy deployment and development.

### Using Docker Compose

Start all services (API + MongoDB):

```bash
npm run docker-compose-up
```

This will:

- Build the API container
- Start MongoDB with replica set configuration
- Set up networking between containers
- Enable hot-reload for development

Stop all services:

```bash
npm run docker-compose-down
```

### Docker Configuration

- **API Container**: Runs on port 8080
- **MongoDB Container**: Runs on port 27017 with replica set enabled
- **Volumes**: Persistent data storage for MongoDB
- **Watch Mode**: Automatic rebuild on package.json changes, live sync for source files

## 📚 API Documentation

The API documentation is automatically generated using Swagger/OpenAPI.

### Accessing Documentation

Once the application is running, visit:

```
http://localhost:8080/api-docs
```

### Swagger JSON

The raw OpenAPI specification is available at:

```
http://localhost:8080/api-docs/swagger.json
```

### API Versioning

All API endpoints are versioned under `/api/v1/`:

- **Authentication**: `/api/v1/auth/*`
- **Users**: `/api/v1/users/*`
- **Products**: `/api/v1/products/*`
- **Categories**: `/api/v1/categories/*`
- **Brands**: `/api/v1/brands/*`
- **Cart**: `/api/v1/cart/*`
- **Orders**: `/api/v1/orders/*`
- **Reviews**: `/api/v1/reviews/*`
- **Wishlists**: `/api/v1/wishlists/*`
- **Addresses**: `/api/v1/addresses/*`
- **Coupons**: `/api/v1/coupons/*`
- **Countries**: `/api/v1/countries/*`
- **States**: `/api/v1/states/*`
- **Cities**: `/api/v1/cities/*`
- **Zones**: `/api/v1/zones/*`
- **Taxes**: `/api/v1/taxes/*`
- **Payment Methods**: `/api/v1/payment-methods/*`
- **Shipping Methods**: `/api/v1/shipping-methods/*`
- **Policies**: `/api/v1/policies/*`

### Postman Collection

A complete Postman collection is included in the repository:

```
postman-collection.json
```

Import this file into Postman to test all API endpoints.

### Generating API Clients

You can automatically generate type-safe API clients in multiple languages (TypeScript, Python, Java, PHP, etc.) from the OpenAPI specification.

**See the complete guide:** [API_CLIENT_GENERATION.md](API_CLIENT_GENERATION.md)

Quick example for TypeScript:

```bash
# Download OpenAPI spec
curl http://localhost:8080/api-docs/swagger.json -o openapi.json

# Generate TypeScript client
npx @openapitools/openapi-generator-cli generate \
  -i openapi.json \
  -g typescript-axios \
  -o ./generated-client
```

## 📁 Project Structure

```
eshop-be/
├── src/
│   ├── @types/              # Custom TypeScript type definitions
│   ├── api-schemas/         # OpenAPI/Swagger schema definitions
│   ├── bin/                 # Application entry point
│   ├── config/              # Configuration files (database, swagger, etc.)
│   ├── controllers/         # Request handlers and business logic
│   ├── interfaces/          # TypeScript interfaces
│   ├── locales/             # Internationalization files
│   ├── middlewares/         # Express middlewares
│   │   ├── apiHeaders.ts    # API header management
│   │   ├── cors.ts          # CORS configuration
│   │   ├── csrf.ts          # CSRF protection
│   │   ├── errorHandlers.ts # Error handling
│   │   ├── logger.ts        # Request logging
│   │   ├── permission.ts    # Permission checking
│   │   ├── rateLimiter.ts   # Rate limiting
│   │   ├── session.ts       # Session management
│   │   ├── validator.ts     # Input validation
│   │   └── ...
│   ├── models/              # Mongoose models
│   │   ├── User.ts
│   │   ├── Product.ts
│   │   ├── Order.ts
│   │   ├── Cart.ts
│   │   ├── Category.ts
│   │   ├── Brand.ts
│   │   ├── Review.ts
│   │   └── ...
│   ├── routes/              # API route definitions
│   │   └── api/v1/          # Version 1 API routes
│   ├── services/            # Business logic services
│   ├── utils/               # Utility functions and helpers
│   └── app.ts               # Express app configuration
├── views/                   # Email templates (Pug)
├── public/                  # Static files
│   └── storage/             # Uploaded files
├── build/                   # Compiled TypeScript output
├── logs/                    # Application logs
├── .env                     # Environment variables (not in git)
├── .env.example             # Environment variables template
├── docker-compose.yaml      # Docker Compose configuration
├── Dockerfile               # Docker image definition
├── tsconfig.json            # TypeScript configuration
├── package.json             # Project dependencies and scripts
├── .eslintrc                # ESLint configuration
├── .prettierrc              # Prettier configuration
├── commitlint.config.js     # Commit message linting
└── README.md                # This file
```

## 📜 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot-reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run production build |
| `npm run clean` | Remove build directory |
| `npm run lint` | Run ESLint on source files |
| `npm run prettify` | Format code with Prettier |
| `npm run docker-compose-up` | Start Docker containers with watch mode |
| `npm run docker-compose-down` | Stop and remove Docker containers |
| `npm run release` | Create a new release version |
| `npm run release:minor` | Create a minor version release |
| `npm run release:patch` | Create a patch version release |
| `npm run release:major` | Create a major version release |

## 🔒 Security Features

This application implements multiple layers of security:

1. **Authentication & Authorization**
   - JWT-based stateless authentication
   - Refresh token rotation
   - Password hashing with bcrypt (12 rounds)
   - Social OAuth integration

2. **Input Validation & Sanitization**
   - express-validator for request validation
   - MongoDB injection prevention
   - XSS attack prevention
   - HPP (HTTP Parameter Pollution) protection

3. **Security Headers**
   - Helmet.js for secure HTTP headers
   - CORS configuration
   - CSRF token protection

4. **Rate Limiting**
   - Global rate limiting
   - Login-specific rate limiting
   - MongoDB-backed rate limit store

5. **Session Security**
   - Secure session management
   - MongoDB session store
   - Configurable session timeout

6. **Data Protection**
   - Sensitive data encryption
   - Secure password reset flow
   - Email verification

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using conventional commits (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

## 📄 License

ISC License

## 👤 Author

**Mohamed Ashraf Othman**

- Email: <mohamedashrafothman@gmail.com>
- GitHub: [@mohamedashrafothman](https://github.com/mohamedashrafothman)

## 🔗 Links

- **Repository**: [https://github.com/mohamedashrafothman/eshop-be](https://github.com/mohamedashrafothman/eshop-be)
- **Issues**: [https://github.com/mohamedashrafothman/eshop-be/issues](https://github.com/mohamedashrafothman/eshop-be/issues)

---

**Note**: This is a backend API project. For the frontend application, please refer to the corresponding frontend repository.
